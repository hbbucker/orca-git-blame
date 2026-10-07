import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { blameLine, parsePorcelain, toBlame, UNCOMMITTED_SHA } = require('../patch/blame.cjs');

const PORCELAIN = `1234567890abcdef1234567890abcdef12345678 3 3 1
author Ana Souza
author-mail <ana@x>
author-time 1700000000
author-tz -0300
summary fix: corrige parser
filename src/a.ts
\tconst a = 1;
`;

test('parsePorcelain extrai sha, autor, data e resumo', () => {
  assert.deepEqual(parsePorcelain(PORCELAIN), {
    sha: '1234567890abcdef1234567890abcdef12345678',
    author: 'Ana Souza',
    authorTime: 1700000000,
    summary: 'fix: corrige parser',
  });
});

test('toBlame devolve dados crus, marca não commitado e ignora saída vazia', () => {
  assert.deepEqual(toBlame(parsePorcelain(PORCELAIN)), {
    uncommitted: false,
    author: 'Ana Souza',
    authorTime: 1700000000,
    summary: 'fix: corrige parser',
  });
  assert.deepEqual(toBlame({ sha: UNCOMMITTED_SHA, author: 'Not Committed Yet' }), { uncommitted: true });
  assert.equal(toBlame(parsePorcelain('')), null);
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'ogb-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir });
  git('init', '-q');
  git('config', 'user.name', 'Bia Lima');
  git('config', 'user.email', 'bia@x');
  writeFileSync(join(dir, 'arq "com aspas" $(x).txt'), 'linha1\nlinha2\n');
  git('add', '.');
  git('commit', '-qm', 'feat: primeiro');
  return dir;
}

test('blameLine roda git real, inclusive com caminho hostil para shell', async () => {
  const dir = repo();
  const filePath = join(dir, 'arq "com aspas" $(x).txt');
  const blame = await blameLine({ filePath, line: 2 });
  assert.equal(blame.author, 'Bia Lima');
  assert.equal(blame.summary, 'feat: primeiro');
  assert.ok(blame.authorTime > 0);
});

test('blameLine com --contents marca linha editada e não salva', async () => {
  const dir = repo();
  const filePath = join(dir, 'arq "com aspas" $(x).txt');
  assert.deepEqual(await blameLine({ filePath, line: 1, contents: 'nova\nlinha1\nlinha2\n' }), { uncommitted: true });
  assert.equal((await blameLine({ filePath, line: 2, contents: 'nova\nlinha1\nlinha2\n' })).summary, 'feat: primeiro');
});

test('blameLine devolve null fora de repo ou com entrada inválida', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ogb-norepo-'));
  writeFileSync(join(dir, 'a.txt'), 'x\n');
  assert.equal(await blameLine({ filePath: join(dir, 'a.txt'), line: 1 }), null);
  assert.equal(await blameLine({ filePath: 'relativo.txt', line: 1 }), null);
  assert.equal(await blameLine({ filePath: join(dir, 'a.txt'), line: 0 }), null);
});

// why: Git for Windows usa core.autocrlf=true e o Monaco entrega o buffer com CRLF; o blame não pode marcar tudo como não commitado.
test('blameLine com buffer CRLF e core.autocrlf=true atribui ao commit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ogb-crlf-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir });
  git('init', '-q');
  git('config', 'user.name', 'Bia Lima');
  git('config', 'user.email', 'bia@x');
  git('config', 'core.autocrlf', 'true');
  writeFileSync(join(dir, 'a.txt'), 'linha1\r\nlinha2\r\n');
  git('add', '.');
  git('commit', '-qm', 'feat: crlf');
  const filePath = join(dir, 'a.txt');
  assert.equal((await blameLine({ filePath, line: 2, contents: 'linha1\r\nlinha2\r\n' })).summary, 'feat: crlf');
  assert.deepEqual(await blameLine({ filePath, line: 2, contents: 'linha1\r\nmudou\r\n' }), { uncommitted: true });
});

test('blameLine em repositório SHA-256 (ids de 64 hex)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ogb-sha256-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir });
  git('init', '-q', '--object-format=sha256');
  git('config', 'user.name', 'Bia Lima');
  git('config', 'user.email', 'bia@x');
  writeFileSync(join(dir, 'a.txt'), 'linha1\n');
  git('add', '.');
  git('commit', '-qm', 'feat: sha256');
  const filePath = join(dir, 'a.txt');
  assert.equal((await blameLine({ filePath, line: 1 })).summary, 'feat: sha256');
  assert.deepEqual(await blameLine({ filePath, line: 1, contents: 'mudou\n' }), { uncommitted: true });
});

test('blameLine abortado resolve null e encerra o git', async () => {
  const dir = repo();
  const controller = new AbortController();
  const pending = blameLine({ filePath: join(dir, 'arq "com aspas" $(x).txt'), line: 1 }, { signal: controller.signal });
  controller.abort();
  assert.equal(await pending, null);
});
