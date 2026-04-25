import { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, Heart, Loader2, Sparkles, StopCircle, Volume2, X } from 'lucide-react';
import { generateText, isAIProxyConfigured } from '../lib/ai';

const PROMPT_SUGGESTIONS = [
  'Pray for my family',
  "I'm feeling anxious",
  'How do I give online?',
  'What events are coming up?',
];
const MAX_INPUT_CHARS = 500;
const PLAYBACK_MS = 5000;
const FOCUSABLE_SELECTOR =
  'button, [href], textarea, input, select, [tabindex]:not([tabindex="-1"])';
const RESPONSE_TITLES = {
  prayer: 'Prayer & Encouragement',
  church_info: 'Hope City Info',
  care_support: 'Care & Support',
  urgent_support: 'Important Support',
  general: 'Response',
};

function getFocusableElements(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute('disabled')
      && element.getAttribute('aria-hidden') !== 'true'
  );
}

const URL_IN_TEXT = /(https?:\/\/[^\s<]+)/gi;
const TRAILING_URL_JUNK = /[),.;:!?\]]+$/u;
const LINK_CLASS =
  'font-medium text-teal-800 underline underline-offset-2 decoration-teal-600/70 hover:text-teal-950 break-all';

/** Renders plain text with http(s) URLs as anchors (href validated; no HTML injection). */
function linkifyResponse(text) {
  if (text == null || text === '') return null;
  const nodes = [];
  let last = 0;
  let m;
  let key = 0;
  while ((m = URL_IN_TEXT.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`t-${key++}`}>{text.slice(last, m.index)}</span>);
    }
    const raw = m[0];
    const href = raw.replace(TRAILING_URL_JUNK, '');
    const trailing = raw.slice(href.length);
    try {
      const parsed = new URL(href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        nodes.push(
          <a
            key={`a-${key++}`}
            href={parsed.href}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {href}
          </a>,
        );
        if (trailing) nodes.push(<span key={`t-${key++}`}>{trailing}</span>);
      } else {
        nodes.push(<span key={`t-${key++}`}>{raw}</span>);
      }
    } catch {
      nodes.push(<span key={`t-${key++}`}>{raw}</span>);
    }
    last = m.index + raw.length;
  }
  if (last < text.length) {
    nodes.push(<span key={`t-${key++}`}>{text.slice(last)}</span>);
  }
  return nodes.length > 0 ? nodes : text;
}

export default function HopeAIModal({ onClose }) {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState(null);
  const [responseIntent, setResponseIntent] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const dialogRef = useRef(null);
  const textareaRef = useRef(null);
  const playbackTimeoutRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previousActiveElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    textareaRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus();
      }
    };
  }, [onClose]);

  const submitRequest = async () => {
    const trimmedInput = input.trim().slice(0, MAX_INPUT_CHARS);
    if (!trimmedInput) return;

    setIsLoading(true);
    setResponse(null);
    setResponseIntent(null);
    setIsPlaying(false);

    try {
      const result = await generateText(trimmedInput, { maxNewTokens: 400, timeoutMs: 25000 });

      if (result.error) {
        setResponse(`Sorry, ${result.error}`);
        setResponseIntent(result.intent || 'general');
      } else {
        setResponse(result.text || "I'm having trouble connecting right now. Please try again.");
        setResponseIntent(result.intent || 'general');
      }
    } catch (error) {
      console.error(error);
      setResponse('Sorry, something went wrong. Please check your connection.');
      setResponseIntent('general');
    } finally {
      setIsLoading(false);
    }
  };

  const generateSpeech = () => {
    if (!response || isPlaying) return;

    setIsPlaying(true);
    if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
    playbackTimeoutRef.current = setTimeout(() => {
      setIsPlaying(false);
      playbackTimeoutRef.current = null;
    }, PLAYBACK_MS);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm animate-in fade-in sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-in slide-in-from-bottom-5 sm:h-auto sm:max-h-[85vh] sm:rounded-3xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 fill-lime-600 text-lime-600" />
            <h3 id={titleId} className="text-lg font-bold text-teal-900">
              Hope AI Assistant
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Hope AI Assistant"
            className="rounded-full p-2 transition-colors hover:bg-gray-200"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <p id={descriptionId} className="sr-only">
          Ask for prayer, encouragement, church information, directions, events, or next steps.
        </p>

        <div className="flex-1 overflow-y-auto p-6">
          {!response ? (
            <div className="space-y-6 py-8 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-lime-50">
                <Heart className="h-10 w-10 text-lime-600" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold text-teal-900">How can we help?</h4>
                <p className="mx-auto max-w-xs text-sm text-gray-500">
                  Ask for prayer, scripture, events, giving, directions, or any other help you need.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {PROMPT_SUGGESTIONS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setInput(tag)}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-gray-600 transition-colors hover:bg-lime-50 hover:text-lime-700"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
              <div className="rounded-2xl border border-lime-100 bg-lime-50 p-6">
                <h5 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-lime-700">
                  <Sparkles className="h-3 w-3" /> {RESPONSE_TITLES[responseIntent] || RESPONSE_TITLES.general}
                </h5>
                <p className="whitespace-pre-wrap font-medium leading-relaxed text-teal-900">
                  {linkifyResponse(response)}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={generateSpeech}
                  disabled={isPlaying || isLoading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-teal-800 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isPlaying ? (
                    <StopCircle className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  {isPlaying ? 'Playing...' : responseIntent === 'prayer' ? 'Listen to Prayer' : 'Listen to Response'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResponse(null);
                    setResponseIntent(null);
                    setInput('');
                    textareaRef.current?.focus();
                  }}
                  className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-200"
                >
                  Start Over
                </button>
              </div>
              <p className="text-center text-[10px] text-gray-400">
                This content is AI-generated. Always seek counsel from our pastoral team for serious matters.
              </p>
            </div>
          )}
        </div>

        {!response && (
          <div className="border-t border-gray-100 bg-white p-4">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, MAX_INPUT_CHARS))}
                placeholder="Ask for prayer, events, giving, directions, or anything else you need..."
                className="h-20 w-full resize-none rounded-xl border-none bg-gray-50 py-3 pl-4 pr-12 text-gray-700 focus:ring-2 focus:ring-lime-500"
                maxLength={MAX_INPUT_CHARS}
              />
              <button
                type="button"
                onClick={submitRequest}
                disabled={!input.trim() || isLoading || !isAIProxyConfigured()}
                className="absolute right-2 top-2 rounded-lg bg-teal-900 p-2 text-white transition-all hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message to Hope AI"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
              </button>
            </div>
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              Messages submitted here, including prayer requests and questions, may be reviewed by Hope City Highlands admins for care and safety.
              Avoid sharing highly sensitive medical, legal, or financial details.
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              {!isAIProxyConfigured() ? (
                <p className="text-xs text-amber-600">
                  Configure Supabase and deploy the AI edge function with at least one provider key.
                </p>
              ) : (
                <span className="text-xs text-gray-400">Keep requests concise for better responses.</span>
              )}
              <span className="text-xs text-gray-400">{input.length}/{MAX_INPUT_CHARS}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
