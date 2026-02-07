import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { getPageConfig, savePageConfig, notifyConfigUpdated } from '../lib/pageConfig';
import { isSupabaseConfigured } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { fetchPageConfig, savePageConfigToDb } from '../lib/db';
import { defaultConfig } from '../lib/defaultConfig';

const ADMIN_PIN_KEY = 'hopeCity_adminPin';
const DEFAULT_PIN = '1234';

function getStoredPin() {
  return typeof window !== 'undefined' ? localStorage.getItem(ADMIN_PIN_KEY) : null;
}

function setStoredPin(pin) {
  localStorage.setItem(ADMIN_PIN_KEY, pin);
}

export default function Admin() {
  const useDb = isSupabaseConfigured();

  // PIN flow (when no Supabase)
  const [pin, setPin] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [newPin, setNewPin] = useState('');

  // Supabase Auth (login only; no public sign-up)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Invite admin (only when using Supabase and logged in)
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');

  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [config, setConfig] = useState(() => ({ ...defaultConfig, events: [...defaultConfig.events] }));
  const [configLoading, setConfigLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Initial auth check (Supabase session)
  useEffect(() => {
    if (!useDb) {
      setAuthChecked(true);
      const stored = getStoredPin();
      if (!stored) setIsSettingPin(true);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session);
    });
    return () => subscription?.unsubscribe();
  }, [useDb]);

  // Load config when authenticated
  useEffect(() => {
    if (!authenticated) return;
    setConfigLoading(true);
    if (useDb) {
      fetchPageConfig().then((c) => {
        if (c) setConfig(c);
        setConfigLoading(false);
      }).catch(() => setConfigLoading(false));
    } else {
      setConfig(getPageConfig());
      setConfigLoading(false);
    }
  }, [authenticated, useDb]);

  const handlePinLogin = (e) => {
    e.preventDefault();
    const stored = getStoredPin() || DEFAULT_PIN;
    if (pin === stored) {
      setAuthenticated(true);
      setPin('');
    } else {
      alert('Incorrect PIN');
    }
  };

  const handleSetPin = (e) => {
    e.preventDefault();
    if (newPin.length >= 4) {
      setStoredPin(newPin);
      setNewPin('');
      setIsSettingPin(false);
    } else {
      alert('PIN must be at least 4 characters');
    }
  };

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
      const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') + '/functions/v1/invite-admin';
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
    if (useDb) supabase.auth.signOut();
    setAuthenticated(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');
    if (useDb) {
      const result = await savePageConfigToDb(config);
      if (!result.ok) {
        setSaveError(result.error || 'Save failed');
        return;
      }
      notifyConfigUpdated();
      const fresh = await fetchPageConfig();
      if (fresh) setConfig(fresh);
    } else {
      savePageConfig(config);
    }
    setSaved(true);
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
      events: prev.events.map((e, i) =>
        i === index ? { ...e, [field]: value } : e
      ),
    }));
  };

  const addEvent = () => {
    const tempId = useDb ? `temp-${Date.now()}` : Math.max(0, ...config.events.map((e) => (typeof e.id === 'number' ? e.id : 0))) + 1;
    setConfig((prev) => ({
      ...prev,
      events: [...prev.events, { id: tempId, title: '', date: '', time: '', signupUrl: '' }],
    }));
  };

  const removeEvent = (index) => {
    if (config.events.length <= 1) return;
    setConfig((prev) => ({
      ...prev,
      events: prev.events.filter((_, i) => i !== index),
    }));
  };

  // --- Set PIN (no Supabase, first time)
  if (!useDb && isSettingPin && !getStoredPin()) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <form onSubmit={handleSetPin} className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-6 h-6 text-teal-900" />
            <h1 className="text-xl font-bold text-gray-900">Set Admin PIN</h1>
          </div>
          <p className="text-sm text-gray-500 mb-4">Choose a PIN (at least 4 characters) to protect the admin area.</p>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <button type="submit" className="mt-4 w-full py-3 rounded-xl font-bold bg-teal-900 text-white hover:bg-teal-800">
            Set PIN
          </button>
        </form>
      </div>
    );
  }

  // --- PIN Login (no Supabase)
  if (!useDb && !authenticated && getStoredPin()) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <form onSubmit={handlePinLogin} className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-6 h-6 text-teal-900" />
            <h1 className="text-xl font-bold text-gray-900">Admin Login</h1>
          </div>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent mb-4"
          />
          <button type="submit" className="w-full py-3 rounded-xl font-bold bg-teal-900 text-white hover:bg-teal-800">
            Log in
          </button>
          <Link to="/" className="block text-center text-sm text-gray-500 mt-4 hover:underline">
            Back to site
          </Link>
        </form>
      </div>
    );
  }

  // --- Supabase Login (no sign-up; first admin is created in Supabase Dashboard or via invite)
  if (useDb && !authenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-6 h-6 text-teal-900" />
            <h1 className="text-xl font-bold text-gray-900">Admin Login</h1>
          </div>
          {authError && (
            <p className="text-sm text-red-600 mb-4 bg-red-50 p-3 rounded-lg">{authError}</p>
          )}
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

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-900" />
      </div>
    );
  }

  // --- Admin dashboard
  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="font-bold text-lg text-gray-900">Page Admin</h1>
          {useDb && (
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 ml-2"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={configLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold bg-teal-900 text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {configLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save'}
        </button>
      </header>

      {saveError && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{saveError}</div>
      )}

      {configLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-900" />
        </div>
      ) : (
      <main className="max-w-lg mx-auto p-4 space-y-8">
        {useDb && (
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-4">
              <UserPlus className="w-5 h-5 text-teal-900" />
              Add admin
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Invite another admin by email. They will receive a link to set their password and sign in.
            </p>
            <form onSubmit={handleInviteAdmin} className="flex gap-2">
              <input
                type="email"
                placeholder="admin@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-teal-500 text-sm"
              />
              <button
                type="submit"
                disabled={inviteLoading || !inviteEmail.trim()}
                className="px-4 py-3 rounded-xl font-bold bg-teal-900 text-white hover:bg-teal-800 disabled:opacity-50 flex items-center gap-2"
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
        )}

        <section className="bg-white rounded-2xl shadow-sm p-6">
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
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-teal-500"
          />
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-4">
            <Link2 className="w-5 h-5 text-teal-900" />
            Links
          </h2>
          {Object.entries(config.links || {}).map(([key, value]) => (
            <div key={key} className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </label>
              <input
                type="url"
                value={value ?? ''}
                onChange={(e) => update('links', key, e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500 text-sm"
              />
            </div>
          ))}
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-4">Social links</h2>
          {Object.entries(config.socials || {}).map(([key, value]) => (
            <div key={key} className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">{key}</label>
              <input
                type="url"
                value={value ?? ''}
                onChange={(e) => update('socials', key, e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500 text-sm"
              />
            </div>
          ))}
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 font-bold text-gray-900">
              <Calendar className="w-5 h-5 text-teal-900" />
              Upcoming Events
            </h2>
            <button
              type="button"
              onClick={addEvent}
              className="flex items-center gap-1 text-sm font-bold text-teal-900 hover:underline"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          <div className="space-y-4">
            {(config.events || []).map((event, index) => (
              <div key={event.id} className="p-4 rounded-xl border border-gray-200 space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-xs text-gray-400">#{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeEvent(index)}
                    disabled={(config.events || []).length <= 1}
                    className="p-1 text-red-500 hover:bg-red-50 rounded disabled:opacity-30"
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
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-teal-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Date (e.g. Feb 22 or Sundays)"
                    value={event.date ?? ''}
                    onChange={(e) => updateEvent(index, 'date', e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    type="text"
                    placeholder="Time"
                    value={event.time ?? ''}
                    onChange={(e) => updateEvent(index, 'time', e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <input
                  type="url"
                  placeholder="Sign-up URL (optional)"
                  value={event.signupUrl ?? ''}
                  onChange={(e) => updateEvent(index, 'signupUrl', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
            ))}
          </div>
        </section>
      </main>
      )}
    </div>
  );
}
