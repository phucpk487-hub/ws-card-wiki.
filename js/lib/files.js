// Save a file for the person. In the browser this is a normal download. Inside the Capacitor app
// (where <a download> does nothing) it writes to the app's documents folder and opens the share sheet,
// provided the @capacitor/filesystem and @capacitor/share plugins are installed (see APP.md).
export const isNativeApp = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Returns a short message describing what happened. */
export async function saveFile(name, blob) {
  const P = window.Capacitor && window.Capacitor.Plugins;
  if (isNativeApp()) {
    if (!P || !P.Filesystem) throw new Error('Saving files needs the Filesystem plugin. See APP.md.');
    const data = await toBase64(blob);
    // Straight into the phone's Downloads folder (then Documents); only if both are refused, offer the share sheet.
    for (const [directory, path, where] of [['EXTERNAL_STORAGE', `Download/${name}`, 'Downloads'], ['DOCUMENTS', name, 'Documents']]) {
      try { await P.Filesystem.writeFile({ path, data, directory, recursive: true }); return `Saved ${name} to your ${where} folder.`; } catch { /* try the next place */ }
    }
    if (!P.Share) throw new Error('The phone would not let the app save a file here.');
    const written = await P.Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
    await P.Share.share({ title: name, url: written.uri, dialogTitle: 'Save or send this file' });
    return 'Choose where to keep the file.';
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return `Saved ${name}.`;
}

/** Read a File chosen with <input type="file"> as text. */
export const readText = (file) => file.text();
