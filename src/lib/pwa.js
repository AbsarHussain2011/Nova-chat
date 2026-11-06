import { say } from './util.js';

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const start = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000))
      .catch(() => {});
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) say('NovaChat was updated. Reload to use the new version.');
      hadController = true;
    });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

// Clears the service worker and cached files only (chats and settings are kept).
export async function resetApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* ignore */
  }
  location.reload();
}
