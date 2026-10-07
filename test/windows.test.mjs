import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as asar from '@electron/asar';
import { readArchive, readFile, writeArchive } from '../lib/asar.mjs';
import { patchState } from '../lib/patch-app.mjs';
import { ensurePatched, install, launcherScript, resolveInstallDir, paths, uninstall } from '../lib/windows.mjs';

// why: reproduz só as âncoras que o patch procura, para o fluxo do Windows rodar sem o asar de 120 MB do Orca.
async function fakeOrcaAsar(dir) {
  const src = join(dir, 'app-src');
  const write = (rel, content) => {
    mkdirSync(join(src, rel, '..'), { recursive: true });
    writeFileSync(join(src, rel), content);
  };
  write('package.json', JSON.stringify({ name: 'orca', version: '9.9.9', main: './out/main/index.js' }));
  write('out/main/index.js', 'module.exports = 1;');
  write('out/preload/index.js', 'electron.contextBridge.exposeInMainWorld("api", api);');
  write('out/renderer/index.html', '<html><head><title>Orca</title></head></html>');
  write('out/renderer/popout.html', '<html><head></head></html>');
  write('out/renderer/assets/monaco-setup-x.js', 'ht.config({monaco:Z}),d.register(Z);');
  write('out/renderer/assets/i18n-x.js', 'const Z=W.createInstance();Z.init({fallbackLng:`en`});');
  const out = join(dir, 'fixture.asar');
  await asar.createPackage(src, out);
  return readFileSync(out);
}

function fakeExe(wire) {
  return Buffer.concat([Buffer.from('MZ....'), Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'), Buffer.from([1, wire.length]), Buffer.from(wire)]);
}

async function fakeWindows() {
  const root = mkdtempSync(join(tmpdir(), 'ogb-win-'));
  const env = { LOCALAPPDATA: join(root, 'Local'), APPDATA: join(root, 'Roaming') };
  const installDir = join(env.LOCALAPPDATA, 'Programs', 'orca');
  mkdirSync(join(installDir, 'resources'), { recursive: true });
  writeFileSync(join(installDir, 'Orca.exe'), fakeExe('101100011'));
  const original = await fakeOrcaAsar(root);
  const asarPath = join(installDir, 'resources', 'app.asar');
  writeFileSync(asarPath, original);
  return { env, installDir, asarPath, original };
}

const state = (path) => patchState(readArchive(readFileSync(path)));
const quiet = () => {};

test('acha a instalação padrão do NSIS por usuário (%LOCALAPPDATA%\\Programs\\orca)', async () => {
  const { env, installDir } = await fakeWindows();
  assert.equal(resolveInstallDir({}, {}, paths(env), env), installDir);
  assert.throws(() => resolveInstallDir({}, {}, paths({ LOCALAPPDATA: '/nao/existe', APPDATA: '/x' }), {}), /--install-dir/);
});

test('install patcheia no lugar, guarda o original e é idempotente', async () => {
  const { env, asarPath, original } = await fakeWindows();
  install({ skipShortcut: true }, quiet, env);
  assert.equal(state(asarPath).patched, true);
  assert.deepEqual(readFileSync(`${asarPath}.orig`), original);
  const p = paths(env);
  assert.ok(existsSync(p.launcher) && existsSync(p.stamp));

  const patched = readFileSync(asarPath);
  install({ ensure: true, quiet: true }, quiet, env);
  assert.deepEqual(readFileSync(asarPath), patched);
});

test('após update do Orca (asar novo por cima) o ensure refaz o patch e renova o backup', async () => {
  const { env, asarPath } = await fakeWindows();
  install({ skipShortcut: true }, quiet, env);
  const updated = readArchive(readFileSync(`${asarPath}.orig`));
  const pkg = JSON.parse(readFile(updated, 'package.json'));
  const newer = writeArchive(updated, { 'package.json': Buffer.from(JSON.stringify({ ...pkg, version: '10.0.0' })) });
  writeFileSync(asarPath, newer);

  install({ ensure: true, quiet: true }, quiet, env);
  assert.equal(state(asarPath).patched, true);
  assert.equal(state(asarPath).version, '10.0.0');
  assert.deepEqual(readFileSync(`${asarPath}.orig`), newer);
});

test('patch de outra versão deste repo é refeito a partir do .orig', async () => {
  const { installDir, asarPath, original } = await fakeWindows();
  ensurePatched({ installDir }, quiet);
  const archive = readArchive(readFileSync(asarPath));
  const pkg = JSON.parse(readFile(archive, 'package.json'));
  writeFileSync(asarPath, writeArchive(archive, { 'package.json': Buffer.from(JSON.stringify({ ...pkg, orcaGitBlamePatch: 'antigo' })) }));

  const r = ensurePatched({ installDir }, quiet);
  assert.equal(r.changed, true);
  assert.notEqual(state(asarPath).patchId, 'antigo');
  assert.deepEqual(readFileSync(`${asarPath}.orig`), original);
});

test('--check não grava nada', async () => {
  const { installDir, asarPath, original } = await fakeWindows();
  ensurePatched({ installDir, check: true }, quiet);
  assert.deepEqual(readFileSync(asarPath), original);
  assert.equal(existsSync(`${asarPath}.orig`), false);
});

test('uninstall restaura o app.asar original byte a byte', async () => {
  const { env, asarPath, original } = await fakeWindows();
  install({ skipShortcut: true }, quiet, env);
  uninstall(quiet, env);
  assert.deepEqual(readFileSync(asarPath), original);
  assert.equal(existsSync(`${asarPath}.orig`), false);
  assert.equal(existsSync(paths(env).state), false);
});

test('launcher VBS: aspas de caminhos com espaço sobrevivem ao cmd /c', () => {
  const vbs = launcherScript({
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    installScript: 'C:\\Users\\Ana Lima\\orca-git-blame\\scripts\\install.mjs',
    state: 'C:\\Users\\Ana Lima\\AppData\\Local\\orca-git-blame',
    orcaExe: 'C:\\Users\\Ana Lima\\AppData\\Local\\Programs\\orca\\Orca.exe',
  });
  assert.ok(
    vbs.includes(
      'rc = sh.Run("cmd /c """"C:\\Program Files\\nodejs\\node.exe"" ""C:\\Users\\Ana Lima\\orca-git-blame\\scripts\\install.mjs"" --ensure --quiet >> ""C:\\Users\\Ana Lima\\AppData\\Local\\orca-git-blame\\install.log"" 2>&1""", 0, True)',
    ),
    vbs,
  );
  assert.match(vbs, /sh\.Run """" & "C:\\Users\\Ana Lima\\AppData\\Local\\Programs\\orca\\Orca\.exe" & """" & args, 1, False/);
  assert.match(vbs, /^Option Explicit$/m);
});

test('aborta sem gravar nada se o Orca.exe exigir integridade do asar', async () => {
  const { installDir, asarPath, original } = await fakeWindows();
  writeFileSync(join(installDir, 'Orca.exe'), fakeExe('101110011'));
  assert.throws(() => ensurePatched({ installDir }, quiet), /asar integrity/);
  assert.deepEqual(readFileSync(asarPath), original);
  assert.equal(existsSync(`${asarPath}.orig`), false);
});

test('uninstall sem .orig falha e mantém atalho e estado', async () => {
  const { env, asarPath } = await fakeWindows();
  install({ skipShortcut: true }, quiet, env);
  rmSync(`${asarPath}.orig`);
  assert.throws(() => uninstall(quiet, env), /reinstall Orca/);
  assert.equal(state(asarPath).patched, true);
  assert.equal(existsSync(paths(env).launcher), true);
});
