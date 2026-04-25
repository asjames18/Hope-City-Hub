import { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Clock,
  CalendarPlus,
  Heart,
  Users,
  Instagram,
  Facebook,
  Youtube,
  Globe,
  CreditCard,
  ChevronRight,
  X,
  Info,
  Sparkles,
  MessageCircle,
  Settings,
} from 'lucide-react';
import { getPageConfig, getPageConfigAsync, subscribePageConfig } from './lib/pageConfig';
import { applySeo, removeStructuredData, setStructuredData } from './lib/seo';
import { logClickEvent } from './lib/db';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import PWAInstallPrompt from './components/PWAInstallPrompt.jsx';
import { buildCalendarLink, buildMapsLink, getEventLocationAddress, getEventLocationName } from './lib/events';
import { isAIEnabled } from './lib/ai';
import { getExternalHref, getSiteIconUrl } from './lib/siteConfig';

const HopeAIModal = lazy(() => import('./components/HopeAIModal.jsx'));

// --- BRANDING CONFIGURATION ---
const BRAND_COLORS = {
  teal: '#004E59',
  lime: '#A3D600',
  white: '#FFFFFF',
  gray: '#F9FAFB',
};

// --- COMPONENTS ---

const AnnouncementBanner = ({ announcement, onAnnouncementClick }) => {
  const [isVisible, setIsVisible] = useState(Boolean(announcement?.active));
  // Sync visibility when config loads from Supabase (announcement.active can arrive after first mount)
  useEffect(() => {
    if (announcement?.active) setIsVisible(true);
  }, [announcement?.active]);
  if (!announcement?.active || !isVisible) return null;
  const link = getExternalHref(announcement?.link);
  const hasLink = Boolean(link);
  return (
    <div
      className="relative px-4 py-3 pr-10 text-sm font-bold text-center text-white shadow-md animate-in slide-in-from-top"
      style={{
        backgroundColor: BRAND_COLORS.lime,
        color: BRAND_COLORS.teal,
      }}
    >
      <div className="flex items-center justify-center gap-2">
        <Info className="w-4 h-4" />
        {hasLink ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onAnnouncementClick?.(link)}
            className="underline decoration-teal-700/50 underline-offset-2 hover:opacity-80"
          >
            {announcement.text}
          </a>
        ) : (
          announcement.text
        )}
      </div>
      <button
        onClick={() => setIsVisible(false)}
        aria-label="Dismiss announcement"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-black/10 rounded-full transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

