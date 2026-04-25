const ALLOWED_ORIGINS = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

/** When unset/empty, any browser Origin is allowed (anon key still required). Set ALLOWED_ORIGINS to lock down. */
const ORIGIN_ALLOWLIST_ENABLED = ALLOWED_ORIGINS.size > 0;

function isLocalDevOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

type ProviderName = 'gemini' | 'deepseek' | 'anthropic' | 'openai';

type ProviderAttempt = {
  provider: ProviderName;
  model: string;
  status: number;
  error: string;
  retryable: boolean;
};

type GenerationRequest = {
  prompt?: string;
  maxNewTokens?: number;
  path?: string;
};

type AiIntent = 'prayer' | 'church_info' | 'care_support' | 'urgent_support' | 'general';

type IntentSignals = {
  primaryIntent: AiIntent;
  wantsPrayer: boolean;
  wantsChurchInfo: boolean;
  wantsCare: boolean;
  wantsAction: boolean;
  isUrgentSupport: boolean;
};

type ProviderSuccess = {
  text: string;
  provider: ProviderName;
  model: string;
};

type SiteConfigData = {
  announcement?: { active?: boolean; text?: string; link?: string };
  links?: Record<string, string>;
  socials?: Record<string, string>;
  events?: Array<{ title?: string; date?: string; time?: string; signup_url?: string; signupUrl?: string }>;
};

const AI_PROVIDER_ORDER = ['gemini', 'deepseek', 'anthropic', 'openai'] as const;
const MAX_PROVIDER_TIMEOUT_MS = 8000;
const MAX_PROMPT_CHARS = 4000;
const MAX_NEW_TOKENS = 600;
const DEEPSEEK_CHAT_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const ANTHROPIC_MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: 'gemini-2.5-flash-lite',
  deepseek: 'deepseek-chat',
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
};
const PROVIDER_TOKEN_ENV: Record<ProviderName, string> = {
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};
const PROVIDER_MODEL_ENV: Record<ProviderName, string> = {
  gemini: 'GEMINI_MODEL',
  deepseek: 'DEEPSEEK_MODEL',
  anthropic: 'ANTHROPIC_MODEL',
  openai: 'OPENAI_MODEL',
};

function normalizePath(path: string | undefined, referer: string | null): string {
  const explicitPath = String(path || '').trim();
  if (explicitPath) return explicitPath.slice(0, 250);
  if (!referer) return '/';
  try {
    const url = new URL(referer);
    return `${url.pathname || '/'}${url.search || ''}`.slice(0, 250);
  } catch {
    return '/';
  }
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  if (!ORIGIN_ALLOWLIST_ENABLED) return true;
  return ALLOWED_ORIGINS.has(origin) || isLocalDevOrigin(origin);
}

function accessControlAllowOrigin(origin: string | null): string {
  if (ORIGIN_ALLOWLIST_ENABLED) {
    return origin && isOriginAllowed(origin) ? origin : '';
  }
  // Echo Origin when present (needed with Authorization on POST). Fall back for non-browser callers.
  const o = origin?.trim();
  if (o && o !== 'null') return o;
  return '*';
}

function corsHeadersFor(origin: string | null) {
  const allowOrigin = accessControlAllowOrigin(origin);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (!allowOrigin) {
    delete headers['Access-Control-Allow-Origin'];
  }
  return headers;
}

function extractOpenAiLikeText(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join(' ')
    .trim();
}

function extractAnthropicText(data: any): string {
  const parts = Array.isArray(data?.content) ? data.content : [];
  return parts
    .map((part) => (part?.type === 'text' && typeof part?.text === 'string' ? part.text : ''))
    .join(' ')
    .trim();
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join(' ')
    .trim();
}

function extractOpenAIResponsesText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text.trim();
  const output = Array.isArray(data?.output) ? data.output : [];
  return output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((part: any) => {
      if (typeof part?.text === 'string') return part.text;
      if (typeof part?.output_text === 'string') return part.output_text;
      return '';
    })
    .join(' ')
    .trim();
}

function getServiceRoleClientConfig() {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/$/, '');
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  return { supabaseUrl, serviceRoleKey };
}

