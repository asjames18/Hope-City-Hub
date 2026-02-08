/**
 * Hugging Face Inference API for text generation.
 * Used by the Hope AI Assistant for prayers and scripture.
 * Get a token at https://huggingface.co/settings/tokens (read role is enough for inference).
 */

const INFERENCE_URL = 'https://api-inference.huggingface.co/models';

export function isHuggingFaceConfigured() {
  return !!(import.meta.env.VITE_HUGGINGFACE_TOKEN?.trim());
}

/**
 * Generate text from a prompt using the Inference API.
 * @param {string} prompt - Full prompt (instruction + user input)
 * @param {object} options - { model?: string, maxNewTokens?: number }
 * @returns {Promise<{ text: string } | { error: string }>}
 */
export async function generateText(prompt, options = {}) {
  const token = import.meta.env.VITE_HUGGINGFACE_TOKEN?.trim();
  const model =
    import.meta.env.VITE_HF_MODEL?.trim() ||
    'google/flan-t5-large';
  const maxNewTokens = options.maxNewTokens ?? 400;

  if (!token) {
    return { error: 'Hugging Face token not configured' };
  }

  try {
    const res = await fetch(`${INFERENCE_URL}/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: maxNewTokens,
          return_full_text: false,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg =
        data?.error ??
        (typeof data === 'string' ? data : null) ??
        `Request failed (${res.status})`;
      if (res.status === 503 && (msg.includes('loading') || msg.includes('Loading'))) {
        return { error: 'Model is loading. Please try again in 15–20 seconds.' };
      }
      return { error: msg };
    }

    // Response shape: array with { generated_text: "..." } or single object
    const first = Array.isArray(data) ? data[0] : data;
    const text = first?.generated_text ?? '';
    const trimmed = typeof text === 'string' ? text.trim() : '';
    return trimmed ? { text: trimmed } : { error: 'No text generated' };
  } catch (err) {
    console.error('Hugging Face inference error:', err);
    return { error: err?.message ?? 'Network error' };
  }
}
