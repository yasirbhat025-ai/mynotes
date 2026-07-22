/**
 * Local cache (IndexedDB) + cloud sync (Supabase), behind the same
 * window.storage.get/set API that App.jsx already calls. App.jsx itself
 * needs no changes — this file is the only thing that knows about sync.
 *
 * Only the app's one main data key is synced to the cloud; everything
 * else behaves exactly like plain local storage.
 */

import { supabase } from "./supabase-client.js";

const DB_NAME = "mednotebook-store";
const STORE = "kv";
const SYNCED_KEY = "mednotebook-db";

let cachedUserId = null;
export function setSyncUserId(id) {
  cachedUserId = id;
}

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

async function cloudPull() {
  if (!cachedUserId) return null;
  try {
    const { data, error } = await supabase
      .from("notebook_data")
      .select("data")
      .eq("user_id", cachedUserId)
      .maybeSingle();
    if (error || !data) return null;
    return JSON.stringify(data.data);
  } catch (e) {
    return null; // offline or network error — caller falls back to local cache
  }
}

async function cloudPush(value) {
  if (!cachedUserId) return;
  try {
    await supabase.from("notebook_data").upsert({
      user_id: cachedUserId,
      data: JSON.parse(value),
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    // Offline — local IndexedDB copy is still safe; this will sync next time.
  }
}

window.storage = {
  async get(key /*, shared */) {
    if (key === SYNCED_KEY) {
      const cloud = await cloudPull();
      if (cloud !== null) {
        await idbSet(key, cloud);
        return { key, value: cloud };
      }
    }
    const value = await idbGet(key);
    if (value === undefined) throw new Error(`No value stored for "${key}"`);
    return { key, value };
  },
  async set(key, value /*, shared */) {
    await idbSet(key, value);
    if (key === SYNCED_KEY) cloudPush(value); // fire-and-forget, don't block the UI
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
