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
    if (!P || !P.Filesystem || !P.Share) throw new Error('Saving files needs the Filesystem and Share plugins. See APP.md.');
    const written = await P.Filesystem.writeFile({ path: name, data: await toBase64(blob), directory: 'CACHE' });
    await P.Share.share({ title: name, url: written.uri, dialogTitle: 'Save or send this backup' });
    return 'Choose where to keep the backup.';
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return `Saved ${name}.`;
}

/** Read a File chosen with <input type="file"> as text. */
export const readText = (file) => file.text();
