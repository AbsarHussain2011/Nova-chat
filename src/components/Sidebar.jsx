export default function Sidebar({ chats, cur, query, setQuery, pick, add, del, rename, open, openSettings, install }) {
  const q = query.trim().toLowerCase();
  const shown = q ? chats.filter((c) => (c.title || 'New chat').toLowerCase().includes(q)) : chats;
  return (
    <aside className={'side' + (open ? ' open' : '')} aria-label="Chats">
      <div className="brand">
        <img src="/icons/icon-192.png" alt="" width="34" height="34" />
        NovaChat
      </div>
      <button className="pri" onClick={add}>＋ New chat</button>
      {chats.length > 4 && (
        <input type="search" placeholder="Search chats" aria-label="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="list">
        {shown.map((c) => (
          <div key={c.id} className={'it' + (c.id === cur ? ' on' : '')} onClick={() => pick(c.id)}>
            <span title={c.title || 'New chat'}>{c.title || 'New chat'}</span>
            <button onClick={(e) => { e.stopPropagation(); rename(c.id); }} aria-label="Rename chat">✎</button>
            <button onClick={(e) => { e.stopPropagation(); del(c.id); }} aria-label="Delete chat">✕</button>
          </div>
        ))}
        {!shown.length && <p className="none">{q ? 'No chats match.' : 'No chats yet.'}</p>}
      </div>
      <button onClick={openSettings}>⚙ Settings &amp; API keys</button>
      {install && <button onClick={install}>⬇ Install app</button>}
    </aside>
  );
}
