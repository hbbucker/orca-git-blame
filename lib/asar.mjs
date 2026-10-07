import { createHash } from 'node:crypto';

const INTEGRITY_BLOCK_SIZE = 4 * 1024 * 1024;

export function readArchive(buffer) {
  const headerPickleSize = buffer.readUInt32LE(4);
  const stringLength = buffer.readUInt32LE(12);
  const header = JSON.parse(buffer.toString('utf8', 16, 16 + stringLength));
  return { header, data: buffer.subarray(8 + headerPickleSize) };
}

function lookup(header, filePath, create = false) {
  const parts = filePath.split('/');
  let node = header;
  for (const [i, part] of parts.entries()) {
    if (!node.files) throw new Error(`asar: ${parts.slice(0, i).join('/')} is not a directory`);
    if (!node.files[part]) {
      if (!create) return null;
      node.files[part] = i === parts.length - 1 ? {} : { files: {} };
    }
    node = node.files[part];
  }
  return node;
}

export function readFile({ header, data }, filePath) {
  const entry = lookup(header, filePath);
  if (!entry || entry.files) throw new Error(`asar: ${filePath} not found`);
  if (entry.unpacked) throw new Error(`asar: ${filePath} lives in app.asar.unpacked`);
  const offset = Number(entry.offset);
  return data.subarray(offset, offset + entry.size);
}

export function listFiles(header, prefix = '') {
  const out = [];
  for (const [name, entry] of Object.entries(header.files ?? {})) {
    const full = prefix ? `${prefix}/${name}` : name;
    if (entry.files) out.push(...listFiles(entry, full));
    else out.push(full);
  }
  return out;
}

function integrity(content) {
  const blocks = [];
  for (let i = 0; i < content.length; i += INTEGRITY_BLOCK_SIZE) {
    blocks.push(createHash('sha256').update(content.subarray(i, i + INTEGRITY_BLOCK_SIZE)).digest('hex'));
  }
  return {
    algorithm: 'SHA256',
    hash: createHash('sha256').update(content).digest('hex'),
    blockSize: INTEGRITY_BLOCK_SIZE,
    blocks,
  };
}

function serializeHeader(header) {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const padding = (4 - (json.length % 4)) % 4;
  const payload = Buffer.alloc(4 + json.length + padding);
  payload.writeUInt32LE(json.length, 0);
  json.copy(payload, 4);
  const headerPickle = Buffer.alloc(4 + payload.length);
  headerPickle.writeUInt32LE(payload.length, 0);
  payload.copy(headerPickle, 4);
  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);
  return Buffer.concat([sizePickle, headerPickle]);
}

// why: reescreve só as entradas alteradas, anexando o conteúdo novo ao fim; o bloco de dados original e as entradas unpacked ficam intactos byte a byte.
export function writeArchive({ header, data }, replacements) {
  const next = structuredClone(header);
  const appended = [];
  let offset = data.length;
  for (const [filePath, content] of Object.entries(replacements)) {
    const entry = lookup(next, filePath, true);
    if (entry.files) throw new Error(`asar: ${filePath} is a directory`);
    for (const key of Object.keys(entry)) delete entry[key];
    Object.assign(entry, { size: content.length, offset: String(offset), integrity: integrity(content) });
    appended.push(content);
    offset += content.length;
  }
  return Buffer.concat([serializeHeader(next), data, ...appended]);
}
