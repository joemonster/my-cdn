import { Env } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';

// --- Model Registry ---

type ModelType = 'multimodal' | 'image-only';

interface ModelConfig {
  slug: string;
  type: ModelType;
  timeout: number;
  prefix: string;
}

const MODELS: Record<string, ModelConfig> = {
  'nano-banana-pro': {
    slug: 'google/gemini-3-pro-image',
    type: 'multimodal',
    timeout: 60000,
    prefix: 'nbpro',
  },
  'nano-banana': {
    slug: 'google/gemini-2.5-flash-image',
    type: 'multimodal',
    timeout: 30000,
    prefix: 'nb',
  },
  imagen: {
    slug: 'google/imagen-4.0-generate',
    type: 'image-only',
    timeout: 45000,
    prefix: 'imgn',
  },
  flux: {
    slug: 'bfl/flux-2-pro',
    type: 'image-only',
    timeout: 45000,
    prefix: 'flux',
  },
};

const VALID_MODELS = Object.keys(MODELS);

// --- Request / Response types ---

interface GenerateRequest {
  model: string;
  prompt: string;
  source_image_url?: string;
  options?: {
    aspect_ratio?: string;
    n?: number;
  };
}

interface GenerateResult {
  base64Images: string[];
  modelUsed: string;
  modelPrefix: string;
}

type ErrorCode =
  | 'INVALID_JSON'
  | 'MISSING_PROMPT'
  | 'INVALID_MODEL'
  | 'CONTENT_FILTERED'
  | 'MODEL_EMPTY_RESPONSE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'R2_UPLOAD_FAILED'
  | 'API_ERROR';

const MAX_PROMPT_LENGTH = 10000;
const MAX_N = 4;

// --- Helpers ---

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function genErrorResponse(code: ErrorCode, message: string, status: number, extra?: Record<string, boolean>) {
  return jsonResponse({ status: 'error', error: { code, message, ...extra } }, status);
}

// --- API callers ---

async function callImageOnly(
  env: Env,
  model: ModelConfig,
  prompt: string,
  n: number,
  aspectRatio?: string,
): Promise<{ base64Images: string[]; errorCode?: ErrorCode; errorMessage?: string }> {
  const body: Record<string, unknown> = {
    model: model.slug,
    prompt,
    n,
    response_format: 'b64_json',
  };
  if (aspectRatio) body.aspect_ratio = aspectRatio;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), model.timeout);

  try {
    const res = await fetch('https://ai-gateway.vercel.sh/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.VERCEL_AI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 429) return { base64Images: [], errorCode: 'RATE_LIMITED', errorMessage: 'Rate limited by provider' };
    if (res.status === 422) return { base64Images: [], errorCode: 'CONTENT_FILTERED', errorMessage: 'Content filtered by safety system' };

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      return { base64Images: [], errorCode: 'API_ERROR', errorMessage: `Provider returned ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json() as { data?: Array<{ b64_json?: string }> };
    const images = (data.data || []).map((d) => d.b64_json).filter(Boolean) as string[];
    if (images.length === 0) return { base64Images: [], errorCode: 'MODEL_EMPTY_RESPONSE', errorMessage: 'Model returned no images' };

    return { base64Images: images };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { base64Images: [], errorCode: 'TIMEOUT', errorMessage: `Model timed out after ${model.timeout}ms` };
    }
    return { base64Images: [], errorCode: 'API_ERROR', errorMessage: String(err) };
  }
}

async function callMultimodal(
  env: Env,
  model: ModelConfig,
  prompt: string,
  sourceImageUrl?: string,
): Promise<{ base64Images: string[]; errorCode?: ErrorCode; errorMessage?: string }> {
  // Build messages
  let content: unknown;
  if (sourceImageUrl) {
    content = [
      { type: 'image_url', image_url: { url: sourceImageUrl } },
      { type: 'text', text: prompt },
    ];
  } else {
    content = prompt;
  }

  const body = {
    model: model.slug,
    messages: [{ role: 'user', content }],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), model.timeout);

  try {
    const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.VERCEL_AI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 429) return { base64Images: [], errorCode: 'RATE_LIMITED', errorMessage: 'Rate limited by provider' };
    if (res.status === 422) return { base64Images: [], errorCode: 'CONTENT_FILTERED', errorMessage: 'Content filtered by safety system' };

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      return { base64Images: [], errorCode: 'API_ERROR', errorMessage: `Provider returned ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json() as Record<string, unknown>;
    const images = extractImagesFromMultimodal(data);
    if (images.length === 0) return { base64Images: [], errorCode: 'MODEL_EMPTY_RESPONSE', errorMessage: 'Model returned no images in response' };

    return { base64Images: images };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { base64Images: [], errorCode: 'TIMEOUT', errorMessage: `Model timed out after ${model.timeout}ms` };
    }
    return { base64Images: [], errorCode: 'API_ERROR', errorMessage: String(err) };
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractImagesFromMultimodal(data: any): string[] {
  const base64Images: string[] = [];

  function extractDataUri(url: string) {
    if (url?.startsWith('data:')) {
      const b64 = url.split(',')[1];
      if (b64) base64Images.push(b64);
    }
  }

  for (const choice of data.choices || []) {
    const msg = choice.message;
    if (!msg) continue;

    // Format A: images array on message (Gemini via Vercel Gateway)
    if (Array.isArray(msg.images)) {
      for (const img of msg.images) {
        if (img.image_url?.url) extractDataUri(img.image_url.url);
        if (img.inline_data?.data) base64Images.push(img.inline_data.data);
        if (img.data) base64Images.push(img.data);
      }
    }

    // Format B: content is array of parts
    const content = msg.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.inline_data?.data) base64Images.push(part.inline_data.data);
        if (part.type === 'image_url' && part.image_url?.url) extractDataUri(part.image_url.url);
        if (part.type === 'image' && part.data) base64Images.push(part.data);
      }
    }
  }

  return base64Images;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- Retry + fallback orchestration ---