const ActionLink = ({
  href,
  onClick,
  icon: Icon,
  title,
  subtitle,
  variant = 'teal',
}) => {
  const externalHref = getExternalHref(href);
  const isDisabled = !externalHref;

  const getStyles = () => {
    switch (variant) {
      case 'teal':
        return {
          backgroundColor: BRAND_COLORS.teal,
          color: 'white',
          borderColor: BRAND_COLORS.teal,
        };
      case 'lime':
        return {
          backgroundColor: BRAND_COLORS.lime,
          color: 'white',
          borderColor: BRAND_COLORS.lime,
        };
      case 'white':
        return {
          backgroundColor: 'white',
          color: BRAND_COLORS.teal,
          borderColor: '#E5E7EB',
        };
      case 'gradient':
        return {
          background: `linear-gradient(135deg, ${BRAND_COLORS.teal} 0%, #006064 100%)`,
          color: 'white',
          borderColor: 'transparent',
        };
      default:
        return {};
    }
  };

  const Component = externalHref ? 'a' : 'button';
  const props = externalHref
    ? { href: externalHref, target: '_blank', rel: 'noopener noreferrer', onClick }
    : { type: 'button', disabled: true };

  return (
    <Component
      {...props}
      style={getStyles()}
      className={`flex items-center w-full p-4 mb-3 rounded-xl border-2 shadow-sm transition-all transform ${
        isDisabled ? 'cursor-not-allowed opacity-60' : 'hover:scale-[1.01] active:scale-[0.98]'
      }`}
    >
      <div
        className={`p-2 rounded-full mr-4 ${variant === 'white' ? 'bg-gray-50' : 'bg-white/20'}`}
        style={{ color: variant === 'white' ? BRAND_COLORS.teal : 'white' }}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 text-left">
        <div className="font-bold text-lg leading-tight flex items-center gap-2">
          {title}
          {variant === 'gradient' && (
            <Sparkles className="w-4 h-4 text-lime-400 animate-pulse" />
          )}
        </div>
        {subtitle && (
          <div
            className="text-xs mt-0.5 font-medium opacity-90"
            style={{
              color: variant === 'white' ? '#6B7280' : 'rgba(255,255,255,0.9)',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <ChevronRight
        className="w-5 h-5 opacity-60"
        style={{ color: variant === 'white' ? '#9CA3AF' : 'white' }}
      />
    </Component>
  );
};

const EventRow = ({ event }) => {
  const calendarLink = buildCalendarLink(event);
  const locationName = getEventLocationName(event);
  const locationAddress = getEventLocationAddress(event);
  const locationNameMapsLink = buildMapsLink([locationName, locationAddress].filter(Boolean).join(' '));
  const locationAddressMapsLink = buildMapsLink(locationAddress);

  return (
    <div
      className={`block bg-white border border-gray-100 rounded-xl p-4 mb-3 shadow-sm transition-all ${event.signupUrl ? 'hover:shadow-md' : 'opacity-90'}`}
      style={{ borderColor: event.signupUrl ? 'transparent' : '#f3f4f6' }}
    >
      <div className="flex items-center gap-4">
        <div
          className="flex flex-col items-center justify-center min-w-12 w-12 h-12 bg-gray-50 rounded-lg border border-gray-200"
          style={{ color: BRAND_COLORS.teal }}
        >
          {(() => {
            const parts = event.date.split(' ');
            const hasDayAndNumber = parts.length >= 2;
            return hasDayAndNumber ? (
              <>
                <span className="text-[10px] font-bold uppercase leading-none">
                  {parts[0]}
                </span>
                <span className="text-xl font-bold leading-none">
                  {parts[1]}
                </span>
              </>
            ) : (
              <span className="text-xs font-bold uppercase leading-none text-center px-0.5">
                {event.date}
              </span>
            );
          })()}
        </div>
        <div className="flex-1">
          <h3
            className="font-bold leading-tight"
            style={{ color: BRAND_COLORS.teal }}
          >
            {event.title}
          </h3>
          <div className="text-xs text-gray-500 font-medium flex items-center mt-1">
            <Clock className="w-3 h-3 mr-1" /> {event.time}
          </div>
          {(locationNameMapsLink || locationAddressMapsLink) && (
            <div className="mt-1 space-y-0.5 text-xs font-medium text-gray-500">
              {locationName && locationNameMapsLink && (
                <a
                  href={locationNameMapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-1 hover:text-teal-900"
                >
                  <MapPin className="mt-0.5 h-3 w-3 flex-none" />
                  <span>{locationName}</span>
                </a>
              )}
              {locationAddress && locationAddressMapsLink && (
                <a
                  href={locationAddressMapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-1 hover:text-teal-900"
                >
                  {!locationName && <MapPin className="mt-0.5 h-3 w-3 flex-none" />}
                  {locationName && <span className="w-3 flex-none" aria-hidden="true" />}
                  <span>{locationAddress}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {event.signupUrl && (
          <a
            href={event.signupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg text-xs font-bold shadow-sm text-white inline-flex items-center"
            style={{ backgroundColor: BRAND_COLORS.lime }}
          >
            Sign Up
          </a>
        )}

        {calendarLink && (
          <a
            href={calendarLink.href}
            download={calendarLink.filename}
            className="px-3 py-2 rounded-lg text-xs font-bold border border-gray-200 text-gray-700 bg-white inline-flex items-center gap-1 hover:bg-gray-50"
          >
            <CalendarPlus className="w-3.5 h-3.5" /> Add to Calendar
          </a>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [showAI, setShowAI] = useState(false);
  const aiEnabled = isAIEnabled();
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [config, setConfig] = useState(() => getPageConfig());
  useEffect(() => {
    getPageConfigAsync()
      .then((c) => c != null && setConfig(c));
    return subscribePageConfig((c) => c != null && setConfig(c));
  }, []);

  useEffect(() => {
    const currentSiteIconUrl = getSiteIconUrl(config);
    applySeo({
      title: 'Hope City Highlands | Sebring, FL',
      description:
        'Hope City Highlands in Sebring, Florida. Join us to belong, believe, and become with worship, prayer, and community.',
      canonicalPath: '/',
      ogImagePath: currentSiteIconUrl,
      iconPath: currentSiteIconUrl,
      noindex: false,
    });

    const socialLinks = [config?.socials?.facebook, config?.socials?.instagram, config?.socials?.youtube]
      .map((url) => getExternalHref(url))
      .filter(Boolean);
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://hopecityhighlands.com';

    setStructuredData('hope-city-org', {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: 'Hope City Highlands',
          url: siteUrl,
          sameAs: socialLinks,
        },
        {
          '@type': 'LocalBusiness',
          name: 'Hope City Highlands',
          url: siteUrl,
          telephone: '',
          address: {
            '@type': 'PostalAddress',
            streetAddress: '1700 Simpson Ave',
            addressLocality: 'Sebring',
            addressRegion: 'FL',
            postalCode: '33870',
            addressCountry: 'US',
          },
        },
      ],
    });

    return () => removeStructuredData('hope-city-org');
  }, [config]);

  const links = config?.links ?? {};
  const socials = config?.socials ?? {};
  const events = config?.events ?? [];
  const siteIconUrl = getSiteIconUrl(config);
  const visibleEvents = showAllEvents ? events : events.slice(0, 5);
  const actionLinks = {
    connectCard: getExternalHref(links.connectCard),
    giving: getExternalHref(links.giving),
    prayerRequest: getExternalHref(links.prayerRequest),
    directions: getExternalHref(links.directions),
  };
  const socialItems = [
    { key: 'website', label: 'Website', href: getExternalHref(socials.website), icon: Globe },
    { key: 'instagram', label: 'Instagram', href: getExternalHref(socials.instagram), icon: Instagram },
    { key: 'facebook', label: 'Facebook', href: getExternalHref(socials.facebook), icon: Facebook },
    { key: 'youtube', label: 'YouTube', href: getExternalHref(socials.youtube), icon: Youtube },
  ].filter((item) => item.href);

  useEffect(() => {
    if (events.length <= 5) setShowAllEvents(false);
  }, [events.length]);

  const trackClick = (action, targetUrl, source = 'home', tag = '') => {
    void logClickEvent({
      action,
      source,
      tag,
      targetUrl: targetUrl || '',
      path: typeof window !== 'undefined' ? window.location.pathname : '/',
      query: {},
    });
  };

  return (
    <div
      className="min-h-screen font-sans selection:bg-lime-100 pb-[calc(5rem+env(safe-area-inset-bottom))]"
      style={{ backgroundColor: BRAND_COLORS.gray }}
    >
      {config?.announcement?.active && (
        <AnnouncementBanner
          announcement={config?.announcement}
          onAnnouncementClick={(url) => trackClick('announcement', url)}
        />
      )}

      <main className="max-w-md mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <img
            src={siteIconUrl}
            alt="Hope City Highlands icon"
            className="mx-auto mb-4 h-12 w-12 rounded-xl shadow-xl"
          />
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{ color: BRAND_COLORS.teal }}
          >
            HOPE CITY <span style={{ color: BRAND_COLORS.lime }}>HIGHLANDS</span>
          </h1>
          <p className="text-sm text-gray-500 mt-2 font-medium">
            Belong. Believe. Become.
          </p>
          <p className="text-sm text-gray-500 mt-2 font-medium">
            Faith Forward
          </p>
        </div>

        {/* Primary Actions */}
        <div className="mb-10">
          <ActionLink
            href={actionLinks.connectCard}
            onClick={actionLinks.connectCard ? () => trackClick('connect', actionLinks.connectCard) : undefined}
            icon={Users}
            title="I'm New / Connect"
            subtitle="Digital connection card"
            variant="teal"
          />
          <ActionLink
            href={actionLinks.giving}
            onClick={actionLinks.giving ? () => trackClick('give', actionLinks.giving) : undefined}
            icon={CreditCard}
            title="Give Online"
            subtitle="Secure via Tithe.ly"
            variant="lime"
          />
          <ActionLink
            href={actionLinks.prayerRequest}
            onClick={actionLinks.prayerRequest ? () => trackClick('prayer', actionLinks.prayerRequest) : undefined}
            icon={Heart}
            title="Prayer Request"
            variant="white"
          />
        </div>

        {/* Upcoming Events */}
        <div className="flex items-center mb-6">
          <div className="h-px bg-gray-200 flex-1"></div>
          <span className="px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
            Upcoming Events
          </span>
          <div className="h-px bg-gray-200 flex-1"></div>
        </div>

        <div className="mb-10">
          {visibleEvents.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
          {events.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllEvents((v) => !v)}
              className="block w-full text-center text-xs font-bold text-gray-500 hover:opacity-80 mt-4 transition-colors"
            >
              {showAllEvents ? 'Show Less Events' : `View All Events (${events.length})`}
            </button>
          )}
        </div>

        <div className="mb-8">
          <PWAInstallPrompt />
        </div>

        {/* Footer */}
        <div className="text-center border-t border-gray-200 pt-8">
          {socialItems.length > 0 && (
            <div className="mb-6 flex justify-center gap-8">
              {socialItems.map(({ key, label, href, icon: Icon }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visit Hope City Highlands on ${label}`}
                  className="text-gray-400 transition-colors hover:opacity-80"
                >
                  <Icon className="w-6 h-6" />
                </a>
              ))}
            </div>
          )}
          {actionLinks.directions ? (
            <a
              href={actionLinks.directions}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackClick('directions', actionLinks.directions)}
              className="flex items-center justify-center gap-1 text-xs font-bold text-gray-400 hover:opacity-80"
            >
              <MapPin className="w-3 h-3" /> 1700 Simpson Ave, Sebring, FL
            </a>
          ) : (
            <p className="flex items-center justify-center gap-1 text-xs font-bold text-gray-400">
              <MapPin className="w-3 h-3" /> 1700 Simpson Ave, Sebring, FL
            </p>
          )}
          <Link
            to="/admin"
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-teal-900 transition-colors"
          >
            <Settings className="w-3 h-3" /> Admin
          </Link>
        </div>
      </main>

      {aiEnabled && (
        <>
          {/* Floating Bubble for AI */}
          <button
            onClick={() => setShowAI(true)}
            className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-16 h-16 rounded-full shadow-2xl hover:scale-105 transition-transform active:scale-95 animate-in zoom-in slide-in-from-bottom-10 duration-500"
            style={{
              background: `linear-gradient(135deg, ${BRAND_COLORS.teal} 0%, #00363d 100%)`,
              boxShadow:
                '0 10px 25px -5px rgba(0, 78, 89, 0.4), 0 8px 10px -6px rgba(0, 78, 89, 0.1)',
            }}
            aria-label="Open Hope AI Assistant"
            aria-haspopup="dialog"
          >
            <MessageCircle className="w-8 h-8 text-white fill-white/10" />
            <div className="absolute top-3 right-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-lime-500 border-2 border-teal-900"></span>
              </span>
            </div>
          </button>

          {showAI && (
            <AppErrorBoundary title="Assistant failed to load" resetKeys={[showAI]}>
              <Suspense
                fallback={(
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="rounded-2xl bg-white px-5 py-4 text-sm font-medium text-teal-900 shadow-xl">
                      Loading assistant...
                    </div>
                  </div>
                )}
              >
                <HopeAIModal onClose={() => setShowAI(false)} />
              </Suspense>
            </AppErrorBoundary>
          )}
        </>
      )}
    </div>
  );
}
