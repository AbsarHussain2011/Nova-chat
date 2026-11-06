import { PROVIDERS } from '../lib/providers.js';

export default function TopBar({ title, cfg, online, menu, toggleStyles, openSettings }) {
  return (
    <header className="top">
      <button className="menu" onClick={menu} aria-label="Open menu">☰</button>
      <h1>{title || 'New chat'}</h1>
      {!online && <span className="off" role="status">Offline</span>}
      <span className="pill">{PROVIDERS[cfg.prov].n} · {cfg.model || '—'}</span>
      <button onClick={toggleStyles} aria-label="Chat style">🎨</button>
      <button onClick={openSettings} aria-label="Settings">⚙</button>
    </header>
  );
}
