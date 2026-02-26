import React, { useState, useRef, useEffect } from 'react';
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
  CreditCard,
  ChevronRight,
  X,
  Info,
  Sparkles,
  MessageCircle,
  Loader2,
  Volume2,
  StopCircle,
  Settings,
} from 'lucide-react';
import { getPageConfig, getPageConfigAsync, subscribePageConfig } from './lib/pageConfig';
import { isSupabaseConfigured } from './lib/supabase';
import { defaultConfig } from './lib/defaultConfig';
import { generateText, isHuggingFaceConfigured } from './lib/huggingface';
import { applySeo, removeStructuredData, setStructuredData } from './lib/seo';
import { logClickEvent } from './lib/db';

// --- BRANDING CONFIGURATION ---
const BRAND_COLORS = {
  teal: '#004E59',
  lime: '#A3D600',
  white: '#FFFFFF',
  gray: '#F9FAFB',
};

// --- AI ASSISTANT COMPONENT ---
const HopeAIModal = ({ onClose }) => {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const generateEncouragement = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    setResponse(null);
    setIsPlaying(false);

    try {
      const instruction =
        'You are a compassionate, encouraging pastoral assistant for Hope City Highlands church. ' +
        'Provide: 1. A short, comforting prayer (3-4 sentences). 2. A relevant Bible verse (NIV or ESV). ' +
        'Keep the tone hopeful, modern, and grace-filled. Do not be judgmental.';
      const prompt = `${instruction}\n\nUser shares: ${input.trim()}\n\nYour response:`;

      const result = await generateText(prompt, { maxNewTokens: 400 });

      if (result.error) {
        setResponse(`Sorry, ${result.error}`);
      } else {
        setResponse(result.text || "I'm having trouble connecting right now. Please try again.");
      }
    } catch (error) {
      console.error(error);
      setResponse('Sorry, something went wrong. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateSpeech = async () => {
    if (!response || isPlaying) return;
    setIsLoading(true);

    try {
      // TTS endpoint may vary; for demo we simulate playback
      setIsPlaying(true);
      setTimeout(() => setIsPlaying(false), 5000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-lg h-[90vh] sm:h-auto sm:max-h-[85vh] sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-5">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-lime-600 fill-lime-600" />
            <h3 className="font-bold text-lg text-teal-900">Hope AI Assistant</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {!response ? (
            <div className="text-center space-y-6 py-8">
              <div className="w-20 h-20 bg-lime-50 rounded-full flex items-center justify-center mx-auto">
                <Heart className="w-10 h-10 text-lime-600" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold text-teal-900">
                  How can we pray for you?
                </h4>
                <p className="text-gray-500 text-sm max-w-xs mx-auto">
                  Share what's on your heart, and our AI assistant will generate
                  a prayer and scripture just for you.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  "I'm feeling anxious",
                  'I need wisdom',
                  'Pray for my family',
                  "I'm thankful!",
                ].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setInput(tag)}
                    className="p-2 rounded-lg bg-gray-50 hover:bg-lime-50 text-gray-600 hover:text-lime-700 transition-colors border border-gray-100"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-lime-50 p-6 rounded-2xl border border-lime-100">
                <h5 className="text-xs font-bold text-lime-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Sparkles className="w-3 h-3" /> Personalized Prayer
                </h5>
                <p className="text-teal-900 leading-relaxed font-medium whitespace-pre-wrap">
                  {response}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={generateSpeech}
                  disabled={isPlaying || isLoading}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all bg-teal-900 text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isPlaying ? (
                    <StopCircle className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                  {isPlaying ? 'Playing...' : 'Listen to Prayer'}
                </button>
                <button
                  onClick={() => {
                    setResponse(null);
                    setInput('');
                  }}
                  className="px-4 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  New Prayer
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center">
                This content is AI-generated. Always seek counsel
                from our pastoral team for serious matters.
              </p>
            </div>
          )}
        </div>

        {/* Input Area */}
        {!response && (
          <div className="p-4 bg-white border-t border-gray-100">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type here (e.g., 'I'm stressed about work...')"
                className="w-full pl-4 pr-12 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-lime-500 text-gray-700 resize-none h-14"
              />
              <button
                onClick={generateEncouragement}
                disabled={!input.trim() || isLoading || !isHuggingFaceConfigured()}
                className="absolute right-2 top-2 p-2 bg-teal-900 text-white rounded-lg hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
            </div>
            {!isHuggingFaceConfigured() && (
              <p className="text-xs text-amber-600 mt-2">
                Configure Supabase and deploy the hf-generate function to enable AI prayers.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- COMPONENTS ---

const AnnouncementBanner = ({ announcement, onAnnouncementClick }) => {
  const [isVisible, setIsVisible] = useState(Boolean(announcement?.active));
  // Sync visibility when config loads from Supabase (announcement.active can arrive after first mount)
  useEffect(() => {
    if (announcement?.active) setIsVisible(true);
  }, [announcement?.active]);
  if (!announcement?.active || !isVisible) return null;
  const link = typeof announcement?.link === 'string' ? announcement.link.trim() : '';
  const hasLink = link && link !== '#';
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

  const Component = href ? 'a' : 'button';
  const props = href
    ? { href, target: '_blank', rel: 'noopener noreferrer', onClick }
    : { onClick };

  return (
    <Component
      {...props}
      style={getStyles()}
      className="flex items-center w-full p-4 mb-3 rounded-xl border-2 shadow-sm transition-all transform hover:scale-[1.01] active:scale-[0.98]"
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

const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseEventStart(dateLabel, timeLabel) {
  const dateMatch = String(dateLabel || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!dateMatch) return null;

  const month = MONTH_INDEX[dateMatch[1].slice(0, 3).toLowerCase()];
  if (month == null) return null;

  const day = Number(dateMatch[2]);
  const timeText = String(timeLabel || '').trim();
  const timeMatch = timeText.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  const hasTime = !!timeMatch;

  let hour = 12;
  let minute = 0;
  if (timeMatch) {
    const hour12 = Number(timeMatch[1]);
    minute = Number(timeMatch[2] || 0);
    const meridiem = timeMatch[3].toUpperCase();
    if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;
    hour = hour12 % 12;
    if (meridiem === 'PM') hour += 12;
  }

  const now = new Date();
  let year = now.getFullYear();
  let start = new Date(year, month, day, hour, minute, 0, 0);
  if (start.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    year += 1;
    start = new Date(year, month, day, hour, minute, 0, 0);
  }
  return { start, hasTime };
}

function formatIcsUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildCalendarLink(event) {
  const parsed = parseEventStart(event?.date, event?.time);
  if (!parsed) return null;
  const { start, hasTime } = parsed;
  const end = new Date(start.getTime() + (hasTime ? 90 : 24 * 60) * 60 * 1000);
  const title = String(event?.title || 'Hope City Event');
  const description = [
    'Hope City Highlands event',
    event?.signupUrl ? `Sign up: ${event.signupUrl}` : null,
  ].filter(Boolean).join('\\n');

  const dateOnly = start.toISOString().slice(0, 10).replace(/-/g, '');
  const nextDateOnly = end.toISOString().slice(0, 10).replace(/-/g, '');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hope City Highlands//Event Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@hopecityhighlands.com`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    hasTime ? `DTSTART:${formatIcsUtc(start)}` : `DTSTART;VALUE=DATE:${dateOnly}`,
    hasTime ? `DTEND:${formatIcsUtc(end)}` : `DTEND;VALUE=DATE:${nextDateOnly}`,
    `SUMMARY:${title.replace(/\n/g, ' ')}`,
    `LOCATION:1700 Simpson Ave, Sebring, FL 33870`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return {
    href: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`,
    filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'hope-city-event'}.ics`,
  };
}

export default function App() {
  const [showAI, setShowAI] = useState(false);
  const aiEnabled = import.meta.env.DEV;
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  // When Supabase is configured, start with default so we don't show stale localStorage; DB load will replace it
  const [config, setConfig] = useState(() =>
    isSupabaseConfigured() ? JSON.parse(JSON.stringify(defaultConfig)) : getPageConfig()
  );
  useEffect(() => {
    setConfigReady(false);
    getPageConfigAsync()
      .then((c) => c != null && setConfig(c))
      .finally(() => setConfigReady(true));
    return subscribePageConfig((c) => c != null && setConfig(c));
  }, []);

  useEffect(() => {
    applySeo({
      title: 'Hope City Highlands | Sebring, FL',
      description:
        'Hope City Highlands in Sebring, Florida. Join us to belong, believe, and become with worship, prayer, and community.',
      canonicalPath: '/',
      noindex: false,
    });

    const socialLinks = [config?.socials?.facebook, config?.socials?.instagram, config?.socials?.youtube]
      .filter((url) => typeof url === 'string' && url.trim() && url !== '#');
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
  }, [config?.socials?.facebook, config?.socials?.instagram, config?.socials?.youtube]);

  const links = config?.links ?? {};
  const socials = config?.socials ?? {};
  const events = configReady ? (config?.events ?? []) : [];
  const visibleEvents = showAllEvents ? events : events.slice(0, 5);

  useEffect(() => {
    if (!configReady) return;
    if (events.length <= 5) setShowAllEvents(false);
  }, [configReady, events.length]);

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
      className="min-h-screen font-sans selection:bg-lime-100 pb-20"
      style={{ backgroundColor: BRAND_COLORS.gray }}
    >
      {configReady && config?.announcement?.active && (
        <AnnouncementBanner
          announcement={config?.announcement}
          onAnnouncementClick={(url) => trackClick('announcement', url)}
        />
      )}

      <main className="max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl shadow-xl mb-4"
            style={{
              backgroundColor: BRAND_COLORS.teal,
              shadowColor: 'rgba(0, 78, 89, 0.2)',
            }}
          >
            <span className="text-white font-bold text-2xl">H</span>
          </div>
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
            href={links.connectCard}
            onClick={() => trackClick('connect', links.connectCard)}
            icon={Users}
            title="I'm New / Connect"
            subtitle="Digital connection card"
            variant="teal"
          />
          <ActionLink
            href={links.giving}
            onClick={() => trackClick('give', links.giving)}
            icon={CreditCard}
            title="Give Online"
            subtitle="Secure via Tithe.ly"
            variant="lime"
          />
          <ActionLink
            href={links.prayerRequest}
            onClick={() => trackClick('prayer', links.prayerRequest)}
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

        {/* Footer */}
        <div className="text-center border-t border-gray-200 pt-8">
          <div className="flex justify-center gap-8 mb-6">
            <a
              href={socials.instagram}
              className="text-gray-400 hover:opacity-80 transition-colors"
            >
              <Instagram className="w-6 h-6" />
            </a>
            <a
              href={socials.facebook}
              className="text-gray-400 hover:opacity-80 transition-colors"
            >
              <Facebook className="w-6 h-6" />
            </a>
            <a
              href={socials.youtube}
              className="text-gray-400 hover:opacity-80 transition-colors"
            >
              <Youtube className="w-6 h-6" />
            </a>
          </div>
          <a
            href={links.directions}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick('directions', links.directions)}
            className="flex items-center justify-center gap-1 text-xs font-bold text-gray-400 hover:opacity-80"
          >
            <MapPin className="w-3 h-3" /> 1700 Simpson Ave, Sebring, FL
          </a>
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
          >
            <MessageCircle className="w-8 h-8 text-white fill-white/10" />
            <div className="absolute top-3 right-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-lime-500 border-2 border-teal-900"></span>
              </span>
            </div>
          </button>

          {showAI && <HopeAIModal onClose={() => setShowAI(false)} />}
        </>
      )}
    </div>
  );
}