const NO_RETRY_CODES = new Set<ErrorCode>(['CONTENT_FILTERED', 'RATE_LIMITED']);

const ERROR_STATUS_MAP: Record<string, number> = {
  CONTENT_FILTERED: 422,
  RATE_LIMITED: 429,
  TIMEOUT: 504,
  MODEL_EMPTY_RESPONSE: 502,
  API_ERROR: 502,
};

async function generateWithRetry(
  env: Env,
  modelName: string,
  prompt: string,
  n: number,
  sourceImageUrl?: string,
  aspectRatio?: string,
): Promise<GenerateResult | Response> {
  const model = MODELS[modelName];

  const callModel = () =>
    model.type === 'image-only'
      ? callImageOnly(env, model, prompt, n, aspectRatio)
      : callMultimodal(env, model, prompt, sourceImageUrl);

  let result = await callModel();
  const retried = !!(result.errorCode && !NO_RETRY_CODES.has(result.errorCode));

  // Retry once on transient errors (timeout, empty response, API error)
  if (retried) {
    result = await callModel();
  }

  if (result.base64Images.length > 0) {
    return { base64Images: result.base64Images, modelUsed: model.slug, modelPrefix: model.prefix };
  }

  return genErrorResponse(
    result.errorCode!,
    result.errorMessage || 'Generation failed',
    ERROR_STATUS_MAP[result.errorCode!] || 502,
    { retried },
  );
}

// --- R2 upload ---

async function uploadToR2(env: Env, base64Images: string[], modelPrefix: string): Promise<Array<{ url: string; expires_at: string }> | Response> {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const results: Array<{ url: string; expires_at: string }> = [];

  for (const b64 of base64Images) {
    const id = crypto.randomUUID().slice(0, 12);
    const key = `ai-gen/${datePrefix}/${modelPrefix}-${id}.png`;

    try {
      const buffer = base64ToArrayBuffer(b64);
      await env.BUCKET.put(key, buffer, {
        httpMetadata: { contentType: 'image/png' },
      });
      results.push({
        url: `${env.CDN_BASE_URL}/${key}`,
        expires_at: expiresAt,
      });
    } catch (err) {
      console.error('R2 upload failed:', err);
      return genErrorResponse('R2_UPLOAD_FAILED', 'Failed to upload generated image to storage', 502);
    }
  }

  return results;
}

// --- Main handler ---

async function parseRequest(request: Request): Promise<GenerateRequest | Response> {
  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData();
      const model = formData.get('model') as string | null;
      const prompt = formData.get('prompt') as string | null;
      const sourceImageUrl = formData.get('source_image_url') as string | null;
      const aspectRatio = formData.get('aspect_ratio') as string | null;
      const nStr = formData.get('n') as string | null;
      const file = formData.get('image') as File | null;

      let imageDataUri = sourceImageUrl || undefined;

      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        const mime = file.type || 'image/png';
        imageDataUri = `data:${mime};base64,${base64}`;
      }

      return {
        model: model || '',
        prompt: prompt || '',
        source_image_url: imageDataUri,
        options: {
          aspect_ratio: aspectRatio || undefined,
          n: nStr ? parseInt(nStr, 10) : undefined,
        },
      };
    } catch {
      return genErrorResponse('INVALID_JSON', 'Invalid multipart form data', 400);
    }
  }

  try {
    return await request.json() as GenerateRequest;
  } catch {
    return genErrorResponse('INVALID_JSON', 'Invalid JSON in request body', 400);
  }
}

export async function handleAiGenerate(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();

  // Parse body (JSON or multipart/form-data)
  const parsed = await parseRequest(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed;

  // Validate
  if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    return genErrorResponse('MISSING_PROMPT', 'Prompt is required', 400);
  }

  if (body.prompt.length > MAX_PROMPT_LENGTH) {
    return genErrorResponse('MISSING_PROMPT', `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`, 400);
  }

  if (!body.model || !MODELS[body.model]) {
    return genErrorResponse('INVALID_MODEL', `Invalid model. Available models: ${VALID_MODELS.join(', ')}`, 400);
  }

  const n = Math.min(Math.max(body.options?.n || 1, 1), MAX_N);
  const aspectRatio = body.options?.aspect_ratio;
  const sourceImageUrl = body.source_image_url;

  // Generate
  const genResult = await generateWithRetry(env, body.model, body.prompt.trim(), n, sourceImageUrl, aspectRatio);
  if (genResult instanceof Response) return genResult;

  // Upload to R2
  const uploadResult = await uploadToR2(env, genResult.base64Images, genResult.modelPrefix);
  if (uploadResult instanceof Response) return uploadResult;

  return jsonResponse({
    status: 'completed',
    images: uploadResult,
    model_used: genResult.modelUsed,
    duration_ms: Date.now() - startTime,
  });
}

// --- Cron cleanup ---

export async function cleanupExpiredImages(env: Env): Promise<void> {
  let deleted = 0;

  for (let daysBack = 1; daysBack <= 7; daysBack++) {
    const date = new Date(Date.now() - daysBack * 86400000);
    const prefix = `ai-gen/${date.toISOString().slice(0, 10)}/`;

    let cursor: string | undefined;
    do {
      const listed = await env.BUCKET.list({ prefix, limit: 1000, cursor });
      if (listed.objects.length === 0) break;

      for (const obj of listed.objects) {
        await env.BUCKET.delete(obj.key);
        deleted++;
      }

      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }

  console.log(`Cleanup: deleted ${deleted} expired AI-generated images`);
}
