(() => {
  const DEBOUNCE_MS = 150;
  // invariant: igual ao MAX_CONTENTS_BYTES do main; acima disso o buffer nem sai da janela e o blame usa o arquivo em disco.
  const MAX_CONTENTS_CHARS = 2 * 1024 * 1024;
  const POLL_MS = 500;
  const STORAGE_KEY = 'orca-git-blame:enabled';
  const ACTION_ID = 'orca-git-blame.toggle';
  const tracked = new WeakSet();
  const controllers = new Set();
  let enabled = readEnabled();
  let translator = null;

  function readEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  }

  function setEnabled(value) {
    enabled = value;
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {}
    controllers.forEach((c) => c.apply());
  }

  // why: o popout do editor é outra janela com o mesmo localStorage; o evento storage mantém as duas no mesmo estado.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    enabled = readEnabled();
    controllers.forEach((c) => c.apply());
  });

  if (!window.orcaGitBlame) {
    console.warn('[orca-git-blame] preload bridge missing; inline blame disabled.');
    return;
  }

  const style = document.createElement('style');
  style.textContent = '.orca-git-blame-ghost{opacity:.45;font-style:italic;}';
  document.head.appendChild(style);

  function track(monaco, editor) {
    if (tracked.has(editor)) return;
    tracked.add(editor);
    const decorations = editor.createDecorationsCollection();
    let timer = null;
    let requestId = 0;
    // why: o blame é por linha e versão do texto; mover o cursor dentro da mesma linha não pode apagar e refazer o que já está certo.
    let currentKey = null;
    const keyOf = (line) => `${editor.getModel()?.id}:${editor.getModel()?.getVersionId()}:${line}`;

    const clear = () => {
      requestId++;
      currentKey = null;
      decorations.clear();
    };

    const update = async () => {
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!enabled || !model || !position || model.uri.scheme !== 'file') return clear();
      const id = ++requestId;
      const line = position.lineNumber;
      let blame = null;
      try {
        blame = await window.orcaGitBlame.blameLine({
          editorId: editor.getId(),
          filePath: model.uri.fsPath,
          line,
          contents: model.getValueLength() <= MAX_CONTENTS_CHARS ? model.getValue() : undefined,
        });
      } catch (error) {
        console.debug('[orca-git-blame]', error);
      }
      // invariant: só a resposta do pedido mais recente pode desenhar; respostas atrasadas de linhas antigas são descartadas.
      if (id !== requestId || editor.getModel() !== model) return;
      const text = translator.formatBlame(blame);
      if (!text || line > model.getLineCount()) return decorations.clear();
      const column = model.getLineMaxColumn(line);
      decorations.set([
        {
          range: new monaco.Range(line, column, line, column),
          options: {
            description: 'orca-git-blame',
            // why: o Monaco descarta texto injetado de range vazio sem essa flag (getAllInjectedText filtra por showIfCollapsed).
            showIfCollapsed: true,
            after: {
              content: `    ${text}`,
              inlineClassName: 'orca-git-blame-ghost',
              cursorStops: monaco.editor.InjectedTextCursorStops?.None,
            },
          },
        },
      ]);
    };

    const schedule = () => {
      clearTimeout(timer);
      clear();
      if (!enabled) return;
      currentKey = keyOf(editor.getPosition()?.lineNumber);
      timer = setTimeout(update, DEBOUNCE_MS);
    };

    const onCursor = (event) => {
      if (currentKey !== null && currentKey === keyOf(event.position.lineNumber)) return;
      schedule();
    };

    let action = null;
    // why: o Monaco não troca o label de uma action registrada; para o menu dizer "Mostrar"/"Ocultar" a action é recriada a cada mudança.
    const registerAction = () => {
      action?.dispose();
      action = editor.addAction({
        id: ACTION_ID,
        label: translator.t(enabled ? 'hide' : 'show'),
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyB],
        contextMenuGroupId: '8_git',
        contextMenuOrder: 1,
        run: () => setEnabled(!enabled),
      });
    };

    const controller = {
      apply() {
        registerAction();
        if (enabled) schedule();
        else {
          clearTimeout(timer);
          clear();
        }
      },
    };
    controllers.add(controller);

    const subscriptions = [
      editor.onDidChangeCursorPosition(onCursor),
      editor.onDidChangeModel(schedule),
      editor.onDidChangeModelContent(schedule),
    ];
    editor.onDidDispose(() => {
      clearTimeout(timer);
      controllers.delete(controller);
      action?.dispose();
      subscriptions.forEach((s) => s.dispose());
    });
    controller.apply();
  }

  function attach(monaco) {
    translator = globalThis.__orcaGitBlameI18n.createTranslator(globalThis.__orcaI18n);
    translator.onChange(() => controllers.forEach((c) => c.apply()));
    monaco.editor.getEditors().forEach((editor) => track(monaco, editor));
    // why: onDidCreateEditor dispara dentro do construtor do editor, antes do serviço de keybinding existir; addAction ali é ignorado em silêncio.
    monaco.editor.onDidCreateEditor((editor) => queueMicrotask(() => track(monaco, editor)));
    console.info(`[orca-git-blame] active (locale: ${translator.locale()}).`);
  }

  // why: o Orca carrega o Monaco sob demanda; __orcaMonaco é publicado pelo patch do chunk monaco-setup quando ele carrega.
  const poll = setInterval(() => {
    const monaco = globalThis.__orcaMonaco;
    if (monaco?.editor?.onDidCreateEditor) {
      clearInterval(poll);
      attach(monaco);
    }
  }, POLL_MS);
})();