function trimUrl(value: unknown): string {
  const text = String(value || '').trim();
  return text && text !== '#' ? text : '';
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function detectIntentSignals(prompt: string): IntentSignals {
  const text = prompt.toLowerCase();
  const wantsPrayer = matchesAny(text, [
    /\bpray(?:er|ing)?\b/,
    /\bscripture\b/,
    /\bverse\b/,
    /\bencouragement\b/,
    /\bwisdom\b/,
    /\bpeace\b/,
    /\bhealing\b/,
    /\bstrength\b/,
    /\bthankful\b/,
    /\bgrateful\b/,
  ]);
  const wantsChurchInfo = matchesAny(text, [
    /\bhope city\b/,
    /\bchurch\b/,
    /\bservice(?:s)?\b/,
    /\bevent(?:s)?\b/,
    /\bgiv(?:e|ing)\b/,
    /\bdirection(?:s)?\b/,
    /\baddress\b/,
    /\bconnect\b/,
    /\bprayer request\b/,
    /\bbaptism\b/,
    /\bdream team\b/,
    /\binstagram\b/,
    /\bfacebook\b/,
    /\byoutube\b/,
    /\bwebsite\b/,
    /\bapp\b/,
    /\btap\b/,
    /\badmin\b/,
    /\bnext steps?\b/,
    /\bsebring\b/,
  ]);
  const wantsAction = matchesAny(text, [
    /\bconnect\b/,
    /\bgiv(?:e|ing)\b/,
    /\bdirection(?:s)?\b/,
    /\bregister\b/,
    /\bsign(?:\s|-)?up\b/,
    /\bjoin\b/,
    /\bserve\b/,
    /\bvolunteer\b/,
    /\bbaptism\b/,
    /\bdream team\b/,
    /\bprayer request\b/,
  ]);
  const wantsCare = matchesAny(text, [
    /\bneed help\b/,
    /\bstruggl(?:e|ing)\b/,
    /\blonely\b/,
    /\bgrie(?:f|ving)\b/,
    /\bdepress(?:ed|ion)\b/,
    /\banx(?:ious|iety)\b/,
    /\bpanic\b/,
    /\bafraid\b/,
    /\boverwhelm(?:ed)?\b/,
    /\bhurt\b/,
    /\bmarriage\b/,
    /\baddict(?:ed|ion)?\b/,
    /\bcan someone talk\b/,
    /\bpastor\b/,
    /\bcounsel(?:ing|or)?\b/,
    /\bi need someone\b/,
  ]);
  const isUrgentSupport = matchesAny(text, [
    /\bsuicid(?:e|al)\b/,
    /\bkill myself\b/,
    /\bharm myself\b/,
    /\bself-harm\b/,
    /\babuse\b/,
    /\bunsafe\b/,
    /\bemergency\b/,
    /\bin danger\b/,
  ]);
  const looksLikeQuestion = text.includes('?') || matchesAny(text, [
    /^(what|when|where|how|who|why|can|do|does|is|are)\b/,
    /\bservice times?\b/,
  ]);

  let primaryIntent: AiIntent = 'general';
  if (isUrgentSupport) {
    primaryIntent = 'urgent_support';
  } else if (wantsPrayer) {
    primaryIntent = 'prayer';
  } else if (wantsChurchInfo || wantsAction) {
    primaryIntent = 'church_info';
  } else if (wantsCare) {
    primaryIntent = 'care_support';
  } else if (looksLikeQuestion) {
    primaryIntent = 'general';
  }

  return {
    primaryIntent,
    wantsPrayer,
    wantsChurchInfo,
    wantsCare,
    wantsAction,
    isUrgentSupport,
  };
}

async function fetchCurrentSiteConfig(): Promise<SiteConfigData | null> {
  const { supabaseUrl, serviceRoleKey } = getServiceRoleClientConfig();
  if (!supabaseUrl || !serviceRoleKey) return null;

  const headers = {
    'Content-Type': 'application/json',
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  try {
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_page_config`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    if (rpcRes.ok) {
      const data = await rpcRes.json();
      return {
        announcement: data?.site_config?.announcement || {},
        links: data?.site_config?.links || {},
        socials: data?.site_config?.socials || {},
        events: Array.isArray(data?.events) ? data.events : [],
      };
    }
  } catch {
    // Fall back to direct table reads if the RPC is unavailable.
  }

  try {
    const [configRes, eventsRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/site_config?id=eq.1&select=announcement,links,socials`, {
        method: 'GET',
        headers,
      }),
      fetch(`${supabaseUrl}/rest/v1/events?select=title,date,time,signup_url,order_index&order=order_index.asc`, {
        method: 'GET',
        headers,
      }),
    ]);

    const configJson = configRes.ok ? await configRes.json() : [];
    const eventsJson = eventsRes.ok ? await eventsRes.json() : [];
    const config = Array.isArray(configJson) ? configJson[0] : null;

    return {
      announcement: config?.announcement || {},
      links: config?.links || {},
      socials: config?.socials || {},
      events: Array.isArray(eventsJson) ? eventsJson : [],
    };
  } catch {
    return null;
  }
}

