// A4 print sheets: 3 x 3 cards at real size (63 x 88 mm), with small cut marks. Pure PDF writer (no DOM), plus a browser helper that turns card pictures into JPEGs.
const MM = 72 / 25.4;
export const PAGE = { w: 210 * MM, h: 297 * MM };
export const CARD = { w: 63 * MM, h: 88 * MM };
export const PER_PAGE = 9;

const enc = new TextEncoder();
const num = (n) => (Math.round(n * 100) / 100).toString();

/** images: [{ jpeg: Uint8Array, width, height }] (in print order). Returns a PDF as Uint8Array. */
export function buildPdf(images, { cutMarks = true } = {}) {
  const chunks = []; let size = 0; const offsets = [];
  const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); size += b.length; };
  const obj = (id, fn) => { offsets[id] = size; put(`${id} 0 obj\n`); fn(); put('\nendobj\n'); };

  const pages = Math.max(1, Math.ceil(images.length / PER_PAGE));
  // ids: 1 catalog, 2 pages, then per page: page, content; then one image object per card
  const pageId = (p) => 3 + p * 2, contentId = (p) => 4 + p * 2, imageId = (i) => 3 + pages * 2 + i;
  const total = 2 + pages * 2 + images.length;

  const gx = (PAGE.w - CARD.w * 3) / 2, gy = (PAGE.h - CARD.h * 3) / 2;
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put(`<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, p) => `${pageId(p)} 0 R`).join(' ')}] >>`));
  for (let p = 0; p < pages; p++) {
    const here = images.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);
    let c = '';
    here.forEach((_, k) => {
      const col = k % 3, row = Math.floor(k / 3);
      c += `q ${num(CARD.w)} 0 0 ${num(CARD.h)} ${num(gx + col * CARD.w)} ${num(PAGE.h - gy - (row + 1) * CARD.h)} cm /I${k} Do Q\n`;
    });
    if (cutMarks) {
      const L = 5 * MM, g = 1.5 * MM; c += '0.5 w 0.4 G\n';
      for (let i = 0; i <= 3; i++) {
        const x = gx + i * CARD.w, y = PAGE.h - gy - i * CARD.h;
        c += `${num(x)} ${num(PAGE.h - gy + g)} m ${num(x)} ${num(PAGE.h - gy + g + L)} l S ${num(x)} ${num(gy - g)} m ${num(x)} ${num(gy - g - L)} l S\n`;
        c += `${num(gx - g)} ${num(y)} m ${num(gx - g - L)} ${num(y)} l S ${num(PAGE.w - gx + g)} ${num(y)} m ${num(PAGE.w - gx + g + L)} ${num(y)} l S\n`;
      }
    }
    const xo = here.map((_, k) => `/I${k} ${imageId(p * PER_PAGE + k)} 0 R`).join(' ');
    obj(pageId(p), () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE.w)} ${num(PAGE.h)}] /Resources << /XObject << ${xo} >> >> /Contents ${contentId(p)} 0 R >>`));
    obj(contentId(p), () => { const b = enc.encode(c); put(`<< /Length ${b.length} >>\nstream\n`); put(b); put('\nendstream'); });
  }
  images.forEach((im, i) => obj(imageId(i), () => {
    put(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`);
    put(im.jpeg); put('\nendstream');
  }));
  const xref = size;
  put(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= total; i++) put(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size); let at = 0;
  for (const b of chunks) { out.set(b, at); at += b.length; }
  return out;
}

/** Browser: one card picture (URL or null) -> upright JPEG cropped to the card's shape. Landscape pictures (Climax) are turned upright. */
export async function cardJpeg(card, { width = 630 } = {}) {
  const height = Math.round(width * 88 / 63);
  const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  let img = null;
  if (card && card.image) {
    try { img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = card.image; }); } catch { img = null; }
  }
  if (img) {
    const turn = img.naturalWidth > img.naturalHeight;
    const sw = turn ? img.naturalHeight : img.naturalWidth, sh = turn ? img.naturalWidth : img.naturalHeight;
    const k = Math.max(width / sw, height / sh);   // cover
    ctx.save(); ctx.translate(width / 2, height / 2); if (turn) ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth * k / 2, -img.naturalHeight * k / 2, img.naturalWidth * k, img.naturalHeight * k); ctx.restore();
  } else {
    ctx.strokeStyle = '#999'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, width - 6, height - 6);
    ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.font = 'bold 40px sans-serif';
    ctx.fillText(card ? card.number : '?', width / 2, height / 2 - 20); ctx.font = '34px sans-serif';
    String(card ? card.name : 'Not in database').match(/.{1,22}/g).slice(0, 3).forEach((t, i) => ctx.fillText(t, width / 2, height / 2 + 40 + i * 44));
  }
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.88));
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/** Card numbers in print order: every copy, or one of each. */
export function printList(deck, byNumber, { copies = true } = {}) {
  const out = [];
  const entries = Object.entries(deck.cards).sort(([a], [b]) => {
    const A = byNumber.get(a), B = byNumber.get(b), rank = (c) => (!c ? 9 : c.type === 'Climax' ? 5 : c.type === 'Event' ? 4 : c.level ?? 0);
    return rank(A) - rank(B) || a.localeCompare(b);
  });
  for (const [n, c] of entries) for (let i = 0; i < (copies ? c : 1); i++) out.push(n);
  return out;
}
