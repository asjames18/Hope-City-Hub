const DEFAULT_DESCRIPTION = 'Hope City Highlands in Sebring, Florida. Belong. Believe. Become.';
const DEFAULT_TITLE = 'Hope City Highlands | Sebring, FL';

function getSiteOrigin() {
  const fromEnv = import.meta.env.VITE_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

function toAbsoluteUrl(path = '/') {
  const origin = getSiteOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function upsertMeta(key, value, content, isProperty = false) {
  if (typeof document === 'undefined') return;
  const selector = isProperty ? `meta[property="${key}"]` : `meta[name="${key}"]`;
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(isProperty ? 'property' : 'name', key);
    document.head.appendChild(tag);
  }
  tag.setAttribute(value, content);
}

function upsertLink(rel, href) {
  if (typeof document === 'undefined') return;
  let link = document.head.querySelector(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', rel);
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

export function applySeo({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  canonicalPath = '/',
  ogImagePath = '/favicon.svg',
  noindex = false,
} = {}) {
  if (typeof document === 'undefined') return;

  const canonicalUrl = toAbsoluteUrl(canonicalPath);
  const ogImage = ogImagePath.startsWith('http') ? ogImagePath : toAbsoluteUrl(ogImagePath);

  document.title = title;
  upsertMeta('description', 'content', description);
  upsertMeta('robots', 'content', noindex ? 'noindex, nofollow' : 'index, follow');

  upsertMeta('og:title', 'content', title, true);
  upsertMeta('og:description', 'content', description, true);
  upsertMeta('og:type', 'content', 'website', true);
  upsertMeta('og:url', 'content', canonicalUrl, true);
  upsertMeta('og:image', 'content', ogImage, true);

  upsertMeta('twitter:card', 'content', 'summary_large_image');
  upsertMeta('twitter:title', 'content', title);
  upsertMeta('twitter:description', 'content', description);
  upsertMeta('twitter:image', 'content', ogImage);

  upsertLink('canonical', canonicalUrl);
}

export function setStructuredData(id, data) {
  if (typeof document === 'undefined' || !id || !data) return;
  let script = document.head.querySelector(`script[data-seo-id="${id}"]`);
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo-id', id);
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

export function removeStructuredData(id) {
  if (typeof document === 'undefined' || !id) return;
  const script = document.head.querySelector(`script[data-seo-id="${id}"]`);
  if (script) script.remove();
}
