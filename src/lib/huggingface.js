/**
 * Hugging Face generation is proxied through Supabase Edge Function to avoid browser CORS
 * and to keep the token server-side.
 */

function getFunctionUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL?.trim()?.replace(/\/$/, '');
  return base ? `${base}/functions/v1/hf-generate` : '';
}

export function isHuggingFaceConfigured() {
  return !!(import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim());
}

/**
 * Generate text from prompt via Supabase Edge Function proxy.
 * @param {string} prompt
 * @param {object} options { model?: string, maxNewTokens?: number }
 * @returns {Promise<{ text: string } | { error: string }>}
 */
export async function generateText(prompt, options = {}) {
  const functionUrl = getFunctionUrl();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const model = import.meta.env.VITE_HF_MODEL?.trim() || 'HuggingFaceTB/SmolLM3-3B';
  const maxNewTokens = options.maxNewTokens ?? 400;

  if (!functionUrl || !anonKey) {
    return { error: 'AI proxy not configured. Add Supabase URL/anon key and deploy hf-generate function.' };
  }

  try {
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        prompt,
        model,
        maxNewTokens,
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
      return { error: data?.error || raw || `Request failed (${res.status})` };
    }

    const text = data?.text;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    return trimmed ? { text: trimmed } : { error: 'No text generated' };
  } catch (err) {
    console.error('AI proxy error:', err);
    return { error: err?.message || 'Network error' };
  }
}
