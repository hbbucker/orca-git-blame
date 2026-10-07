'use strict';
const { execFile } = require('node:child_process');
const path = require('node:path');

// why: acima disso o custo de mandar o buffer inteiro pelo IPC/stdin a cada movimento de cursor deixa de compensar; cai para o blame do disco.
const MAX_CONTENTS_BYTES = 2 * 1024 * 1024;
const UNCOMMITTED_SHA = '0000000000000000000000000000000000000000';
// why: repositórios com --object-format=sha256 usam ids de 64 hex; o id "não commitado" é todo zero em ambos.
const COMMIT_LINE_RE = /^([0-9a-f]{64}|[0-9a-f]{40}) /;

function parsePorcelain(stdout) {
  const result = { sha: '', author: '', authorTime: 0, summary: '' };
  for (const line of stdout.split('\n')) {
    const commit = result.sha ? null : COMMIT_LINE_RE.exec(line);
    if (commit) result.sha = commit[1];
    else if (line.startsWith('author ')) result.author = line.slice(7).trim();
    else if (line.startsWith('author-time ')) result.authorTime = Number.parseInt(line.slice(12), 10) || 0;
    else if (line.startsWith('summary ')) result.summary = line.slice(8).trim();
  }
  return result;
}

// why: o texto final depende do idioma do Orca, que só a janela conhece; o main devolve dados crus.
function toBlame(info) {
  if (!info.sha) return null;
  if (/^0+$/.test(info.sha)) return { uncommitted: true };
  return { uncommitted: false, author: info.author, authorTime: info.authorTime, summary: info.summary };
}

function blameLine({ filePath, line, contents }, { timeoutMs = 5000, signal } = {}) {
  return new Promise((resolve) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return resolve(null);
    if (!Number.isInteger(line) || line < 1) return resolve(null);
    const useContents = typeof contents === 'string' && Buffer.byteLength(contents) <= MAX_CONTENTS_BYTES;
    const args = ['blame', '-L', `${line},${line}`, '--porcelain'];
    if (useContents) args.push('--contents', '-');
    args.push('--', path.basename(filePath));
    // hazard: execFile sem shell — o caminho vem do editor e nunca pode ser interpolado num comando.
    const child = execFile(
      'git',
      args,
      { cwd: path.dirname(filePath), timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true, signal },
      (error, stdout) => {
        if (error || !stdout) return resolve(null);
        resolve(toBlame(parsePorcelain(stdout)));
      },
    );
    child.stdin.on('error', () => {});
    child.stdin.end(useContents ? contents : undefined);
  });
}

module.exports = { blameLine, parsePorcelain, toBlame, UNCOMMITTED_SHA };