function buildSiteContext(config: SiteConfigData | null) {
  const links = config?.links || {};
  const socials = config?.socials || {};
  const events = Array.isArray(config?.events) ? config.events : [];
  const announcement = config?.announcement || {};

  const linkLines = [
    ['Connect Card', trimUrl(links.connectCard)],
    ['Prayer Request', trimUrl(links.prayerRequest)],
    ['Give Online', trimUrl(links.giving)],
    ['Baptism', trimUrl(links.baptism)],
    ['Dream Team', trimUrl(links.dreamTeam)],
    ['Directions', trimUrl(links.directions)],
    ['YouTube', trimUrl(links.youtube)],
  ]
    .filter(([, url]) => url)
    .map(([label, url]) => `- ${label}: ${url}`);

  const socialLines = [
    ['Instagram', trimUrl(socials.instagram)],
    ['Facebook', trimUrl(socials.facebook)],
    ['YouTube', trimUrl(socials.youtube)],
  ]
    .filter(([, url]) => url)
    .map(([label, url]) => `- ${label}: ${url}`);

  const eventLines = events
    .slice(0, 10)
    .map((event) => {
      const signup = trimUrl(event?.signup_url || event?.signupUrl);
      return `- ${String(event?.title || 'Event').trim()} | ${String(event?.date || '').trim()} | ${String(event?.time || '').trim()}${signup ? ` | Signup: ${signup}` : ''}`;
    });

  const sections = [
    'Hope City Highlands facts:',
    '- Website: https://hopecityhighlands.com',
    '- Tagline: Belong. Believe. Become.',
    '- Address: 1700 Simpson Ave, Sebring, FL 33870',
    '- Public routes: / (home), /tap (quick actions), /admin (authenticated admins only)',
    `- Current date: ${new Date().toISOString().slice(0, 10)}`,
  ];

  if (announcement?.active && String(announcement?.text || '').trim()) {
    sections.push(`- Current announcement: ${String(announcement.text).trim()}${trimUrl(announcement?.link) ? ` | Link: ${trimUrl(announcement.link)}` : ''}`);
  }

  if (linkLines.length > 0) {
    sections.push('Current app/site links:');
    sections.push(...linkLines);
  }

  if (socialLines.length > 0) {
    sections.push('Current social links:');
    sections.push(...socialLines);
  }

  if (eventLines.length > 0) {
    sections.push('Current upcoming events from the app:');
    sections.push(...eventLines);
  }

  sections.push('Use only this site/app context for factual Hope City Highlands questions. If the answer is not in this context, say you could not find it in the current app data.');
  return sections.join('\n');
}

function buildAugmentedPrompt(userPrompt: string, siteContext: string, signals: IntentSignals) {
  const instructions = [
    'You are Hope City Highlands assistant for hopecityhighlands.com.',
    'Respond based on the detected request signals below.',
    `- Primary intent: ${signals.primaryIntent}`,
    `- Prayer requested: ${signals.wantsPrayer ? 'yes' : 'no'}`,
    `- Church/app info requested: ${signals.wantsChurchInfo ? 'yes' : 'no'}`,
    `- Practical next step or link requested: ${signals.wantsAction ? 'yes' : 'no'}`,
    `- Personal care/support need expressed: ${signals.wantsCare ? 'yes' : 'no'}`,
    '',
    'Response rules:',
  ];

  if (signals.isUrgentSupport) {
    instructions.push('If the user mentions self-harm, abuse, or immediate danger, respond with urgency and compassion. Encourage contacting local emergency services, a crisis hotline, and a trusted person right away. Do not be casual.');
  }

  if (signals.wantsChurchInfo || signals.wantsAction) {
    instructions.push('For Hope City Highlands facts, links, events, directions, giving, next steps, and app/site questions, answer directly using the site/app context below.');
    instructions.push('If a relevant current link exists, include it plainly. If the answer is not in the context, say you could not find it in the current app data.');
  }

  if (signals.wantsPrayer) {
    instructions.push('Because prayer is requested, include a short, comforting prayer and a relevant Bible verse (NIV or ESV).');
  } else {
    instructions.push('Do not force a prayer or Bible verse into a purely factual or logistical answer.');
  }

  if (signals.wantsCare && !signals.isUrgentSupport) {
    instructions.push('If the user is struggling or asking for support, lead with empathy, keep it concise, and suggest an appropriate church next step from the available links when possible.');
  }

  if (signals.wantsPrayer && (signals.wantsChurchInfo || signals.wantsAction)) {
    instructions.push('If the user asks for both practical information and prayer, answer the practical question first, then close with the short prayer.');
  }

  if (signals.primaryIntent === 'general') {
    instructions.push('If the request is general or ambiguous, answer helpfully and briefly. Ask one clarifying question only if you truly need it.');
  }

  instructions.push('Keep the tone hopeful, clear, modern, and grace-filled. Do not be judgmental or invent details.');
  instructions.push('');
  instructions.push(siteContext);
  instructions.push('');
  instructions.push(`User message: ${userPrompt}`);
  return instructions.join('\n');
}

