# orca-git-blame

Mostra o **git blame da linha do cursor** no editor do [Orca IDE](https://github.com/stablyai/orca), em cinza no fim da linha, no estilo do IntelliJ/GitLens:

```
  "name": "orca-git-blame",    Hugo Bucker, 2 days ago • fix: change plugin identity to local
```

Linhas editadas e ainda não salvas aparecem como `You • Uncommitted changes`.

Os textos seguem o idioma escolhido no Orca (Settings → Appearance → Language): inglês por padrão, com traduções para espanhol, francês, japonês, coreano, chinês e português (pelo language pack do Orca). Em qualquer outro idioma, ficam em inglês.

## Por que não é um plugin

A API de plugins do Orca (`pluginApi: 1`) não dá acesso ao editor: não tem evento de cursor nem decoração de linha. Então este projeto **aplica um patch no `app.asar` do Orca**:

- **Linux:** patcheia uma **cópia** extraída do AppImage. O AppImage original nunca é alterado.
- **Windows:** patcheia o Orca instalado **no lugar**, guardando o original em `app.asar.orig` para restaurar.

## Requisitos

- Orca instalado: AppImage no Linux, ou o instalador `orca-windows-setup.exe` no Windows
- Node.js 20 ou mais recente
- `git` no PATH (no Windows, o Git for Windows)

## Linux

### Instalação

```bash
npm install
npm run patch -- --appimage ~/Apps/orca-linux.AppImage
```

Isso extrai o AppImage, aplica o patch e cria:

- `~/.local/bin/orca-blame`: o launcher
- **"Orca (Git Blame)"** no menu de aplicativos
- `~/.local/share/orca-git-blame/`: cópias com o patch, estado e log

O caminho do AppImage fica salvo. Das próximas vezes basta `npm run patch`.

### Uso

1. Feche **todas** as janelas do Orca. Se ele estiver aberto, a nova abertura só traz a janela existente para frente, sem o patch.
2. Abra pelo launcher (`~/.local/bin/orca-blame`) ou pelo atalho **"Orca (Git Blame)"**.

Use sempre esse atalho. O AppImage original continua abrindo o Orca sem o blame.

### Atualizações do Orca

É automático. O launcher compara o AppImage com o da última instalação. Se mudou, refaz o patch antes de abrir, o que leva alguns segundos. O auto-update do próprio Orca continua funcionando e atualiza o AppImage original. Se o patch falhar, uma notificação avisa e o Orca abre **sem** o blame. O log fica em `~/.local/share/orca-git-blame/install.log`.

O launcher guarda o caminho do Node usado na instalação, mas só precisa dele para refazer o patch. Se esse Node deixar de existir (por exemplo, a versão foi removida do nvm), o Orca patcheado continua abrindo normalmente. Quando o Orca atualizar, porém, o launcher não consegue refazer o patch e abre o Orca original, sem o blame. Rode `npm run patch` de novo com o Node atual para corrigir.

## Windows

> ⚠️ Ainda não foi testado num Windows real. O fluxo de instalação foi testado no Linux, contra o `app.asar` real do Orca 1.4.222 para Windows. O Orca aberto não foi testado.

### Instalação

Feche o Orca e, no PowerShell, dentro da pasta do projeto:

```powershell
npm install
npm run patch
```

O instalador encontra o Orca em `%LOCALAPPDATA%\Programs\orca`, a pasta padrão do instalador. Se estiver em outro lugar:

```powershell
npm run patch -- --install-dir "D:\Apps\Orca"
```

Isso:

- patcheia `resources\app.asar` e guarda o original em `resources\app.asar.orig`
- cria o atalho **"Orca (Git Blame)"** no Menu Iniciar
- guarda estado e log em `%LOCALAPPDATA%\orca-git-blame\`

### Uso

Como o patch é aplicado no próprio Orca, qualquer atalho abre o Orca com o blame. Isso vale até a próxima atualização do Orca.

### Atualizações do Orca

Uma atualização do Orca substitui o `app.asar` e o blame some. **Abra pelo atalho "Orca (Git Blame)"**: ele confere o patch e o reaplica antes de abrir o Orca. Se a conferência falhar, um aviso aparece e o Orca abre sem o blame. O log fica em `%LOCALAPPDATA%\orca-git-blame\install.log`.

## Ligar e desligar

- **Clique direito no editor → "Hide Inline Git Blame"** (ou "Show Inline Git Blame" quando está desligado)
- **Atalho:** `Ctrl+Alt+B` com o foco no editor

A escolha vale para todos os editores e janelas e é lembrada quando o Orca reabre.

## Desinstalar

```bash
npm run unpatch
```

- **Linux:** remove o launcher, o atalho e as cópias. Volte a abrir o AppImage original.
- **Windows:** restaura o `app.asar` original e remove o atalho e o estado. Se o backup `app.asar.orig` tiver sumido, a desinstalação para com erro e não remove nada. Nesse caso, reinstale o Orca e rode `npm run unpatch` de novo.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run patch` | Instala ou reinstala o patch (Linux: `-- --appimage <caminho>` na primeira vez; Windows: `-- --install-dir <pasta>` se não for a padrão) |
| `npm run patch:check` | Testa se o patch encaixa na versão atual do Orca, sem instalar |
| `npm run unpatch` | Desinstala |
| `npm test` | Roda os testes (`ORCA_ASAR=<app.asar> npm test` inclui o teste contra um Orca real) |

## Segurança e desempenho

- Antes de alterar qualquer arquivo, o instalador confere se o executável do Orca exige integridade do `app.asar` (a fuse `EnableEmbeddedAsarIntegrityValidation` do Electron). Se exigir, o patch é abortado sem gravar nada, porque o Orca deixaria de abrir. Hoje essa proteção está desligada no Orca de Linux e de Windows.
- O `git` é chamado sem shell, com os argumentos separados. Nomes de arquivo com aspas ou `$()` não executam nada.
- Só um `git blame` roda por editor. Mover o cursor cancela o anterior, e andar dentro da mesma linha não roda o git de novo.

## Limitações

- Só funciona com arquivos locais. Worktrees remotos (SSH, e provavelmente WSL no Windows) não mostram blame.
- Depende de detalhes internos do Orca (ver `AGENTS.md`). Uma atualização pode quebrar o patch até ele ser ajustado.
- Testado no Orca 1.4.221 (Linux). O patch também encaixa no `app.asar` do 1.4.222 para Windows.
- Em arquivos com mais de 2 MB, o blame usa a versão **salva** do arquivo. Alterações ainda não salvas não aparecem como "Uncommitted changes" e podem deslocar as linhas até você salvar.
- Repositórios com hashes SHA-1 e SHA-256 são suportados.
- macOS não é suportado: alterar o app quebra a assinatura de código.
- No Windows, em teclados em que `AltGr` equivale a `Ctrl+Alt`, o atalho `Ctrl+Alt+B` pode conflitar com algum caractere. O menu de contexto continua funcionando.

## Como funciona

O patch altera o `resources/app.asar`:

1. **main**: registra um handler IPC que roda `git blame --porcelain` (com `--contents -`, para considerar o buffer não salvo)
2. **preload**: expõe `window.orcaGitBlame.blameLine()`
3. **renderer**: um script escuta o cursor em todo editor Monaco e desenha o texto no fim da linha
4. **monaco-setup**: expõe a instância do Monaco, que o Orca não deixa acessível na janela
5. **i18n**: expõe o i18next do Orca, para os textos seguirem o idioma escolhido

Detalhes para quem for mexer no código estão no [`AGENTS.md`](AGENTS.md).

## Roadmap

Se der certo, a ideia é propor ao Orca uma API de editor (evento de cursor + decoração de linha), para que isso vire um plugin de verdade.
