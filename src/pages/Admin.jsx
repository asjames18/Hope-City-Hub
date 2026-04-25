import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  Lock,
  LogOut,
  Megaphone,
  Link2,
  Calendar,
  Plus,
  Trash2,
  Loader2,
  UserPlus,
  BarChart3,
  AlertTriangle,
  Image as ImageIcon,
} from 'lucide-react';
import { notifyConfigUpdated } from '../lib/pageConfig';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  CLICK_ACTIONS,
  fetchRecentAIChats,
  fetchClickSummary,
  fetchPageConfig,
  fetchRecentClickEvents,
  savePageConfigToDb,
} from '../lib/db';
import { parseEventDateTime } from '../lib/events';
import { cloneDefaultConfig, getSiteIconUrl, normalizePageConfig } from '../lib/siteConfig';

const RANGE_TO_DAYS = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
};

const AI_INTENT_LABELS = {
  prayer: 'Prayer',
  church_info: 'Church Info',
  care_support: 'Care Support',
  urgent_support: 'Urgent Support',
  general: 'General',
};

const LINK_LABELS = {
  connectCard: 'Connect card',
  prayerRequest: 'Prayer request',
  giving: 'Giving',
  baptism: 'Baptism',
  dreamTeam: 'Dream team',
  directions: 'Directions',
  youtube: 'YouTube',
};

const SOCIAL_LABELS = {
  website: 'Website',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidOptionalUrl(value, { allowHash = true } = {}) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (allowHash && text === '#') return true;
  return isValidHttpUrl(text);
}

function collectConfigIssues(config) {
  const errors = {};
  const warnings = {};

  Object.entries(config?.links || {}).forEach(([key, value]) => {
    if (!isValidOptionalUrl(value)) {
      errors[`links.${key}`] = 'Use a valid http(s) URL, leave blank, or use #.';
    }
  });

  Object.entries(config?.socials || {}).forEach(([key, value]) => {
    if (!isValidOptionalUrl(value)) {
      errors[`socials.${key}`] = 'Use a valid http(s) URL, leave blank, or use #.';
    }
  });

  if (!isValidOptionalUrl(config?.announcement?.link)) {
    errors['announcement.link'] = 'Use a valid http(s) URL, leave blank, or use #.';
  }

  (config?.events || []).forEach((event, index) => {
    if (!String(event?.title || '').trim()) {
      errors[`events.${index}.title`] = 'Title is required.';
    }
    if (!String(event?.date || '').trim()) {
      errors[`events.${index}.date`] = 'Date is required.';
    }
    if (!String(event?.time || '').trim()) {
      errors[`events.${index}.time`] = 'Time is required.';
    }
    if (!isValidOptionalUrl(event?.signupUrl)) {
      errors[`events.${index}.signupUrl`] = 'Use a valid http(s) URL, leave blank, or use #.';
    }

    if (
      String(event?.date || '').trim()
      && String(event?.time || '').trim()
      && !parseEventDateTime(event?.date, event?.time, { defaultHour: 23, defaultMinute: 59 })
    ) {
      warnings[`events.${index}.date`] = 'Date/time is valid for display, but cannot be parsed for cleanup/scheduling.';
    }
  });

  return { errors, warnings, hasBlocking: Object.keys(errors).length > 0 };
}

