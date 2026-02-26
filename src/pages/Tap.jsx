import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CreditCard, Heart, MapPin, Users, ChevronRight } from 'lucide-react';
import { defaultConfig } from '../lib/defaultConfig';
import { getPageConfigAsync, subscribePageConfig } from '../lib/pageConfig';
import { applySeo } from '../lib/seo';
import { logClickEvent } from '../lib/db';
import { isSupabaseConfigured } from '../lib/supabase';

const BRAND_COLORS = {
  teal: '#004E59',
  lime: '#A3D600',
};

const VALID_ACTIONS = ['connect', 'give', 'prayer', 'directions'];

function normalizeAction(value) {
  return VALID_ACTIONS.includes(value) ? value : null;
}

export default function Tap() {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState(() => JSON.parse(JSON.stringify(defaultConfig)));

  useEffect(() => {
    getPageConfigAsync().then((c) => c != null && setConfig(c));
    return subscribePageConfig((c) => c != null && setConfig(c));
  }, []);

  useEffect(() => {
    applySeo({
      title: 'Quick Actions | Hope City Highlands',
      description: 'Quick links for Connect, Give, Prayer Request, and Directions at Hope City Highlands.',
      canonicalPath: '/tap',
      noindex: true,
    });
  }, []);

  const selectedAction = normalizeAction(searchParams.get('action'));
  const source = (searchParams.get('source') || 'unknown').trim().slice(0, 100);
  const tag = (searchParams.get('tag') || '').trim().slice(0, 100);
  const queryObject = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams]);

  const links = config?.links ?? {};
  const actions = [
    { key: 'connect', title: "I'm New / Connect", subtitle: 'Digital connection card', href: links.connectCard, icon: Users },
    { key: 'give', title: 'Give Online', subtitle: 'Secure via Tithe.ly', href: links.giving, icon: CreditCard },
    { key: 'prayer', title: 'Prayer Request', subtitle: 'Share your prayer need', href: links.prayerRequest, icon: Heart },
    { key: 'directions', title: 'Get Directions', subtitle: '1700 Simpson Ave, Sebring, FL', href: links.directions, icon: MapPin },
  ];

  const trackClick = (action, targetUrl) => {
    void logClickEvent({
      action,
      source,
      tag,
      targetUrl: targetUrl || '',
      path: '/tap',
      query: queryObject,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <main className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-teal-900">Hope City Highlands</h1>
          <p className="text-sm text-gray-600 mt-2">Quick actions for your next step.</p>
          {!isSupabaseConfigured() && (
            <p className="text-xs text-amber-700 mt-2">
              Tracking is disabled because Supabase is not configured.
            </p>
          )}
        </div>

        <div className="space-y-3">
          {actions.map(({ key, title, subtitle, href, icon: Icon }) => {
            const isSelected = selectedAction === key;
            const isDisabled = !href || href === '#';
            return (
              <a
                key={key}
                href={isDisabled ? '#' : href}
                target={isDisabled ? undefined : '_blank'}
                rel={isDisabled ? undefined : 'noopener noreferrer'}
                onClick={(e) => {
                  if (isDisabled) {
                    e.preventDefault();
                    return;
                  }
                  trackClick(key, href);
                }}
                className={`block rounded-2xl border-2 p-5 bg-white shadow-sm transition ${isSelected ? 'ring-2' : 'hover:shadow-md'} ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                style={{
                  borderColor: isSelected ? BRAND_COLORS.lime : '#e5e7eb',
                  boxShadow: isSelected ? '0 0 0 1px rgba(163, 214, 0, 0.2)' : undefined,
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                    style={{ backgroundColor: isSelected ? BRAND_COLORS.lime : BRAND_COLORS.teal }}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-lg text-teal-900 leading-tight">{title}</p>
                    <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </a>
            );
          })}
        </div>

        <div className="text-center mt-8">
          <Link to="/" className="text-sm font-semibold text-teal-900 hover:underline">
            Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
