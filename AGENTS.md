# AGENTS.md

Adiciona ao **Orca IDE** (stablyai/orca, Electron) o `git blame` da linha do cursor como texto fantasma no fim da linha: `author, 2 days ago • commit summary` (no idioma do Orca).

A API de plugins do Orca (`pluginApi: 1`) **não tem acesso ao editor** (sem evento de cursor, sem decoração; o worker roda em outro processo). Por isso o projeto não é um plugin: é um **patcher** do `resources/app.asar` com um launcher que refaz o patch quando o Orca atualiza. Linux: patcheia uma cópia extraída do AppImage (somente leitura). Windows: patcheia a instalação NSIS no lugar, com backup `app.asar.orig`. macOS não é suportado (assinatura de código). Objetivo de longo prazo: virar PR no repo do Orca.

## Estrutura

| Caminho | Papel |
|---|---|
| `patch/blame.cjs` | Roda `git blame --porcelain` (com `--contents -` para o buffer não salvo) e devolve dados crus. Copiado para `out/main/` do asar. |
| `patch/main.cjs` | Novo `main` do Orca: registra o IPC `orca-git-blame:line` e depois dá `require` no main original. |
| `patch/preload.cjs` | Anexado ao preload do Orca; expõe `window.orcaGitBlame.blameLine()`. |
| `patch/i18n.js` | Catálogos (en, pt-BR, es, fr, ja, ko, zh) e formatação; registra as chaves `orcaGitBlame.*` no i18next do Orca e segue `languageChanged`. Também é carregado pelos testes (`patch/package.json` = CommonJS). |
| `patch/renderer.js` | Injetado no `index.html`/`popout.html`; escuta cursor em todo editor Monaco e desenha a decoração `after`. |
| `lib/asar.mjs` | Lê e reescreve `app.asar` sem extrair: anexa os arquivos alterados ao fim e reescreve só o header. Entradas `unpacked` ficam intactas. |
| `lib/patch-app.mjs` | Núcleo independente de plataforma: âncoras (ver abaixo), `patchBuffer`, `patchState` e `patchId` (hash das fontes do patch, gravado em `orcaGitBlamePatch` no `package.json` patcheado). |
| `lib/fuses.mjs` | Lê as fuses do Electron no executável do Orca; bloqueia o patch se a validação de integridade do asar estiver ligada. |
| `lib/linux.mjs` | Extrai o AppImage, patcheia a cópia, publica em `builds/`, gera launcher bash e `.desktop`. |
| `lib/windows.mjs` | Acha a instalação (`--install-dir`, `ORCA_INSTALL_DIR`, config, `%LOCALAPPDATA%\Programs\orca`), patcheia no lugar com `.orig`, gera launcher VBS e atalho no Menu Iniciar (via PowerShell). |
| `scripts/install.mjs` | Lê os argumentos e despacha para `lib/linux.mjs` ou `lib/windows.mjs` conforme `process.platform`. |
| `scripts/uninstall.mjs` | Idem para desinstalar (Windows restaura o `app.asar.orig`). |

## Comandos

```bash
npm install
npm test                                   # node --test; o teste contra asar real roda com ORCA_ASAR=<caminho/app.asar>
npm run patch -- --appimage ~/Apps/orca-linux.AppImage   # instala (o caminho fica salvo para as próximas vezes)
npm run patch:check                        # só verifica se o patch encaixa na versão atual do Orca, sem instalar
npm run unpatch                            # desinstala
```

Linux, instalado: estado em `~/.local/share/orca-git-blame/` (`builds/`, `current` → build ativo, `stamp`, `config.json`, `install.log`), launcher em `~/.local/bin/orca-blame`, atalho "Orca (Git Blame)" em `~/.local/share/applications/`.

