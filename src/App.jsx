import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import Composer from './components/Composer.jsx';
import Settings from './components/Settings.jsx';
import EmptyState from './components/EmptyState.jsx';
import Toast from './components/Toast.jsx';
import { Msg, StylePicker } from './components/Skins.jsx';
import { PERSONAS, defCfg } from './lib/providers.js';
import { askStream, genImage, serverHeaders } from './lib/api.js';
import { kv, loadCfg, requestPersistence, saveCfg } from './lib/storage.js';
import { downloadBlob, readFile, say, uid } from './lib/util.js';

const THEME_COLOR = { dark: '#0b0b14', light: '#f3f3fa' };

export default function App() {
  const [cfg, setCfg] = useState(() => ({ ...defCfg, ...loadCfg() }));
  const [chats, setChats] = useState([]);
  const [cur, setCur] = useState(null);
  const [nav, setNav] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showStyles, setShowStyles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [query, setQuery] = useState('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const chatsRef = useRef(chats);
  const cfgRef = useRef(cfg);
  chatsRef.current = chats;
  cfgRef.current = cfg;

  /* ----- startup: load chats, handle share-target / shortcuts, PWA events ----- */
  useEffect(() => {
    window.__novaReady = true;
    requestPersistence();
    let alive = true;
    (async () => {
      let list = (await kv.get('chats')) || [];
      if (!Array.isArray(list)) list = [];
      const saved = loadCfg();
      if (saved.sync) {
        try {
          const r = await fetch('/api/chats', { headers: serverHeaders(saved) });
          if (r.ok) {
            const remote = await r.json();
            if (Array.isArray(remote) && remote.length > list.length) list = remote;
          }
        } catch {
          /* server not reachable: keep local chats */
        }
      }
      list = list.map((c) => ({
        ...c,
        msgs: (c.msgs || []).map((m) => (m.streaming ? { ...m, streaming: false, stopped: true } : m)),
      }));
      if (!alive) return;
      const params = new URLSearchParams(location.search);
      const shared = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join('\n');
      setChats(list);
      setCur(params.has('new') || shared ? null : list[0]?.id || null);
      setReady(true);
      if (shared) setTimeout(() => window.dispatchEvent(new CustomEvent('fill', { detail: shared })), 60);
      if (params.toString()) history.replaceState(null, '', location.pathname);
    })();

    const onInstall = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      say('NovaChat installed');
    };
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      alive = false;
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  /* ----- settings + theme ----- */
  useEffect(() => {
    saveCfg(cfg);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = cfg.theme === 'system' ? (mq.matches ? 'dark' : 'light') : cfg.theme;
      document.documentElement.dataset.theme = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[t]);
    };
    apply();
    if (cfg.theme !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [cfg]);

  /* ----- persistence (debounced) ----- */
  const persistLocal = useCallback(() => kv.set('chats', chatsRef.current), []);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(persistLocal, 400);
    return () => clearTimeout(t);
  }, [chats, ready, persistLocal]);
  useEffect(() => {
    if (!ready || !cfg.sync) return;
    const t = setTimeout(() => {
      fetch('/api/chats', { method: 'PUT', headers: serverHeaders(cfgRef.current), body: JSON.stringify(chatsRef.current) }).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [chats, ready, cfg.sync]);
  useEffect(() => {
    const flush = () => document.visibilityState === 'hidden' && persistLocal();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', persistLocal);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', persistLocal);
    };
  }, [persistLocal]);

  /* ----- chat helpers ----- */
  const chat = chats.find((c) => c.id === cur);
  const patchChat = (id, fn) => setChats((l) => l.map((c) => (c.id === id ? fn(c) : c)));
  const patchMsg = (cid, mid, p) =>
    patchChat(cid, (c) => ({ ...c, msgs: c.msgs.map((m) => (m.id === mid ? { ...m, ...(typeof p === 'function' ? p(m) : p) } : m)) }));

  // jump to the newest message when switching chats; while a reply streams, follow it
  // only if the reader has not scrolled up
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [cur]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 200) endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat?.msgs]);

  async function run(chatId, hist, imageMode, prompt) {
    const mid = uid();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setBusy(true);
    patchChat(chatId, (c) => ({ ...c, msgs: [...c.msgs, { id: mid, role: 'assistant', text: '', streaming: true, ts: Date.now() }] }));
    let latest = '';
    let timer = 0;
    try {
      if (imageMode) {
        const url = await genImage(cfg, prompt, ctl.signal);
        patchMsg(chatId, mid, { gen: 1, cap: prompt, imgs: [url], streaming: false });
      } else {
        const text = await askStream(
          cfg,
          hist,
          PERSONAS[cfg.persona][1],
          (t) => {
            latest = t;
            if (!timer) timer = setTimeout(() => { timer = 0; patchMsg(chatId, mid, { text: latest }); }, 50);
          },
          ctl.signal
        );
        clearTimeout(timer);
        patchMsg(chatId, mid, { text, streaming: false });
      }
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        if (latest) patchMsg(chatId, mid, { text: latest, streaming: false, stopped: true });
        else patchChat(chatId, (c) => ({ ...c, msgs: c.msgs.filter((m) => m.id !== mid) }));
      } else {
        patchMsg(chatId, mid, { streaming: false, err: 1, img: imageMode ? 1 : 0, text: '⚠️ ' + e.message });
      }
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
      setBusy(false);
    }
  }

  function send(text, attach, imageMode) {
    if (busy) return;
    if (imageMode && !text) return say('Describe the image you want first.');
    let c = chat;
    let id = cur;
    if (!c) {
      c = { id: uid(), title: '', msgs: [], ts: Date.now() };
      id = c.id;
      setChats((l) => [c, ...l]);
      setCur(id);
    }
    const user = { id: uid(), role: 'user', text, imgs: attach.imgs, files: attach.files, ts: Date.now() };
    const hist = [...c.msgs, user];
    patchChat(id, (x) => ({
      ...x,
      title: x.msgs.length ? x.title : (text || attach.files[0]?.name || 'New chat').slice(0, 40),
      msgs: [...x.msgs, user],
    }));
    run(id, hist, imageMode, text);
  }

  function retry() {
    if (busy || !chat) return;
    const msgs = chat.msgs;
    let i = msgs.length - 1;
    while (i >= 0 && msgs[i].role !== 'user') i--;
    if (i < 0) return;
    const lastReply = msgs[msgs.length - 1];
    const hist = msgs.slice(0, i + 1);
    patchChat(chat.id, (c) => ({ ...c, msgs: hist }));
    run(chat.id, hist, !!(lastReply?.gen || lastReply?.img), lastReply?.cap || msgs[i].text);
  }

  const stop = () => abortRef.current?.abort();
  const newChat = () => { setCur(null); setNav(false); };
  const pick = (id) => { setCur(id); setNav(false); };
  const remove = (id) => {
    if (!window.confirm('Delete this chat?')) return;
    setChats((l) => l.filter((c) => c.id !== id));
    if (id === cur) setCur(null);
  };
  const rename = (id) => {
    const c = chats.find((x) => x.id === id);
    const t = window.prompt('Rename chat', c?.title || '');
    if (t !== null && t.trim()) patchChat(id, (x) => ({ ...x, title: t.trim().slice(0, 60) }));
  };

  /* ----- data export / import ----- */
  const exportChats = () => {
    downloadBlob(new Blob([JSON.stringify({ app: 'novachat', version: 1, chats }, null, 2)], { type: 'application/json' }), `novachat-${new Date().toISOString().slice(0, 10)}.json`);
  };
  const importChats = async (file) => {
    try {
      const data = JSON.parse(await readFile(file, 'readAsText'));
      const incoming = Array.isArray(data) ? data : data.chats;
      if (!Array.isArray(incoming)) throw new Error('bad file');
      const have = new Set(chats.map((c) => c.id));
      const fresh = incoming.filter((c) => c && c.id && Array.isArray(c.msgs) && !have.has(c.id));
      setChats((l) => [...fresh, ...l]);
      say(`Imported ${fresh.length} chat${fresh.length === 1 ? '' : 's'}`);
    } catch {
      say('That file is not a NovaChat export.');
    }
  };
  const clearChats = () => {
    if (!window.confirm('Delete ALL chats on this device? This cannot be undone.')) return;
    setChats([]);
    setCur(null);
  };

  const install = installEvent && (async () => {
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  });
  const hasKey = !!cfg.keys[cfg.prov] || cfg.prov === 'custom';
  const last = chat?.msgs[chat.msgs.length - 1];

  return (
    <div className="app">
      <Sidebar
        chats={chats} cur={cur} query={query} setQuery={setQuery}
        pick={pick} add={newChat} del={remove} rename={rename} open={nav}
        openSettings={() => { setShowSettings(true); setNav(false); }} install={install}
      />
      {nav && <div className="scrim" onClick={() => setNav(false)} />}
      <main className="main">
        <TopBar
          title={chat?.title} cfg={cfg} online={online}
          menu={() => setNav(true)} toggleStyles={() => setShowStyles((s) => !s)} openSettings={() => setShowSettings(true)}
        />
        {showStyles && <StylePicker skin={cfg.skin} set={(k) => setCfg((c) => ({ ...c, skin: k }))} />}
        <div className="scroll" ref={scrollRef}>
          {chat?.msgs.length ? (
            chat.msgs.map((m) => <Msg key={m.id} m={m} skin={cfg.skin} last={m === last} busy={busy} onRetry={retry} />)
          ) : (
            <EmptyState hasKey={hasKey} openSettings={() => setShowSettings(true)} />
          )}
          <div ref={endRef} />
        </div>
        <Composer onSend={send} onStop={stop} busy={busy} />
      </main>
      {showSettings && (
        <Settings
          cfg={cfg} setCfg={setCfg} close={() => setShowSettings(false)} install={install}
          onExport={exportChats} onImport={importChats} onClearChats={clearChats}
        />
      )}
      <Toast />
    </div>
  );
}
