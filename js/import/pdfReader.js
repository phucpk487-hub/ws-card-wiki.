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
 * @param {Uint8Array} data  the PDF bytes
 * @param {{pdfjs?: object, onProgress?: (page:number,total:number)=>void}} opts  pdfjs: inject a library (used by Node tests)
 */
export async function readPdf(data, { pdfjs, onProgress } = {}) {
  const lib = pdfjs || await loadPdfjs();
  // A File/Blob is read in pieces on demand (a 500 MB sheet never has to fit in memory at once); bytes are used as they are.
  let src = { data };
  if (typeof Blob !== 'undefined' && data instanceof Blob && lib.PDFDataRangeTransport) {
    const range = new lib.PDFDataRangeTransport(data.size, new Uint8Array(await data.slice(0, 65536).arrayBuffer()));
    range.requestDataRange = (begin, end) => { data.slice(begin, end).arrayBuffer().then((b) => range.onDataRange(begin, new Uint8Array(b))); };
    src = { range, length: data.size, disableAutoFetch: true, disableStream: true };
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) src = { data: new Uint8Array(await data.arrayBuffer()) };
  const task = lib.getDocument(src);
  const doc = await task.promise;
  const O = lib.OPS, pages = [];
  // Decoded images are big. Keep only the page being used: after the scan below a page is released, and its pictures are decoded again
  // on demand (cards are processed in page order, so this costs one decode per page).
  let live = null;
  const pageObjs = async (n) => {
    if (live && live.n === n) return live;
    if (live) { try { live.page.cleanup(); } catch { /* ignore */ } live = null; }
    const pg = await doc.getPage(n); const ops = await pg.getOperatorList(); live = { n, page: pg, ops };
    return live;
  };
  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.(n, doc.numPages);
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
    const stack = []; let ctm = [1, 0, 0, 1, 0, 0];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === O.save) stack.push(ctm.slice());
      else if (fn === O.restore) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mul(args, ctm);
      else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageXObjectRepeat) {
        const bb = bboxOfUnitSquare(ctm);
        const inline = fn === O.paintInlineImageXObject;
        const name = inline ? null : args[0], order = images.length;
        images.push({
          x0: bb.minX - vx0, x1: bb.maxX - vx0, top: H - (bb.maxY - vy0), bottom: H - (bb.minY - vy0),
          pixels: async () => {
            if (inline) return dataToCanvas(args[0]);
            // the page was released after the scan: decode it again and pick the same picture by its order on the page
            const { page: pg, ops: fresh } = await pageObjs(n);
            let seen = -1, nm = name;
            for (let j = 0; j < fresh.fnArray.length; j++) { const f = fresh.fnArray[j]; if (f === O.paintImageXObject || f === O.paintInlineImageXObject || f === O.paintImageXObjectRepeat) { seen++; if (seen === order) { nm = fresh.argsArray[j][0]; break; } } }
            const store = String(nm).startsWith('g_') ? pg.commonObjs : pg.objs;   // pictures used on several pages live in the shared store
            return dataToCanvas(await new Promise((res) => store.get(nm, res)));
          },
        });
      }
    }
    pages.push({ index: n - 1, width: W, height: H, words, images });
    try { page.cleanup(); } catch { /* ignore */ }
  }
  return { pages, destroy: () => { try { task.destroy(); } catch { /* already gone */ } } };
}
