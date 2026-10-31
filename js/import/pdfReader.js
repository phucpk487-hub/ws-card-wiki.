// Reads a PDF into a plain "page model" that parse.js understands:
//   { index, width, height,
//     words:  [{ str, x0, x1, base, size }]          (y measured downward from the top of the page)
//     images: [{ x0, x1, top, bottom, pixels() }] }  (pixels() resolves to a <canvas> in the browser)
// pdf.js is vendored in js/vendor/pdfjs, so importing works offline and inside a future app.

let libPromise = null;
export function loadPdfjs() {
  if (!libPromise) {
    libPromise = import('../vendor/pdfjs/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return lib;
    });
    libPromise.catch(() => { libPromise = null; });
  }
  return libPromise;
}

const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];

function bboxOfUnitSquare(m) {
  const xs = [], ys = [];
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { xs.push(m[0] * x + m[2] * y + m[4]); ys.push(m[1] * x + m[3] * y + m[5]); }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function dataToCanvas(obj) {
  const canvas = document.createElement('canvas');
  canvas.width = obj.width; canvas.height = obj.height;
  const ctx = canvas.getContext('2d');
  if (obj.bitmap) { ctx.drawImage(obj.bitmap, 0, 0); return canvas; }
  const { data, width: w, height: h } = obj;
  const out = ctx.createImageData(w, h), o = out.data;
  const px = w * h;
  if (data.length === px * 4) o.set(data);
  else if (data.length === px * 3) for (let i = 0, j = 0; i < px; i++, j += 3) { o[i * 4] = data[j]; o[i * 4 + 1] = data[j + 1]; o[i * 4 + 2] = data[j + 2]; o[i * 4 + 3] = 255; }
  else { // 1 bit per pixel grayscale
    const rowBytes = Math.ceil(w / 8);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
      const k = (y * w + x) * 4; o[k] = o[k + 1] = o[k + 2] = v; o[k + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/**
 * Open a PDF for page-by-page reading. A File/Blob is read in pieces on demand (a 500 MB sheet never has to fit in memory at once);
 * bytes are used as they are. getPage(n) builds the page model and keeps the page's decoded pictures until release(n) is called.
 * @param {Uint8Array|Blob} data  the PDF
 * @param {{pdfjs?: object}} opts  pdfjs: inject a library (used by Node tests)
 */
export async function openPdf(data, { pdfjs } = {}) {
  const lib = pdfjs || await loadPdfjs();
  let src = { data };
  if (typeof Blob !== 'undefined' && data instanceof Blob && lib.PDFDataRangeTransport) {
    const CHUNK = 1 << 21;                                   // 2 MB per read: far fewer round trips than pdf.js's 64 KB default
    const range = new lib.PDFDataRangeTransport(data.size, new Uint8Array(await data.slice(0, CHUNK).arrayBuffer()));
    range.requestDataRange = (begin, end) => { data.slice(begin, end).arrayBuffer().then((b) => range.onDataRange(begin, new Uint8Array(b))); };
    src = { range, length: data.size, rangeChunkSize: CHUNK, disableAutoFetch: true, disableStream: true };
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) src = { data: new Uint8Array(await data.arrayBuffer()) };
  const task = lib.getDocument(src);
  const doc = await task.promise;
  const O = lib.OPS;
  let live = null;                                           // the one page whose decoded pictures are still in memory
  const keep = (n, page, ops) => { live = { n, page, ops }; };
  const release = (n) => { if (live && live.n === n) { try { live.page.cleanup(); } catch { /* ignore */ } live = null; } };
  const isImage = (f) => f === O.paintImageXObject || f === O.paintInlineImageXObject || f === O.paintImageXObjectRepeat;

  async function getPage(n) {
    const page = await doc.getPage(n);
    const [vx0, vy0, vx1, vy1] = page.view, W = vx1 - vx0, H = vy1 - vy0;
    const words = [];
    for (const it of (await page.getTextContent()).items) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, , , e, f] = it.transform;
      words.push({ str: it.str.trim(), x0: e - vx0, x1: e - vx0 + it.width, base: H - (f - vy0), size: Math.hypot(a, b) || it.height });
    }
    const images = [];
    const ops = await page.getOperatorList();
    keep(n, page, ops);
    const stack = []; let ctm = [1, 0, 0, 1, 0, 0];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === O.save) stack.push(ctm.slice());
      else if (fn === O.restore) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mul(args, ctm);
      else if (isImage(fn)) {
        const bb = bboxOfUnitSquare(ctm);
        const inline = fn === O.paintInlineImageXObject;
        const name = inline ? null : args[0], order = images.length;
        images.push({
          x0: bb.minX - vx0, x1: bb.maxX - vx0, top: H - (bb.maxY - vy0), bottom: H - (bb.minY - vy0),
          pixels: async () => {
            if (inline) return dataToCanvas(args[0]);
            let L = live && live.n === n ? live : null;
            if (!L) { const pg = await doc.getPage(n); keep(n, pg, await pg.getOperatorList()); L = live; }   // released earlier: decode again
            let seen = -1, nm = name;
            for (let j = 0; j < L.ops.fnArray.length; j++) if (isImage(L.ops.fnArray[j]) && ++seen === order) { nm = L.ops.argsArray[j][0]; break; }
            const store = String(nm).startsWith('g_') ? L.page.commonObjs : L.page.objs;   // pictures used on several pages live in the shared store
            return dataToCanvas(await new Promise((res) => store.get(nm, res)));
          },
        });
      }
    }
    return { index: n - 1, width: W, height: H, words, images };
  }
  return { numPages: doc.numPages, getPage, release, destroy: () => { try { task.destroy(); } catch { /* already gone */ } } };
}

/** All pages at once (used by tests and small files). */
export async function readPdf(data, { pdfjs, onProgress } = {}) {
  const pdf = await openPdf(data, { pdfjs }), pages = [];
  for (let n = 1; n <= pdf.numPages; n++) { onProgress?.(n, pdf.numPages); pages.push(await pdf.getPage(n)); pdf.release(n); }
  return { pages, destroy: pdf.destroy };
}
