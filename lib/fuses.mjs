import { readFileSync } from 'node:fs';

// invariant: sentinel e ordem das fuses vêm do @electron/fuses (FuseV1); o fio fica logo após o sentinel: [versão, tamanho, '0'|'1'|'r'...].
const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
export const ASAR_INTEGRITY_FUSE = 4;

export function readFuseWire(buffer) {
  const at = buffer.indexOf(SENTINEL);
  if (at < 0) return null;
  const start = at + SENTINEL.length;
  return { version: buffer[start], wire: buffer.toString('latin1', start + 2, start + 2 + buffer[start + 1]) };
}

// why: com EnableEmbeddedAsarIntegrityValidation ligada, o Electron compara o hash do header do asar gravado no executável e recusa abrir um asar patcheado.
export function assertAsarIntegrityDisabled(exePath) {
  const fuses = readFuseWire(readFileSync(exePath));
  if (!fuses) throw new Error(`could not read Electron fuses from ${exePath}; refusing to patch`);
  if (fuses.wire[ASAR_INTEGRITY_FUSE] === '1') {
    throw new Error(`${exePath} enforces asar integrity (Electron fuse EnableEmbeddedAsarIntegrityValidation); patching would stop Orca from starting`);
  }
}