function parseProviderOrder(): ProviderName[] {
  const configured = (Deno.env.get('AI_PROVIDER_ORDER') || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is ProviderName => AI_PROVIDER_ORDER.includes(item as ProviderName));

  const order = configured.length > 0 ? configured : [...AI_PROVIDER_ORDER];
  return [...new Set(order)];
}

function getProviderToken(provider: ProviderName): string {
  return (Deno.env.get(PROVIDER_TOKEN_ENV[provider]) || '').trim();
}

function getProviderModel(provider: ProviderName): string {
  return (Deno.env.get(PROVIDER_MODEL_ENV[provider]) || DEFAULT_MODELS[provider]).trim();
}

function isRetryableProviderFailure(status: number, error: string): boolean {
  if ([402, 408, 409, 429, 500, 502, 503, 504, 529].includes(status)) return true;
  return /(quota|rate.?limit|billing|credit|insufficient|exhaust|capacity|overloaded|temporar|unavailable)/i.test(error);
}

async function readJsonResponse(res: Response) {
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return { raw, data };
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  return await fetch(input, { ...init, signal: AbortSignal.timeout(MAX_PROVIDER_TIMEOUT_MS) });
}

function buildFailure(provider: ProviderName, model: string, status: number, error: string): ProviderAttempt {
  return {
    provider,
    model,
    status,
    error,
    retryable: isRetryableProviderFailure(status, error),
  };
}

async function logAiChat(payload: {
  prompt: string;
  response?: string;
  error?: string;
  provider?: string;
  model?: string;
  path?: string;
  intent?: AiIntent;
  success: boolean;
}) {
  const { supabaseUrl, serviceRoleKey } = getServiceRoleClientConfig();
  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    await fetch(`${supabaseUrl}/rest/v1/ai_chat_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        prompt: payload.prompt,
        response: payload.response || null,
        error: payload.error || null,
        provider: payload.provider || null,
        model: payload.model || null,
        origin: null,
        path: payload.path || '/',
        success: payload.success,
        metadata: {
          intent: payload.intent || null,
        },
      }),
    });
  } catch (error) {
    console.error('Failed to log ai_chat_logs entry:', error);
  }
}

async function generateWithDeepSeek(prompt: string, model: string, token: string, maxNewTokens: number) {
  try {
    const res = await fetchWithTimeout(DEEPSEEK_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxNewTokens,
      }),
    });
    const { raw, data } = await readJsonResponse(res);
    if (!res.ok) {
      return buildFailure('deepseek', model, res.status, data?.error?.message || data?.error || raw || `Request failed (${res.status})`);
    }
    const text = extractOpenAiLikeText(data);
    return text
      ? { text, provider: 'deepseek' as const, model }
      : buildFailure('deepseek', model, 502, 'No text generated');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return buildFailure('deepseek', model, 502, message);
  }
}

async function generateWithAnthropic(prompt: string, model: string, token: string, maxNewTokens: number) {
  try {
    const res = await fetchWithTimeout(ANTHROPIC_MESSAGES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': token,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxNewTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const { raw, data } = await readJsonResponse(res);
    if (!res.ok) {
      return buildFailure('anthropic', model, res.status, data?.error?.message || raw || `Request failed (${res.status})`);
    }
    const text = extractAnthropicText(data);
    return text
      ? { text, provider: 'anthropic' as const, model }
      : buildFailure('anthropic', model, 502, 'No text generated');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return buildFailure('anthropic', model, 502, message);
  }
}

async function generateWithGemini(prompt: string, model: string, token: string, maxNewTokens: number) {
  try {
    const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`;
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxNewTokens,
        },
      }),
    });
    const { raw, data } = await readJsonResponse(res);
    if (!res.ok) {
      return buildFailure('gemini', model, res.status, data?.error?.message || raw || `Request failed (${res.status})`);
    }
    const text = extractGeminiText(data);
    return text
      ? { text, provider: 'gemini' as const, model }
      : buildFailure('gemini', model, 502, data?.promptFeedback?.blockReason || 'No text generated');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return buildFailure('gemini', model, 502, message);
  }
}

