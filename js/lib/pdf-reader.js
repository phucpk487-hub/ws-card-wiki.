// Reads a PDF in the browser with pdf.js and returns what sheet-parser.js needs, plus a way
// to cut card images out of the rendered pages. pdf.js is loaded on demand from cdnjs
// (the only script host the page may use), so the rest of the app never pays for it.
//
// NOTE: written against the pdf.js 3.11 UMD API. The parsing logic downstream is unit tested;
// this adapter can only be exercised in a browser with network access to cdnjs.
const VERSION = '3.11.174';
const BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VERSION}`;
export const RENDER_SCALE = 5; // 5x keeps card art near its native 460px width without exceeding phone canvas limits

let loading = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${BASE}/pdf.min.js`;
      s.onload = () => {
        if (!window.pdfjsLib) { reject(new Error('The PDF library loaded but did not start.')); return; }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.js`;
        resolve(window.pdfjsLib);
      };
      s.onerror = () => { loading = null; reject(new Error('Could not download the PDF library. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const mul = (A, B) => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];

/** Image placements on a page, from the operator list (tracks the transform stack). */
async function imagePlacements(pdfjs, page, height) {
  const { OPS } = pdfjs;
  const list = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const out = [];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i], args = list.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args && args[0]) ctm = mul(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      // images are drawn into the unit square of the current transform
      const xs = [0, 1, 0, 1].map((u, k) => ctm[0] * u + ctm[2] * (k < 2 ? 0 : 1) + ctm[4]);
      const ys = [0, 1, 0, 1].map((u, k) => ctm[1] * u + ctm[3] * (k < 2 ? 0 : 1) + ctm[5]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      out.push({ x: x0, top: height - y1, w: x1 - x0, h: y1 - y0 });
    }
  }
  return out;
}

/**
 * Open a PDF File. Returns { pages, renderBox(pageIndex, bbox) → canvas, destroy() }.
 * `pages` is the structure sheet-parser.js expects.
 */
export async function openPdf(file, onProgress = () => {}) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  } catch (e) {
    throw new Error(e && e.name === 'PasswordException' ? 'This PDF is password protected.' : 'This file could not be read as a PDF.');
  }
  const pages = [];
  const handles = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onProgress(`Reading page ${n} of ${doc.numPages}`, n / doc.numPages);
    const page = await doc.getPage(n);
    const view = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    const items = text.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => {
        const h = it.height || Math.abs(it.transform[3]) || 8;
        return { str: it.str, x: it.transform[4], top: view.height - it.transform[5] - h * 0.9, w: it.width, h };
      });
    const images = await imagePlacements(pdfjs, page, view.height);
    pages.push({ width: view.width, height: view.height, items, images });
    handles.push(page);
  }

  const rendered = new Map(); // keep only the page being cut up
  async function renderPage(i) {
    if (rendered.has(i)) return rendered.get(i);
    rendered.clear();
    const page = handles[i];
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    rendered.set(i, canvas);
    return canvas;
  }

  return {
    pages,
    async cropImage(pageIndex, box) {
      const src = await renderPage(pageIndex);
      const s = RENDER_SCALE;
      const x = Math.max(0, Math.round(box.x * s)), y = Math.max(0, Math.round(box.top * s));
      const w = Math.min(src.width - x, Math.round(box.w * s)), h = Math.min(src.height - y, Math.round(box.h * s));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d', { willReadFrequently: true }).drawImage(src, x, y, w, h, 0, 0, w, h);
      return c;
    },
    destroy() { rendered.clear(); doc.destroy(); },
  };
}
