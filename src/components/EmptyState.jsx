const SUGGESTIONS = [
  'Build a responsive pricing page with a live preview',
  'Explain async/await with a small example',
  'Review this code for bugs (attach a file or folder)',
  'Image mode: a neon cat riding a bike, cinematic',
];

export default function EmptyState({ hasKey, openSettings }) {
  return (
    <div className="empty">
      <img src="/icons/icon-192.png" alt="NovaChat logo" width="84" height="84" />
      <h2>What are we building?</h2>
      <p>Pick a provider, add your key, and start. Attach files, folders or images.</p>
      {!hasKey && (
        <button className="pri keybtn" onClick={openSettings}>Add your API key</button>
      )}
      <div className="sug">
        {SUGGESTIONS.map((t) => (
          <button key={t} onClick={() => window.dispatchEvent(new CustomEvent('fill', { detail: t }))}>{t}</button>
        ))}
      </div>
    </div>
  );
}
