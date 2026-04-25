import { fetchPageConfigMeta, fetchPageConfigResult } from './db';
import { isSupabaseConfigured } from './supabase';
import { cloneDefaultConfig, getPageConfigCacheKey, normalizePageConfig } from './siteConfig';

const STORAGE_KEY = 'hopeCity_pageConfig';
const STORAGE_VERSION = 3;
const STALE_CACHE_MS = 1000 * 60 * 60 * 24 * 7;
export const EVENT_KEY = 'pageConfigUpdated';

function writePageConfig(config, meta = {}) {
  try {
    const normalized = normalizePageConfig(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      meta: {
        cacheKey: meta?.cacheKey || getPageConfigCacheKey(normalized),
        generatedAt: meta?.generatedAt || null,
      },
      data: normalized,
    }));
  } catch {
    // Ignore localStorage write errors and continue with in-memory state.
  }
}

function readStoredEnvelope({ allowStale = true } = {}) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (parsed?.version === STORAGE_VERSION && parsed?.savedAt && parsed?.data) {
      const ageMs = Date.now() - new Date(parsed.savedAt).getTime();
      if (Number.isFinite(ageMs) && ageMs > STALE_CACHE_MS && !allowStale) {
        return null;
      }
      if (Number.isFinite(ageMs) && ageMs > STALE_CACHE_MS * 2) {
        return null;
      }
      return {
        data: normalizePageConfig(parsed.data),
        meta: {
          cacheKey: parsed?.meta?.cacheKey || getPageConfigCacheKey(parsed.data),
          generatedAt: parsed?.meta?.generatedAt || null,
        },
      };
    }

    return {
      data: normalizePageConfig(parsed),
      meta: {
        cacheKey: getPageConfigCacheKey(parsed),
        generatedAt: null,
      },
    };
  } catch {
    return null;
  }
}

export function getPageConfig({ allowStale = true } = {}) {
  return readStoredEnvelope({ allowStale })?.data || cloneDefaultConfig();
}

/** Async: from DB if Supabase configured, else sync localStorage/default. */
export async function getPageConfigAsync() {
  const cached = readStoredEnvelope();
  if (isSupabaseConfigured()) {
    if (cached?.meta?.cacheKey) {
      const remoteMeta = await fetchPageConfigMeta();
      if (remoteMeta?.cacheKey && remoteMeta.cacheKey === cached.meta.cacheKey) {
        writePageConfig(cached.data, remoteMeta);
        return cached.data;
      }
    }

    const fromDb = await fetchPageConfigResult();
    if (fromDb?.config) {
      const normalized = normalizePageConfig(fromDb.config);
      writePageConfig(normalized, fromDb.meta);
      return normalized;
    }
  }
  return cached?.data || cloneDefaultConfig();
}

export function savePageConfig(config, meta) {
  const normalized = normalizePageConfig(config || {});
  writePageConfig(normalized, meta);
  window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: normalized }));
}

/** Notify that DB was updated (so app refetches). */
export function notifyConfigUpdated(config) {
  if (config) {
    savePageConfig(config);
    return;
  }
  window.dispatchEvent(new CustomEvent(EVENT_KEY));
}

export function subscribePageConfig(callback) {
  const handler = (event) => {
    if (event?.detail) {
      callback(event.detail);
      return;
    }
    getPageConfigAsync().then(callback);
  };
  const storageHandler = (event) => {
    if (event.key !== STORAGE_KEY) return;
    callback(getPageConfig());
  };
  window.addEventListener(EVENT_KEY, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(EVENT_KEY, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export { cloneDefaultConfig };
