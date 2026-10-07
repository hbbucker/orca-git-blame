import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listFiles, readArchive, readFile, writeArchive } from './asar.mjs';

const PATCH_DIR = fileURLToPath(new URL('../patch/', import.meta.url));
const MARKER = 'orca-git-blame';
const MAIN_FILE = 'out/main/orca-git-blame-main.cjs';
const BLAME_FILE = 'out/main/orca-git-blame-blame.cjs';
const RENDERER_FILE = 'out/renderer/orca-git-blame-renderer.js';
const I18N_FILE = 'out/renderer/orca-git-blame-i18n.js';
const RENDERER_HTML = ['out/renderer/index.html', 'out/renderer/popout.html'];
const PRELOAD_ANCHOR = 'exposeInMainWorld("api"';
const SCRIPT_TAGS = '<script src="./orca-git-blame-i18n.js"></script>\n  <script src="./orca-git-blame-renderer.js"></script>';
// why: o Orca só publica globalThis.monaco dentro de web workers; na janela, a instância só aparece no loader.config do @monaco-editor/react.
const MONACO_CONFIG_RE = /\b([\w$]+)\.config\(\{monaco:([\w$]+)\}\)/;
// why: a instância i18next do Orca é local ao módulo i18n; expô-la deixa os textos do blame seguirem o idioma escolhido no Orca.
const I18N_INSTANCE_RE = /const ([\w$]+)=([\w$]+)\.createInstance\(\);/;

const source = (name) => readFileSync(PATCH_DIR + name, 'utf8');
const PATCH_SOURCES = ['main.cjs', 'blame.cjs', 'preload.cjs', 'renderer.js', 'i18n.js'];

// why: identifica a versão do patch para o Windows saber se o app.asar instalado precisa ser refeito após um update deste repo.
export function patchId() {
  const hash = createHash('sha256');
  for (const name of PATCH_SOURCES) hash.update(source(name));
  hash.update(readFileSync(fileURLToPath(import.meta.url)));
  hash.update(readFileSync(fileURLToPath(new URL('./asar.mjs', import.meta.url))));
  return hash.digest('hex').slice(0, 16);
}

export function patchState(archive) {
  const pkg = JSON.parse(text(archive, 'package.json'));
  return { patched: String(pkg.main).includes(MARKER), patchId: pkg.orcaGitBlamePatch ?? null, version: pkg.version };
}

function text(archive, filePath) {
  return readFile(archive, filePath).toString('utf8');
}

// invariant: cada âncora ausente aborta o patch inteiro; um Orca meio-patcheado é pior que o original.
export function buildReplacements(archive) {
  const pkg = JSON.parse(text(archive, 'package.json'));
  if (typeof pkg.main !== 'string') throw new Error('Orca package.json has no "main"');
  if (pkg.main.includes(MARKER)) throw new Error('app.asar is already patched; start from the original');
  const originalMain = pkg.main.replace(/^\.\//, '');
  readFile(archive, originalMain);

  const replacements = {
    'package.json': Buffer.from(JSON.stringify({ ...pkg, main: `./${MAIN_FILE}`, orcaGitBlamePatch: patchId() }, null, 2)),
    [MAIN_FILE]: Buffer.from(source('main.cjs').replace("'__ORIGINAL_MAIN__'", JSON.stringify(originalMain))),
    [BLAME_FILE]: Buffer.from(source('blame.cjs')),
    [RENDERER_FILE]: Buffer.from(source('renderer.js')),
    [I18N_FILE]: Buffer.from(source('i18n.js')),
  };

  const preloads = listFiles(archive.header)
    .filter((f) => f.startsWith('out/preload/') && f.endsWith('.js'))
    .filter((f) => text(archive, f).includes(PRELOAD_ANCHOR));
  if (preloads.length === 0) throw new Error(`no preload contains ${PRELOAD_ANCHOR}`);
  for (const f of preloads) replacements[f] = Buffer.from(text(archive, f) + source('preload.cjs'));

  for (const f of RENDERER_HTML) {
    const html = text(archive, f);
    if (!html.includes('</head>')) throw new Error(`${f} has no </head>`);
    replacements[f] = Buffer.from(html.replace('</head>', `  ${SCRIPT_TAGS}\n  </head>`));
  }

  const monacoChunks = listFiles(archive.header)
    .filter((f) => f.startsWith('out/renderer/assets/') && f.endsWith('.js'))
    .filter((f) => MONACO_CONFIG_RE.test(text(archive, f)));
  if (monacoChunks.length === 0) throw new Error('no renderer chunk contains .config({monaco:...})');
  for (const f of monacoChunks) {
    replacements[f] = Buffer.from(
      text(archive, f).replace(new RegExp(MONACO_CONFIG_RE, 'g'), '$1.config({monaco:(globalThis.__orcaMonaco=$2)})'),
    );
  }

  // invariant: âncora opcional — sem ela os textos caem no idioma do sistema, mas o blame continua funcionando.
  const i18nChunks = listFiles(archive.header)
    .filter((f) => f.startsWith('out/renderer/assets/') && f.endsWith('.js'))
    .filter((f) => {
      const code = text(archive, f);
      return code.includes('fallbackLng') && I18N_INSTANCE_RE.test(code);
    });
  for (const f of i18nChunks) {
    replacements[f] = Buffer.from(
      text(archive, f).replace(I18N_INSTANCE_RE, 'const $1=globalThis.__orcaI18n=$2.createInstance();'),
    );
  }

  return { replacements, version: pkg.version, preloads, monacoChunks, i18nChunks };
}

export function patchBuffer(buffer) {
  const archive = readArchive(buffer);
  const result = buildReplacements(archive);
  return { ...result, buffer: writeArchive(archive, result.replacements) };
}
