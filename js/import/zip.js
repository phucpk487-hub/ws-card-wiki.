// A small zip reader that works on a Blob without loading it: it reads the table of contents, then only the entries you ask for.
// (An Excel file is a zip; a 500 MB workbook never has to fit in memory at once.)
const EOCD = 0x06054b50, ZIP64_LOC = 0x07064b50, CEN = 0x02014b50;

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function openZip(blob) {
  const tailLen = Math.min(blob.size, 65557 + 22 + 20);
  const tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());
  let e = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === EOCD) { e = i; break; }
  if (e < 0) throw new Error('This file is not a zip/Excel (.xlsx) file.');
  let count = tail.getUint16(e + 10, true), cdSize = tail.getUint32(e + 12, true), cdOff = tail.getUint32(e + 16, true);
  if ((count === 0xffff || cdOff === 0xffffffff) && e >= 20 && tail.getUint32(e - 20, true) === ZIP64_LOC) {
    const at = Number(tail.getBigUint64(e - 20 + 8, true));
    const z = new DataView(await blob.slice(at, at + 56).arrayBuffer());
    count = Number(z.getBigUint64(32, true)); cdSize = Number(z.getBigUint64(40, true)); cdOff = Number(z.getBigUint64(48, true));
  }
  const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer()), td = new TextDecoder();
  const entries = new Map();
  for (let p = 0, n = 0; n < count && p + 46 <= cd.byteLength && cd.getUint32(p, true) === CEN; n++) {
    const nameLen = cd.getUint16(p + 28, true), extraLen = cd.getUint16(p + 30, true), commentLen = cd.getUint16(p + 32, true);
    const name = td.decode(new Uint8Array(cd.buffer, p + 46, nameLen));
    entries.set(name, { method: cd.getUint16(p + 10, true), size: cd.getUint32(p + 20, true), offset: cd.getUint32(p + 42, true) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const bytes = async (name) => {
    const en = entries.get(name); if (!en) throw new Error(`The Excel file has no “${name}”.`);
    if (en.size === 0xffffffff || en.offset === 0xffffffff) throw new Error('This Excel file is too large for the reader (zip64 entries).');
    const h = new DataView(await blob.slice(en.offset, en.offset + 30).arrayBuffer());
    const start = en.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    const raw = new Uint8Array(await blob.slice(start, start + en.size).arrayBuffer());
    if (en.method === 0) return raw;
    if (en.method === 8) return inflate(raw);
    throw new Error(`Unsupported zip compression (${en.method}).`);
  };
  const mime = (n) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[n.split('.').pop().toLowerCase()] || 'application/octet-stream');
  return {
    has: (n) => entries.has(n), names: () => [...entries.keys()], bytes,
    text: async (n) => td.decode(await bytes(n)),
    blob: async (n) => new Blob([await bytes(n)], { type: mime(n) }),
  };
}
