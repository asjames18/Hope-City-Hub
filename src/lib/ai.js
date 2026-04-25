/**
 * AI generation is proxied through a Supabase Edge Function so provider keys stay server-side.
 */

function getFunctionUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL?.trim()?.replace(/\/$/, '');
  return base ? `${base}/functions/v1/hf-generate` : '';
}

const DEFAULT_TIMEOUT_MS = 25000;
const MAX_PROMPT_CHARS = 2500;
const MAX_NEW_TOKENS = 600;

function getCurrentPath() {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname || '/'}${window.location.search || ''}`.slice(0, 250);
}

export function isAIEnabled() {
  const raw = import.meta.env.VITE_ENABLE_AI;
  const flag = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  if (flag === 'true' || flag === '1' || flag === 'on') return true;
  return import.meta.env.DEV || isAIProxyConfigured();
}

export function isAIProxyConfigured() {
  return !!(import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim());
}

/**
 * Generate text from the server-side AI proxy.
 * @param {string} prompt
 * @param {object} options { maxNewTokens?: number, timeoutMs?: number }
 * @returns {Promise<{ text: string, provider?: string, model?: string, intent?: string } | { error: string, intent?: string }>}
 */
export async function generateText(prompt, options = {}) {
  const functionUrl = getFunctionUrl();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const maxNewTokens = Math.min(Math.max(Number(options.maxNewTokens ?? 400), 1), MAX_NEW_TOKENS);
  const timeoutMs = Math.max(Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS), 1000);
  const normalizedPrompt = String(prompt || '').trim().slice(0, MAX_PROMPT_CHARS);

  if (!functionUrl || !anonKey) {
    return { error: 'AI proxy not configured. Add Supabase URL/anon key and deploy the AI edge function.' };
  }
  if (!normalizedPrompt) {
    return { error: 'Prompt is required.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(functionUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        prompt: normalizedPrompt,
        maxNewTokens,
        path: getCurrentPath(),
      }),
    });

    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      return {
        error: data?.error || raw || `Request failed (${res.status})`,
        intent: typeof data?.intent === 'string' ? data.intent : undefined,
      };
    }

    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    return text
      ? {
        text,
        provider: data?.provider,
        model: data?.model,
        intent: typeof data?.intent === 'string' ? data.intent : undefined,
      }
      : { error: 'No text generated', intent: typeof data?.intent === 'string' ? data.intent : undefined };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { error: 'Request timed out. Please try again.' };
    }
    console.error('AI proxy error:', err);
    return { error: err?.message || 'Network error' };
  } finally {
    clearTimeout(timeoutId);
  }
}
