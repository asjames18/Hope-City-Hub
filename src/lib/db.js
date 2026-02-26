import { supabase, isSupabaseConfigured } from './supabase';
import { defaultConfig } from './defaultConfig';

const CONFIG_ID = 1;
const CLICK_ACTIONS = ['connect', 'give', 'prayer', 'directions', 'announcement'];
const ADMIN_AUTHZ_ERROR =
  'You are signed in, but not authorized for admin access. Contact your system administrator.';

function normalizeConfigPayload(row, eventRows) {
  return {
    announcement: row?.announcement ?? defaultConfig.announcement,
    links: row?.links ?? defaultConfig.links,
    socials: row?.socials ?? defaultConfig.socials,
    events: (eventRows || []).map((e) => ({
      id: e.id,
      title: e.title ?? '',
      date: e.date ?? '',
      time: e.time ?? '',
      signupUrl: e.signup_url ?? '',
    })),
  };
}

/**
 * Fetch full page config (site_config row + events). Returns shape expected by app.
 * If Supabase is not configured or request fails, returns null (caller should use localStorage/defaults).
 */
export async function fetchPageConfig() {
  if (!isSupabaseConfigured()) return null;

  try {
    const [configRes, eventsRes] = await Promise.all([
      supabase.from('site_config').select('announcement, links, socials').eq('id', CONFIG_ID).single(),
      supabase.from('events').select('id, title, date, time, signup_url, order_index').order('order_index', { ascending: true }),
    ]);

    if (configRes.error || eventsRes.error) {
      console.warn('Supabase fetch error:', configRes.error || eventsRes.error);
      return null;
    }

    return normalizeConfigPayload(configRes.data, eventsRes.data);
  } catch (err) {
    console.warn('fetchPageConfig error:', err);
    return null;
  }
}

/**
 * Save page config to Supabase via transactional RPC. Requires authenticated user (admin).
 * Returns { ok: boolean, config?: object, error?: string }.
 */
export async function savePageConfigToDb(config) {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const events = Array.isArray(config?.events)
    ? config.events.map((event, index) => ({
        id: typeof event?.id === 'string' ? event.id : null,
        title: String(event?.title || ''),
        date: String(event?.date || ''),
        time: String(event?.time || ''),
        signup_url: String(event?.signupUrl || event?.signup_url || ''),
        order_index: index,
      }))
    : [];

  try {
    const { data, error } = await supabase.rpc('admin_save_site_config', {
      p_announcement: config?.announcement ?? defaultConfig.announcement,
      p_links: config?.links ?? defaultConfig.links,
      p_socials: config?.socials ?? defaultConfig.socials,
      p_events: events,
    });

    if (error) {
      if (/not authorized/i.test(error.message || '')) {
        return { ok: false, error: ADMIN_AUTHZ_ERROR };
      }
      return { ok: false, error: error.message };
    }

    const normalized = normalizeConfigPayload(data?.site_config, data?.events);
    return { ok: true, config: normalized };
  } catch (err) {
    console.warn('savePageConfigToDb error:', err);
    return { ok: false, error: err?.message ?? 'Save failed' };
  }
}

function buildClickEventsQuery({ from, to } = {}) {
  let query = supabase.from('click_events').select('action, source, tag, target_url, path, query, created_at');
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  return query;
}

export async function logClickEvent(payload) {
  if (!isSupabaseConfigured()) return { ok: false, skipped: true };

  try {
    const action = (payload?.action || '').trim().toLowerCase();
    if (!CLICK_ACTIONS.includes(action)) return { ok: false, error: 'Invalid action' };

    const { data, error } = await supabase.rpc('log_click_event', {
      p_action: action,
      p_source: (payload?.source || 'unknown').trim(),
      p_tag: (payload?.tag || '').trim(),
      p_target_url: (payload?.targetUrl || '').trim(),
      p_path: (payload?.path || '/').trim(),
      p_query: payload?.query && typeof payload.query === 'object' ? payload.query : {},
    });
    if (error) {
      console.warn('logClickEvent error:', error);
      return { ok: false, error: error.message };
    }

    if (data?.ok === false) {
      return { ok: false, error: data?.error || 'click_rejected' };
    }

    return { ok: true, rateLimited: data?.error === 'rate_limited' };
  } catch (err) {
    console.warn('logClickEvent exception:', err);
    return { ok: false, error: err?.message || 'Failed to log click event' };
  }
}

export async function fetchClickSummary({ from, to } = {}) {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase.rpc('admin_click_summary', {
      p_from: from || null,
      p_to: to || null,
      p_limit: 5,
    });

    if (error) {
      if (/not authorized/i.test(error.message || '')) {
        throw new Error(ADMIN_AUTHZ_ERROR);
      }
      console.warn('fetchClickSummary error:', error);
      return null;
    }

    return {
      total: Number(data?.total ?? 0),
      byAction: CLICK_ACTIONS.reduce(
        (acc, action) => ({ ...acc, [action]: Number(data?.byAction?.[action] ?? 0) }),
        {}
      ),
      topSources: Array.isArray(data?.topSources) ? data.topSources : [],
      topTags: Array.isArray(data?.topTags) ? data.topTags : [],
    };
  } catch (err) {
    if (err?.message === ADMIN_AUTHZ_ERROR) {
      throw err;
    }
    console.warn('fetchClickSummary exception:', err);
    return null;
  }
}

export async function fetchRecentClickEvents({ limit = 50, from, to } = {}) {
  if (!isSupabaseConfigured()) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    let query = buildClickEventsQuery({ from, to }).order('created_at', { ascending: false });
    if (limit > 0) query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
      console.warn('fetchRecentClickEvents error:', error);
      return [];
    }

    return (data || []).map((row) => ({
      action: row.action ?? '',
      source: row.source ?? 'unknown',
      tag: row.tag ?? '',
      targetUrl: row.target_url ?? '',
      path: row.path ?? '',
      query: row.query ?? {},
      createdAt: row.created_at ?? '',
    }));
  } catch (err) {
    console.warn('fetchRecentClickEvents exception:', err);
    return [];
  }
}

export { CLICK_ACTIONS };
