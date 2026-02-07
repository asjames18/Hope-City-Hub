import { supabase, isSupabaseConfigured } from './supabase';
import { defaultConfig } from './defaultConfig';

const CONFIG_ID = 1;

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

    const row = configRes.data;
    const eventRows = eventsRes.data || [];

    return {
      announcement: row?.announcement ?? defaultConfig.announcement,
      links: row?.links ?? defaultConfig.links,
      socials: row?.socials ?? defaultConfig.socials,
      events: eventRows.map((e) => ({
        id: e.id,
        title: e.title ?? '',
        date: e.date ?? '',
        time: e.time ?? '',
        signupUrl: e.signup_url ?? '',
      })),
    };
  } catch (err) {
    console.warn('fetchPageConfig error:', err);
    return null;
  }
}

/**
 * Save page config to Supabase. Requires authenticated user (admin).
 * Returns { ok: boolean, error?: string }.
 */
export async function savePageConfigToDb(config) {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  try {
    const configRes = await supabase
      .from('site_config')
      .update({
        announcement: config.announcement,
        links: config.links,
        socials: config.socials,
        updated_at: new Date().toISOString(),
      })
      .eq('id', CONFIG_ID)
      .select()
      .single();

    if (configRes.error) return { ok: false, error: configRes.error.message };

    // Replace all events: delete existing and insert current list
    const { data: existing } = await supabase.from('events').select('id');
    if (existing?.length) {
      await supabase.from('events').delete().in('id', existing.map((e) => e.id));
    }

    const events = Array.isArray(config.events) ? config.events : [];
    if (events.length) {
      const rows = events.map((e, i) => ({
        id: typeof e.id === 'string' && e.id.length > 10 ? e.id : undefined, // keep uuid if from DB
        title: e.title ?? '',
        date: e.date ?? '',
        time: e.time ?? '',
        signup_url: e.signupUrl ?? e.signup_url ?? '',
        order_index: i,
      }));
      // Supabase insert doesn't support supplying uuid on insert easily for gen_random_uuid default;
      // so we insert without id to get new uuids, unless we want to preserve ids (we'd need to upsert).
      const insertRows = rows.map(({ id: _id, ...r }) => r);
      const insertRes = await supabase.from('events').insert(insertRows).select();
      if (insertRes.error) return { ok: false, error: insertRes.error.message };
    }

    return { ok: true };
  } catch (err) {
    console.warn('savePageConfigToDb error:', err);
    return { ok: false, error: err?.message ?? 'Save failed' };
  }
}
