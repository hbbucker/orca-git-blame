import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as asar from '@electron/asar';
import { listFiles, readArchive, readFile, writeArchive } from '../lib/asar.mjs';

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ogb-asar-'));
  const src = join(dir, 'src');
  mkdirSync(join(src, 'out/main'), { recursive: true });
  mkdirSync(join(src, 'native'), { recursive: true });
  writeFileSync(join(src, 'package.json'), '{"main":"./out/main/index.js"}');
  writeFileSync(join(src, 'out/main/index.js'), 'module.exports = 1;');
  writeFileSync(join(src, 'native/lib.node'), 'binario');
  const archive = join(dir, 'app.asar');
  await asar.createPackageWithOptions(src, archive, { unpack: '**/*.node' });
  return { dir, archive };
}

test('writeArchive substitui e adiciona arquivos legíveis pelo @electron/asar', async () => {
  const { dir, archive } = await fixture();
  const parsed = readArchive(readFileSync(archive));
  assert.equal(readFile(parsed, 'out/main/index.js').toString(), 'module.exports = 1;');

  const out = join(dir, 'patched.asar');
  writeFileSync(out, writeArchive(parsed, {
    'package.json': Buffer.from('{"main":"./out/main/novo.cjs"}'),
    'out/main/novo.cjs': Buffer.from('require("./index.js")'),
    'out/extra/dir/x.js': Buffer.from('x'),
  }));

  assert.equal(asar.extractFile(out, 'package.json').toString(), '{"main":"./out/main/novo.cjs"}');
  assert.equal(asar.extractFile(out, 'out/main/novo.cjs').toString(), 'require("./index.js")');
  assert.equal(asar.extractFile(out, 'out/main/index.js').toString(), 'module.exports = 1;');
  assert.equal(asar.extractFile(out, 'out/extra/dir/x.js').toString(), 'x');

  const header = readArchive(readFileSync(out)).header;
  assert.equal(header.files.native.files['lib.node'].unpacked, true);
  assert.ok(listFiles(header).includes('out/main/novo.cjs'));
});

test('readFile recusa arquivo unpacked e caminho inexistente', async () => {
  const { archive } = await fixture();
  const parsed = readArchive(readFileSync(archive));
  assert.throws(() => readFile(parsed, 'native/lib.node'), /unpacked/);
  assert.throws(() => readFile(parsed, 'nao/existe.js'), /not found/);
});