async function generateWithOpenAI(prompt: string, model: string, token: string, maxNewTokens: number) {
  try {
    const res = await fetchWithTimeout(OPENAI_RESPONSES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: maxNewTokens,
      }),
    });
    const { raw, data } = await readJsonResponse(res);
    if (!res.ok) {
      return buildFailure('openai', model, res.status, data?.error?.message || raw || `Request failed (${res.status})`);
    }
    const text = extractOpenAIResponsesText(data);
    return text
      ? { text, provider: 'openai' as const, model }
      : buildFailure('openai', model, 502, 'No text generated');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return buildFailure('openai', model, 502, message);
  }
}

async function generateWithProvider(provider: ProviderName, prompt: string, maxNewTokens: number) {
  const token = getProviderToken(provider);
  const model = getProviderModel(provider);
  if (!token) return buildFailure(provider, model, 500, `Missing ${PROVIDER_TOKEN_ENV[provider]} secret`);

  switch (provider) {
    case 'gemini':
      return await generateWithGemini(prompt, model, token, maxNewTokens);
    case 'deepseek':
      return await generateWithDeepSeek(prompt, model, token, maxNewTokens);
    case 'anthropic':
      return await generateWithAnthropic(prompt, model, token, maxNewTokens);
    case 'openai':
      return await generateWithOpenAI(prompt, model, token, maxNewTokens);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const corsHeaders = corsHeadersFor(origin);

  // CORS preflight first: OPTIONS has no JWT, so Supabase must run this with verify_jwt = false (see supabase/config.toml).
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(origin)) {
      return new Response(null, { status: 403, headers: corsHeadersFor(origin) });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const configuredProviders = parseProviderOrder().filter((provider) => getProviderToken(provider));
  if (configuredProviders.length === 0) {
    return new Response(JSON.stringify({
      error: 'Server configuration error: add at least one AI provider secret (GEMINI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY).',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: GenerationRequest = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const prompt = (body.prompt || '').trim().slice(0, MAX_PROMPT_CHARS);
  const maxNewTokens = Number.isFinite(body.maxNewTokens)
    ? Math.max(32, Math.min(MAX_NEW_TOKENS, Number(body.maxNewTokens)))
    : 400;
  const path = normalizePath(body.path, referer);
  const intent = detectIntentSignals(prompt);
  const siteContext = buildSiteContext(await fetchCurrentSiteConfig());
  const finalPrompt = buildAugmentedPrompt(prompt, siteContext, intent);

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Prompt is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const attempts: ProviderAttempt[] = [];

  for (const provider of configuredProviders) {
    const result = await generateWithProvider(provider, finalPrompt, maxNewTokens);
    if ('text' in result) {
      const success = result as ProviderSuccess;
      await logAiChat({
        prompt,
        response: success.text,
        provider: success.provider,
        model: success.model,
        path,
        intent: intent.primaryIntent,
        success: true,
      });
      return new Response(JSON.stringify({
        text: success.text,
        provider: success.provider,
        model: success.model,
        intent: intent.primaryIntent,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    attempts.push(result);
    if (!result.retryable) {
      await logAiChat({
        prompt,
        error: result.error,
        provider: result.provider,
        model: result.model,
        path,
        intent: intent.primaryIntent,
        success: false,
      });
      return new Response(JSON.stringify({
        error: result.error,
        provider: result.provider,
        model: result.model,
        intent: intent.primaryIntent,
        attempts,
      }), {
        status: result.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const lastAttempt = attempts[attempts.length - 1];
  await logAiChat({
    prompt,
    error: lastAttempt?.error || 'All AI providers failed',
    provider: lastAttempt?.provider,
    model: lastAttempt?.model,
    path,
    intent: intent.primaryIntent,
    success: false,
  });
  return new Response(JSON.stringify({
    error: lastAttempt?.error || 'All AI providers failed',
    intent: intent.primaryIntent,
    attempts,
  }), {
    status: lastAttempt?.status || 502,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
