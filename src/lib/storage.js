// Chats live in IndexedDB. If IndexedDB is blocked (private mode, strict privacy
// settings) we fall back to localStorage so the app never hangs or goes blank.
let dbPromise;
const openDb = () =>
  (dbPromise ||= new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const q = indexedDB.open('nova', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('kv');
      q.onsuccess = () => finish(q.result);
      q.onerror = () => finish(null);
      q.onblocked = () => finish(null);
      setTimeout(() => finish(null), 3000);
    } catch {
      finish(null);
    }
  }));

const lsGet = (k) => {
  try {
    return JSON.parse(localStorage.getItem('nova.kv.' + k));
  } catch {
    return undefined;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem('nova.kv.' + k, JSON.stringify(v));
  } catch {
    /* quota or blocked */
  }
};

export const kv = {
  async get(key) {
    const db = await openDb();
    if (!db) return lsGet(key);
    return new Promise((resolve) => {
      try {
        const q = db.transaction('kv').objectStore('kv').get(key);
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => resolve(undefined);
      } catch {
        resolve(lsGet(key));
      }
    });
  },
  async set(key, value) {
    const db = await openDb();
    if (!db) return lsSet(key, value);
    return new Promise((resolve) => {
      try {
        const t = db.transaction('kv', 'readwrite');
        t.objectStore('kv').put(value, key);
        t.oncomplete = () => resolve(true);
        t.onerror = t.onabort = () => resolve(false);
      } catch {
        lsSet(key, value);
        resolve(false);
      }
    });
  },
};

export const loadCfg = () => {
  try {
    return JSON.parse(localStorage.getItem('nova.cfg')) || {};
  } catch {
    return {};
  }
};
export const saveCfg = (cfg) => {
  try {
    localStorage.setItem('nova.cfg', JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
};

// Ask the browser not to evict our data when storage is tight (important for an installed PWA).
export const requestPersistence = () => navigator.storage?.persist?.().catch(() => {});
