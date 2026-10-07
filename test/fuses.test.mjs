import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assertAsarIntegrityDisabled, readFuseWire } from '../lib/fuses.mjs';

const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
const exe = (wire) => Buffer.concat([Buffer.alloc(64, 7), SENTINEL, Buffer.from([1, wire.length]), Buffer.from(wire), Buffer.alloc(16)]);

function write(buffer) {
  const path = join(mkdtempSync(join(tmpdir(), 'ogb-fuse-')), 'app.exe');
  writeFileSync(path, buffer);
  return path;
}

test('lê o fio de fuses do Electron (valor real do Orca 1.4.221/1.4.222)', () => {
  assert.deepEqual(readFuseWire(exe('101100011')), { version: 1, wire: '101100011' });
  assert.equal(readFuseWire(Buffer.from('sem sentinel')), null);
});

test('aceita integridade desligada, recusa ligada ou ilegível', () => {
  assert.doesNotThrow(() => assertAsarIntegrityDisabled(write(exe('101100011'))));
  assert.throws(() => assertAsarIntegrityDisabled(write(exe('101110011'))), /asar integrity/);
  assert.throws(() => assertAsarIntegrityDisabled(write(Buffer.from('MZ'))), /could not read Electron fuses/);
});