Windows, instalado: `resources\app.asar` patcheado + `app.asar.orig`; estado em `%LOCALAPPDATA%\orca-git-blame\` (`config.json`, `stamp` = `patchId:tamanho-mtime` do asar, `install.log`, `orca-blame.vbs`); atalho `Orca (Git Blame).lnk` no Menu Iniciar.

## Como sobrevive a atualizações

**Linux:** o launcher compara `tamanho-mtime` do AppImage com `stamp`. Se mudou, roda `install.mjs` de novo antes de abrir; se o patch falhar, notifica e abre o Orca **original**. O Orca patcheado é iniciado com `APPIMAGE=<AppImage original>`, então o auto-update do Orca substitui o arquivo original e a próxima abertura refaz o patch.

**Windows:** o atalho roda `install.mjs --ensure`. Se o `stamp` bate, sai em ~1 ms; senão, se o asar instalado não está patcheado (update do Orca) ele vira o novo `.orig` e é patcheado; se está patcheado por outro `patchId`, o patch é refeito a partir do `.orig`. Com o Orca aberto o Windows trava o `app.asar` (`EBUSY`/`EPERM`): o erro vai para o log e o Orca abre sem o patch novo.

**Windows não foi testado em máquina real.** Coberto por teste no Linux: fluxo de instalação/update/desinstalação (`test/windows.test.mjs`), patch contra o `app.asar` real do Orca 1.4.222 para Windows, e blame com CRLF + `core.autocrlf=true`. Não coberto: launcher VBS e criação do `.lnk` executados, trava do arquivo, `git.exe` via `execFile`, caminhos `c:\` vindos do Monaco.

## Âncoras no Orca (onde o patch quebra quando o Orca muda)

`lib/patch-app.mjs` aborta o patch inteiro se qualquer uma faltar:

1. `package.json` com `main` — trocado por `out/main/orca-git-blame-main.cjs`.
2. Algum `out/preload/*.js` contendo `exposeInMainWorld("api"`.
3. `out/renderer/index.html` e `popout.html` com `</head>`.
4. Algum chunk `out/renderer/assets/*.js` com `X.config({monaco:Y})` (loader do `@monaco-editor/react`). O Orca **não** publica `globalThis.monaco` na janela (só em web workers); o patch expõe a instância como `globalThis.__orcaMonaco`.

5. *(opcional)* Chunk com `fallbackLng` e `const X=Y.createInstance();` (i18next do Orca), exposto como `globalThis.__orcaI18n`. Sem ela o patch segue e os textos caem no idioma do sistema.

Quando uma atualização quebrar: rode `npm run patch:check` para ver qual âncora sumiu, extraia o novo asar (`npx @electron/asar extract`) e ajuste a regex/âncora. Valide com `ORCA_ASAR=<novo app.asar> npm test`.

## Regras para mudanças

- O caminho do arquivo vem do editor: `git` sempre via `execFile` com array de argumentos, nunca string de shell.
- Decoração de texto injetado em range vazio precisa de `showIfCollapsed: true`; sem isso o Monaco descarta o `after` silenciosamente.
- `track()` de editor novo roda em `queueMicrotask`: `onDidCreateEditor` dispara dentro do construtor, e `addAction` ali é ignorado sem erro.
- Liga/desliga: estado global em `localStorage['orca-git-blame:enabled']` (padrão ligado), sincronizado entre janelas pelo evento `storage`. A action `orca-git-blame.toggle` (menu de contexto, grupo `8_git`, `Ctrl+Alt+B`, livre no Orca 1.4.221; no Windows pode colidir com AltGr) é recriada a cada troca para o label refletir o estado.
- Respostas de blame fora de ordem são descartadas por `requestId`; todo `schedule()` passa por `clear()`, que incrementa o id. Preserve isso ao mexer no renderer.
- O renderer só refaz o blame quando muda a chave `modelo:versão:linha`; mover o cursor na mesma linha não apaga nem relança o git.
- Buffers acima de `MAX_CONTENTS_CHARS` (2 Mi caracteres, espelho do `MAX_CONTENTS_BYTES` do main) não são enviados pelo IPC; o blame usa o arquivo em disco.
- O main mantém um `git blame` por `webContents:editorId`; um pedido novo aborta o anterior (`AbortController` → `execFile({ signal })`).
- O parser aceita ids SHA-1 (40 hex) e SHA-256 (64 hex); id todo zero = não commitado.
- Antes de patchear, `lib/fuses.mjs` lê as fuses do executável (`orca-ide` / `Orca.exe`) e aborta se `EnableEmbeddedAsarIntegrityValidation` estiver ligada.
- Erros no patch não podem impedir o Orca de abrir (`main.cjs` sempre carrega o main original).
- Linux: nunca reutilize/apague o diretório de um build que pode estar em execução; cada instalação cria um diretório novo e os 2 mais recentes são mantidos.
- Windows: `app.asar.orig` precisa sempre ser um asar não patcheado; grave o asar novo em arquivo temporário e troque com `rename` (nunca escreva por cima do arquivo em uso).
- Caminhos gravados em scripts que só rodam no Windows (VBS) usam `path.win32`; o resto usa `path` nativo para os testes rodarem no Linux.
- Texto visível ao usuário só via `patch/i18n.js` (inglês é a fonte; toda chave nova entra em todos os catálogos — há teste). O main devolve dados crus do blame; quem formata é a janela, que conhece o idioma. Idioma de language pack chega ao i18next como `plugin` + hex de `plugin:<pluginKey>/<locale>`.
- Mensagens de log, CLI e erros em inglês. Comentários em português; comentário novo só com `why:`, `hazard:` ou `invariant:`.

## Verificação ponta a ponta

Suba uma instância isolada (não interfere no Orca aberto) e inspecione via CDP:

```bash
env -i DISPLAY="$DISPLAY" XAUTHORITY="$XAUTHORITY" HOME=/tmp/ogb-home PATH=/usr/bin:/bin \
  ~/.local/bin/orca-blame --remote-debugging-port=9333 --remote-debugging-address=127.0.0.1 --user-data-dir=/tmp/ogb-home/ud
```

`window.orcaGitBlame.blameLine({filePath, line})` deve retornar o texto; com um editor aberto, `.orca-git-blame-ghost` aparece na linha do cursor.