export default function Admin() {
  const useDb = isSupabaseConfigured();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');

  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [config, setConfig] = useState(() => cloneDefaultConfig());
  const [baselineConfigJson, setBaselineConfigJson] = useState(() => JSON.stringify(cloneDefaultConfig()));
  const [configLoading, setConfigLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [engagementRange, setEngagementRange] = useState('7d');
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [engagementError, setEngagementError] = useState('');
  const [engagementSummary, setEngagementSummary] = useState(null);
  const [recentClickEvents, setRecentClickEvents] = useState([]);
  const [recentAIChats, setRecentAIChats] = useState([]);

  const validation = useMemo(() => collectConfigIssues(config), [config]);
  const hasUnsavedChanges = useMemo(() => JSON.stringify(config) !== baselineConfigJson, [config, baselineConfigJson]);

  useEffect(() => {
    if (!useDb) {
      setAuthChecked(true);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setAuthenticated(!!session);
      setAuthChecked(true);
      if (!session) setAuthError('Please log in to access admin.');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const loggedIn = !!session;
      setAuthenticated(loggedIn);
      if (!loggedIn) {
        setAuthError('Session expired. Please log in again.');
        setInviteMessage('');
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [useDb]);

  useEffect(() => {
    if (!authenticated || !useDb) return;

    setConfigLoading(true);
    fetchPageConfig()
      .then((c) => {
        if (!c) return;
        const normalized = normalizePageConfig(c);
        setConfig(normalized);
        setBaselineConfigJson(JSON.stringify(normalized));
      })
      .finally(() => {
        setConfigLoading(false);
      });
  }, [authenticated, useDb]);

  useEffect(() => {
    if (!authenticated || !useDb) {
      setEngagementSummary(null);
      setRecentClickEvents([]);
      setRecentAIChats([]);
      return;
    }

    const now = new Date();
    const days = RANGE_TO_DAYS[engagementRange] ?? 7;
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const to = now.toISOString();

    setEngagementLoading(true);
    setEngagementError('');

    Promise.all([
      fetchClickSummary({ from, to }),
      fetchRecentClickEvents({ limit: 50, from, to }),
      fetchRecentAIChats({ limit: 25, from, to }),
    ])
      .then(([summary, recent, chats]) => {
        if (!summary) {
          setEngagementError('Unable to load click summary. Verify database migrations and your admin permissions.');
        }
        setEngagementSummary(summary);
        setRecentClickEvents(recent);
        setRecentAIChats(chats);
      })
      .catch((err) => {
        setEngagementError(err?.message || 'Failed to load engagement data');
      })
      .finally(() => {
        setEngagementLoading(false);
      });
  }, [authenticated, useDb, engagementRange]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleSupabaseLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setEmail('');
    setPassword('');
    setInviteMessage('');
  };

  const handleInviteAdmin = async (e) => {
    e.preventDefault();
    const toEmail = inviteEmail.trim();
    if (!toEmail) return;

    setInviteMessage('');
    setInviteLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setInviteMessage('Session expired. Please log in again.');
        setInviteLoading(false);
        return;
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')}/functions/v1/invite-admin`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: toEmail }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteMessage(data?.error ?? data?.message ?? `Request failed (${res.status})`);
        setInviteLoading(false);
        return;
      }

      setInviteMessage(`Invitation sent to ${toEmail}. They can set their password from the email link.`);
      setInviteEmail('');
    } catch (err) {
      setInviteMessage(err?.message ?? 'Failed to send invite.');
    }

    setInviteLoading(false);
  };

  const handleLogout = () => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Log out anyway?')) {
      return;
    }
    void supabase.auth.signOut();
    setAuthenticated(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');

    if (validation.hasBlocking) {
      setSaveError('Fix validation errors before saving.');
      return;
    }

    setSaveLoading(true);
    const result = await savePageConfigToDb(config);
    setSaveLoading(false);

    if (!result.ok) {
      setSaveError(result.error || 'Save failed');
      return;
    }

    const nextConfig = result.config ? normalizePageConfig(result.config) : config;
    if (result.config) {
      setConfig(nextConfig);
      setBaselineConfigJson(JSON.stringify(nextConfig));
    } else {
      setBaselineConfigJson(JSON.stringify(config));
    }

    notifyConfigUpdated(nextConfig);
    setSaved(true);
    setLastSavedAt(new Date());
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (section, key, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
  };

  const updateEvent = (index, field, value) => {
    setConfig((prev) => ({
      ...prev,
      events: prev.events.map((event, i) => (i === index ? { ...event, [field]: value } : event)),
    }));
  };

  const addEvent = () => {
    setConfig((prev) => ({
      ...prev,
      events: [...(prev.events || []), { id: `temp-${Date.now()}`, title: '', date: '', time: '', location: '', locationName: '', locationAddress: '', signupUrl: '' }],
    }));
  };

  const removeEvent = (index) => {
    setConfig((prev) => ({
      ...prev,
      events: prev.events.filter((_, i) => i !== index),
    }));
  };

  const deletePastEvents = () => {
    const now = new Date();
    setConfig((prev) => ({
      ...prev,
      events: (prev.events || []).filter((event) => {
        const parsed = parseEventDateTime(event?.date, event?.time, { defaultHour: 23, defaultMinute: 59 });
        if (!parsed) return true;
        return parsed.start.getTime() >= now.getTime();
      }),
    }));
  };

  if (!useDb) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 mx-auto mb-4 flex items-center justify-center">
            <Lock className="w-6 h-6 text-amber-700" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Admin unavailable</h1>
          <p className="text-sm text-gray-600 mt-3">
            Admin requires Supabase configuration and authenticated sign-in. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable secure access.
          </p>
          <Link to="/" className="inline-block mt-5 text-sm font-semibold text-teal-900 hover:underline">
            Back to site
          </Link>
        </div>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-900" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-6 h-6 text-teal-900" />
            <h1 className="text-xl font-bold text-gray-900">Admin Login</h1>
          </div>
          {authError && <p className="text-sm text-red-600 mb-4 bg-red-50 p-3 rounded-lg">{authError}</p>}
          <form onSubmit={handleSupabaseLogin} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-teal-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 rounded-xl font-bold bg-teal-900 text-white hover:bg-teal-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Log in
            </button>
          </form>
          <Link to="/" className="block text-center text-sm text-gray-500 mt-4 hover:underline">
            Back to site
          </Link>
        </div>
      </div>
    );
  }

  const errors = validation.errors;
  const warnings = validation.warnings;
  const siteIconUrl = getSiteIconUrl(config);

  return (
    <div className="min-h-screen bg-gray-100 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
          <Link
            to="/"
            onClick={(e) => {
              if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave this page?')) {
                e.preventDefault();
              }
            }}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="font-bold text-lg text-gray-900">Page Admin</h1>
            <button
              type="button"
              onClick={handleLogout}
              className="ml-2 flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={configLoading || saveLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-900 px-4 py-3 font-bold text-white hover:bg-teal-800 disabled:opacity-50 sm:w-auto"
          >
            {(configLoading || saveLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : saveLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {saveError && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{saveError}</div>
      )}

      {(hasUnsavedChanges || lastSavedAt || Object.keys(errors).length > 0) && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-white border border-gray-200 text-xs text-gray-600 flex flex-wrap items-center gap-3">
          {hasUnsavedChanges ? <span className="font-semibold text-amber-700">Unsaved changes</span> : <span className="font-semibold text-green-700">All changes saved</span>}
          {lastSavedAt ? <span>Last saved: {lastSavedAt.toLocaleString()}</span> : null}
          {Object.keys(errors).length > 0 ? (
            <span className="inline-flex items-center gap-1 text-red-700">
              <AlertTriangle className="w-3.5 h-3.5" /> {Object.keys(errors).length} validation error(s)
            </span>
          ) : null}
        </div>
      )}

      {configLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-900" />
        </div>
      ) : (
        <main className="mx-auto w-full max-w-xl space-y-6 p-4 sm:space-y-8">
          <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-4">
              <ImageIcon className="w-5 h-5 text-teal-900" />
              Branding
            </h2>
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-200 p-3">
              <img
                src={siteIconUrl}
                alt="Current Hope City Highlands icon"
                className="h-12 w-12 rounded-xl bg-teal-900 object-cover"
              />
              <div>
                <p className="text-sm font-bold text-gray-900">Website icon</p>
                <p className="text-xs text-gray-500">Leave blank to use the built-in Hope City icon.</p>
              </div>
            </div>
            <input
              type="url"
              placeholder="Icon image URL (optional)"
              value={config.links?.iconUrl ?? ''}
              onChange={(e) => update('links', 'iconUrl', e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-teal-500 ${errors['links.iconUrl'] ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
            />
            {errors['links.iconUrl'] && <p className="mt-2 text-xs text-red-600">{errors['links.iconUrl']}</p>}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-4">
              <UserPlus className="w-5 h-5 text-teal-900" />
              Add admin
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Invite another admin by email. They will receive a link to set their password and sign in.
            </p>
            <form onSubmit={handleInviteAdmin} className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                placeholder="admin@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500"
              />
              <button
                type="submit"
                disabled={inviteLoading || !inviteEmail.trim()}
                className="flex items-center justify-center gap-2 rounded-xl bg-teal-900 px-4 py-3 font-bold text-white hover:bg-teal-800 disabled:opacity-50 sm:w-auto"
              >
                {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Send invite
              </button>
            </form>
            {inviteMessage && (
              <p className={`mt-3 text-sm rounded-lg p-3 ${inviteMessage.startsWith('Invitation sent') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                {inviteMessage}
              </p>
            )}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-4">
              <BarChart3 className="w-5 h-5 text-teal-900" />
              Engagement
            </h2>

            <div className="mb-4 flex flex-wrap gap-2">
              {['24h', '7d', '30d'].map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setEngagementRange(range)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${
                    engagementRange === range
                      ? 'bg-teal-900 text-white border-teal-900'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            {engagementError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{engagementError}</div>
            )}

            {engagementLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-teal-900" />
              </div>
            ) : (
              <>
                <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">Total clicks</p>
                    <p className="text-2xl font-extrabold text-teal-900">{engagementSummary?.total ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">Top source</p>
                    <p className="text-sm font-bold text-teal-900 truncate">
                      {engagementSummary?.topSources?.[0]?.label ?? 'n/a'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {engagementSummary?.topSources?.[0]?.count ?? 0} clicks
                    </p>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3">
                  {CLICK_ACTIONS.map((action) => (
                    <div key={action} className="rounded-xl border border-gray-200 p-3">
                      <p className="text-xs text-gray-500 capitalize">{action}</p>
                      <p className="text-xl font-bold text-gray-900">
                        {engagementSummary?.byAction?.[action] ?? 0}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-xs font-bold text-gray-700 mb-2">Top sources</p>
                    {(engagementSummary?.topSources?.length ?? 0) === 0 ? (
                      <p className="text-xs text-gray-500">No data</p>
                    ) : (
                      <div className="space-y-1">
                        {(engagementSummary?.topSources ?? []).map((item) => (
                          <div key={item.label} className="text-xs text-gray-700 flex justify-between gap-2">
                            <span className="truncate">{item.label}</span>
                            <span className="font-semibold">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-xs font-bold text-gray-700 mb-2">Top tags</p>
                    {(engagementSummary?.topTags?.length ?? 0) === 0 ? (
                      <p className="text-xs text-gray-500">No data</p>
                    ) : (
                      <div className="space-y-1">
                        {(engagementSummary?.topTags ?? []).map((item) => (
                          <div key={item.label} className="text-xs text-gray-700 flex justify-between gap-2">
                            <span className="truncate">{item.label}</span>
                            <span className="font-semibold">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-700 mb-2">Recent events</p>
                  <div className="space-y-2 sm:hidden">
                    {recentClickEvents.length === 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-500">
                        No click events in this range.
                      </div>
                    ) : (
                      recentClickEvents.map((event, idx) => (
                        <div key={`${event.createdAt}-${idx}`} className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-700">
                          <p><span className="font-semibold text-gray-900">Time:</span> {event.createdAt ? new Date(event.createdAt).toLocaleString() : 'n/a'}</p>
                          <p><span className="font-semibold text-gray-900">Action:</span> {event.action || 'n/a'}</p>
                          <p><span className="font-semibold text-gray-900">Source:</span> {event.source || 'unknown'}</p>
                          <p><span className="font-semibold text-gray-900">Tag:</span> {event.tag || '-'}</p>
                          <p className="break-all"><span className="font-semibold text-gray-900">Target:</span> {event.targetUrl || '-'}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="hidden overflow-x-auto rounded-xl border border-gray-200 sm:block">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-2 font-semibold text-gray-600">Time</th>
                          <th className="text-left p-2 font-semibold text-gray-600">Action</th>
                          <th className="text-left p-2 font-semibold text-gray-600">Source</th>
                          <th className="text-left p-2 font-semibold text-gray-600">Tag</th>
                          <th className="text-left p-2 font-semibold text-gray-600">Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentClickEvents.length === 0 ? (
                          <tr>
                            <td className="p-3 text-gray-500" colSpan={5}>No click events in this range.</td>
                          </tr>
                        ) : (
                          recentClickEvents.map((event, idx) => (
                            <tr key={`${event.createdAt}-${idx}`} className="border-t border-gray-100">
                              <td className="p-2 text-gray-600 whitespace-nowrap">
                                {event.createdAt ? new Date(event.createdAt).toLocaleString() : 'n/a'}
                              </td>
                              <td className="p-2 text-gray-800">{event.action || 'n/a'}</td>
                              <td className="p-2 text-gray-800">{event.source || 'unknown'}</td>
                              <td className="p-2 text-gray-800">{event.tag || '-'}</td>
                              <td className="p-2 text-gray-600 max-w-[160px] truncate" title={event.targetUrl || ''}>
                                {event.targetUrl || '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-gray-700">Recent AI chats</p>
                    <p className="text-[11px] text-gray-500">Admin-only. These may contain sensitive prayer requests or support questions and are retained for 30 days.</p>
                  </div>
                  <div className="space-y-2">
                    {recentAIChats.length === 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-500">
                        No AI chat activity in this range.
                      </div>
                    ) : (
                      recentAIChats.map((chat, idx) => (
                        <details
                          key={`${chat.createdAt}-${idx}`}
                          className="rounded-xl border border-gray-200 bg-white p-3"
                        >
                          <summary className="cursor-pointer list-none">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                    chat.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                  }`}>
                                    {chat.success ? 'Success' : 'Error'}
                                  </span>
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                    {chat.provider || 'unknown provider'}
                                  </span>
                                  {chat.intent ? (
                                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700">
                                      {AI_INTENT_LABELS[chat.intent] || 'Unknown'}
                                    </span>
                                  ) : null}
                                  {chat.model ? (
                                    <span className="text-[11px] text-gray-500">{chat.model}</span>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-sm font-semibold text-gray-900">
                                  {chat.prompt || 'No prompt recorded'}
                                </p>
                                <p className="mt-1 text-[11px] text-gray-500">
                                  {chat.createdAt ? new Date(chat.createdAt).toLocaleString() : 'n/a'}
                                  {chat.path ? ` · ${chat.path}` : ''}
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-teal-900">View transcript</span>
                            </div>
                          </summary>
                          <div className="mt-3 space-y-3 border-t border-gray-100 pt-3 text-xs text-gray-700">
                            <div>
                              <p className="mb-1 font-bold text-gray-900">User prompt</p>
                              <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3">{chat.prompt || 'n/a'}</p>
                            </div>
                            <div>
                              <p className="mb-1 font-bold text-gray-900">{chat.success ? 'AI response' : 'Error'}</p>
                              <p className={`whitespace-pre-wrap rounded-lg p-3 ${chat.success ? 'bg-lime-50 text-teal-900' : 'bg-red-50 text-red-700'}`}>
                                {chat.success ? (chat.response || 'No response recorded') : (chat.error || 'Unknown error')}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                              <span>Origin: {chat.origin || 'n/a'}</span>
                              <span>Path: {chat.path || 'n/a'}</span>
                            </div>
                          </div>
                        </details>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-4">
              <Megaphone className="w-5 h-5 text-teal-900" />
              Announcement Banner
            </h2>
            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={config.announcement?.active ?? false}
                onChange={(e) => update('announcement', 'active', e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium">Show banner</span>
            </label>
            <input
              type="text"
              placeholder="Banner text"
              value={config.announcement?.text ?? ''}
              onChange={(e) => update('announcement', 'text', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 mb-3 focus:ring-2 focus:ring-teal-500"
            />
            <input
              type="url"
              placeholder="Link URL (optional)"
              value={config.announcement?.link ?? ''}
              onChange={(e) => update('announcement', 'link', e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-teal-500 ${errors['announcement.link'] ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
            />
            {errors['announcement.link'] && <p className="mt-2 text-xs text-red-600">{errors['announcement.link']}</p>}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-4">
              <Link2 className="w-5 h-5 text-teal-900" />
              Links
            </h2>
            {Object.entries(config.links || {}).filter(([key]) => key !== 'iconUrl').map(([key, value]) => {
              const fieldKey = `links.${key}`;
              return (
                <div key={key} className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {LINK_LABELS[key] || key.replace(/([A-Z])/g, ' $1').trim()}
                  </label>
                  <input
                    type="url"
                    value={value ?? ''}
                    onChange={(e) => update('links', key, e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-teal-500 text-sm ${errors[fieldKey] ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                  />
                  {errors[fieldKey] && <p className="mt-1 text-xs text-red-600">{errors[fieldKey]}</p>}
                </div>
              );
            })}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-4">Social links</h2>
            {Object.entries(config.socials || {}).map(([key, value]) => {
              const fieldKey = `socials.${key}`;
              return (
                <div key={key} className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{SOCIAL_LABELS[key] || key}</label>
                  <input
                    type="url"
                    value={value ?? ''}
                    onChange={(e) => update('socials', key, e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-teal-500 text-sm ${errors[fieldKey] ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                  />
                  {errors[fieldKey] && <p className="mt-1 text-xs text-red-600">{errors[fieldKey]}</p>}
                </div>
              );
            })}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 font-bold text-gray-900">
                <Calendar className="w-5 h-5 text-teal-900" />
                Upcoming Events
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={deletePastEvents}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Delete Past
                </button>
                <button
                  type="button"
                  onClick={addEvent}
                  className="flex items-center gap-1 text-sm font-bold text-teal-900 hover:underline"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>
            <div className="space-y-4">
              {(config.events || []).map((event, index) => {
                const titleError = errors[`events.${index}.title`];
                const dateError = errors[`events.${index}.date`];
                const dateWarning = warnings[`events.${index}.date`];
                const timeError = errors[`events.${index}.time`];
                const signupError = errors[`events.${index}.signupUrl`];

                return (
                  <div key={event.id || `event-${index}`} className="p-4 rounded-xl border border-gray-200 space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-xs text-gray-400">#{index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeEvent(index)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        aria-label="Remove event"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Event title"
                      value={event.title ?? ''}
                      onChange={(e) => updateEvent(index, 'title', e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-teal-500 ${titleError ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                    />
                    {titleError && <p className="text-xs text-red-600">{titleError}</p>}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <input
                          type="text"
                          placeholder="Date (e.g. Feb 22 or Sundays)"
                          value={event.date ?? ''}
                          onChange={(e) => updateEvent(index, 'date', e.target.value)}
                          className={`w-full px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-teal-500 ${dateError ? 'border-red-300 bg-red-50' : dateWarning ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                        />
                        {dateError && <p className="mt-1 text-xs text-red-600">{dateError}</p>}
                        {!dateError && dateWarning && <p className="mt-1 text-xs text-amber-700">{dateWarning}</p>}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Time"
                          value={event.time ?? ''}
                          onChange={(e) => updateEvent(index, 'time', e.target.value)}
                          className={`w-full px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-teal-500 ${timeError ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                        />
                        {timeError && <p className="mt-1 text-xs text-red-600">{timeError}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        placeholder="Location name (opens GPS when clicked)"
                        value={event.locationName ?? ''}
                        onChange={(e) => updateEvent(index, 'locationName', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-teal-500"
                      />
                      <input
                        type="text"
                        placeholder="Location address (opens GPS when clicked)"
                        value={event.locationAddress ?? event.location ?? ''}
                        onChange={(e) => updateEvent(index, 'locationAddress', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <input
                      type="url"
                      placeholder="Sign-up URL (optional)"
                      value={event.signupUrl ?? ''}
                      onChange={(e) => updateEvent(index, 'signupUrl', e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-teal-500 ${signupError ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                    />
                    {signupError && <p className="text-xs text-red-600">{signupError}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
