import { fetchPageConfig as fetchFromDb } from './db';
import { isSupabaseConfigured } from './supabase';
import { defaultConfig } from './defaultConfig';

const STORAGE_KEY = 'hopeCity_pageConfig';
export const EVENT_KEY = 'pageConfigUpdated';

function mergeDeep(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (key === 'events') {
      out[key] = Array.isArray(source[key]) ? source[key] : target[key];
    } else if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = mergeDeep(target[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

export function getPageConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(defaultConfig));
    const parsed = JSON.parse(raw);
    return mergeDeep(JSON.parse(JSON.stringify(defaultConfig)), parsed);
  } catch {
    return JSON.parse(JSON.stringify(defaultConfig));
  }
}

/** Async: from DB if Supabase configured, else sync localStorage/default. */
export async function getPageConfigAsync() {
  if (isSupabaseConfigured()) {
    const fromDb = await fetchFromDb();
    if (fromDb) return mergeDeep(JSON.parse(JSON.stringify(defaultConfig)), fromDb);
  }
  return getPageConfig();
}

export function savePageConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent(EVENT_KEY));
}

/** Notify that DB was updated (so app refetches). */
export function notifyConfigUpdated() {
  window.dispatchEvent(new CustomEvent(EVENT_KEY));
}

export function subscribePageConfig(callback) {
  const handler = () => {
    getPageConfigAsync().then(callback);
  };
  window.addEventListener(EVENT_KEY, handler);
  return () => window.removeEventListener(EVENT_KEY, handler);
}

export { defaultConfig };
