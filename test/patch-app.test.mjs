import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readArchive, readFile, writeArchive } from '../lib/asar.mjs';
import { buildReplacements } from '../lib/patch-app.mjs';

// why: valida as âncoras contra um app.asar real do Orca; aponte ORCA_ASAR para outro build ao testar uma versão nova.
const ORCA_ASAR = process.env.ORCA_ASAR;

test('patch contra app.asar real do Orca', { skip: !ORCA_ASAR || !existsSync(ORCA_ASAR) ? 'defina ORCA_ASAR' : false }, () => {
  const archive = readArchive(readFileSync(ORCA_ASAR));
  const { replacements, preloads, monacoChunks, i18nChunks } = buildReplacements(archive);
  const patched = readArchive(writeArchive(archive, replacements));
  const read = (f) => readFile(patched, f).toString();

  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.main, './out/main/orca-git-blame-main.cjs');
  assert.match(read('out/main/orca-git-blame-main.cjs'), /"out\/main\/index\.js"/);
  assert.ok(preloads.length >= 1);
  for (const f of preloads) assert.match(read(f), /orcaGitBlame/);
  for (const f of ['out/renderer/index.html', 'out/renderer/popout.html']) {
    assert.match(read(f), /<script src="\.\/orca-git-blame-i18n\.js"><\/script>\n\s*<script src="\.\/orca-git-blame-renderer\.js"><\/script>\n\s*<\/head>/);
  }

  assert.ok(monacoChunks.length >= 1);
  for (const f of monacoChunks) assert.match(read(f), /\.config\(\{monaco:\(globalThis\.__orcaMonaco=[\w$]+\)\}\)/);

  assert.equal(i18nChunks.length, 1);
  assert.match(read(i18nChunks[0]), /const [\w$]+=globalThis\.__orcaI18n=[\w$]+\.createInstance\(\);/);

  const dir = mkdtempSync(join(tmpdir(), 'ogb-check-'));
  for (const f of ['out/main/orca-git-blame-main.cjs', 'out/main/orca-git-blame-blame.cjs', 'out/renderer/orca-git-blame-renderer.js', 'out/renderer/orca-git-blame-i18n.js', ...preloads, ...monacoChunks, ...i18nChunks]) {
    const target = join(dir, f.replaceAll('/', '_'));
    writeFileSync(target, read(f));
    execFileSync(process.execPath, ['--check', target]);
  }

  assert.throws(() => buildReplacements(patched), /already patched/);
});
