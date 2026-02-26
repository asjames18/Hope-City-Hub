const ALLOWED_ORIGINS = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

function corsHeadersFor(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    delete headers['Access-Control-Allow-Origin'];
  }
  return headers;
}

const HF_CHAT_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';

function extractGeneratedText(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join(' ')
      .trim();
    if (text) return text;
  }
  return '';
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = corsHeadersFor(origin);

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const hfToken = Deno.env.get('HUGGINGFACE_API_TOKEN') || Deno.env.get('HUGGINGFACE_TOKEN');

  if (!hfToken) {
    return new Response(JSON.stringify({ error: 'Server configuration error: missing HuggingFace secret' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { prompt?: string; model?: string; maxNewTokens?: number } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const prompt = (body.prompt || '').trim();
  const model = (body.model || 'HuggingFaceTB/SmolLM3-3B').trim();
  const maxNewTokens = Number.isFinite(body.maxNewTokens) ? Math.max(32, Math.min(600, Number(body.maxNewTokens))) : 400;

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Prompt is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const hfRes = await fetch(HF_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hfToken}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxNewTokens,
      }),
    });

    const raw = await hfRes.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!hfRes.ok) {
      const msg = data?.error?.message || data?.error || raw || `Request failed (${hfRes.status})`;
      return new Response(JSON.stringify({ error: msg }), {
        status: hfRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const text = extractGeneratedText(data);
    if (!text) {
      return new Response(JSON.stringify({ error: 'No text generated' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
