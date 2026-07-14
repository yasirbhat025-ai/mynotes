/**
 * Replaces the Claude-artifact-only `window.storage` API with a real,
 * on-device store backed by IndexedDB. App.jsx calls window.storage.get/set
 * exactly as it did inside Claude — nothing in App.jsx needs to change.
 */

const DB_NAME = "mednotebook-store";
const STORE = "kv";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbSet(key, value) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbDelete(key) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbKeys() {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

window.storage = {
  async get(key /*, shared */) {
    const value = await idbGet(key);
    if (value === undefined) throw new Error(`No value stored for "${key}"`);
    return { key, value };
  },
  async set(key, value /*, shared */) {
    await idbSet(key, value);
    return { key, value };
  },
  async delete(key /*, shared */) {
    await idbDelete(key);
    return { key, deleted: true };
  },
  async list(prefix /*, shared */) {
    const keys = await idbKeys();
    const filtered = prefix ? keys.filter((k) => String(k).startsWith(prefix)) : keys;
    return { keys: filtered, prefix };
  },
};
