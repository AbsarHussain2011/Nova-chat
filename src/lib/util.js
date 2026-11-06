export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const say = (text) => window.dispatchEvent(new CustomEvent('toast', { detail: text }));

export const readFile = (file, method) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r[method](file);
  });

export const mimeOf = (dataUrl) => dataUrl.slice(5, dataUrl.indexOf(';'));
export const b64Of = (dataUrl) => dataUrl.split(',')[1];

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function saveUrl(src, name) {
  try {
    if (src.startsWith('data:') || src.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = src;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      return;
    }
    downloadBlob(await (await fetch(src)).blob(), name);
  } catch {
    window.open(src, '_blank', 'noopener');
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    say('Copied');
  } catch {
    say('Copy is not available here');
  }
}

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
