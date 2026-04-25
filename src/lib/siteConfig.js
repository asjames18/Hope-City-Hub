import { defaultConfig } from './defaultConfig';

export const DEFAULT_SITE_ICON_URL = '/favicon.svg';

export function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(defaultConfig));
}

export function mergePageConfig(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source || {})) {
    if (key === 'events') {
      out[key] = Array.isArray(source[key]) ? source[key] : target[key];
    } else if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = mergePageConfig(target[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

function normalizeEvent(event) {
  return {
    id: event?.id ?? null,
    title: String(event?.title || ''),
    date: String(event?.date || ''),
    time: String(event?.time || ''),
    location: String(event?.location || ''),
    signupUrl: String(event?.signupUrl || event?.signup_url || ''),
  };
}

export function normalizePageConfig(input) {
  const base = cloneDefaultConfig();
  const merged = mergePageConfig(base, input || {});
  return {
    announcement: { ...base.announcement, ...(merged?.announcement || {}) },
    links: { ...base.links, ...(merged?.links || {}) },
    socials: { ...base.socials, ...(merged?.socials || {}) },
    events: Array.isArray(merged?.events) ? merged.events.map(normalizeEvent) : [],
  };
}

export function getExternalHref(value) {
  const href = typeof value === 'string' ? value.trim() : '';
  return href && href !== '#' ? href : '';
}

export function getSiteIconUrl(config) {
  return getExternalHref(config?.links?.iconUrl) || DEFAULT_SITE_ICON_URL;
}

export function getPageConfigCacheKey(config) {
  return JSON.stringify(normalizePageConfig(config));
}
