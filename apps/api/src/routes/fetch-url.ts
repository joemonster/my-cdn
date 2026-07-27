import { Env, MAX_VIDEO_SIZE } from '../types';
import { errorResponse } from '../utils/response';

const MAX_BYTES = MAX_VIDEO_SIZE; // matches video upload cap
// Covers the whole transfer, headers and body, so it has to fit a MAX_BYTES
// download rather than just the initial response.
const FETCH_TIMEOUT_MS = 60000;

type CappedRead =
  | { ok: true; buffer: ArrayBuffer }
  | { ok: false; reason: 'too-large' | 'no-body' };

/**
 * Read the body while counting bytes, aborting as soon as the cap is passed.
 * Buffering first and checking the size afterwards would let an upstream that
 * lies about (or omits) content-length pull far more than MAX_BYTES into the
 * Worker's 128MB of memory.
 */
async function readCapped(res: Response, maxBytes: number): Promise<CappedRead> {
  const reader = res.body?.getReader();
  if (!reader) return { ok: false, reason: 'no-body' };

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: 'too-large' };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, buffer: merged.buffer };
}

export async function handleFetchUrl(request: Request, env: Env): Promise<Response> {
  let targetUrl: string;
  try {
    const body = (await request.json()) as { url?: string };
    targetUrl = (body.url || '').trim();
  } catch {
    return errorResponse('Invalid request body', 400);
  }

  if (!targetUrl) {
    return errorResponse('URL is required', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return errorResponse('Invalid URL', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return errorResponse('Only http(s) URLs are allowed', 400);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; my-cdn/1.0)',
        'Accept': 'image/*, video/*, */*;q=0.8',
        'Referer': `${parsed.protocol}//${parsed.host}/`,
      },
      redirect: 'follow',
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : 'Network error';
    return errorResponse(`Fetch failed: ${msg}`, 502);
  }

  // The timeout stays armed until the body is fully read — clearing it here
  // would leave a 50MB download able to hang indefinitely.
  try {
    if (!upstream.ok) {
      return errorResponse(`Upstream returned HTTP ${upstream.status}`, 502);
    }

    const contentLengthHeader = upstream.headers.get('content-length');
    if (contentLengthHeader) {
      const declared = parseInt(contentLengthHeader, 10);
      if (Number.isFinite(declared) && declared > MAX_BYTES) {
        return errorResponse(
          `File too large: ${declared} bytes (max ${MAX_BYTES})`,
          413
        );
      }
    }

    let read: CappedRead;
    try {
      read = await readCapped(upstream, MAX_BYTES);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read body';
      return errorResponse(`Download failed: ${msg}`, 502);
    }

    if (!read.ok) {
      if (read.reason === 'too-large') {
        return errorResponse(`File too large: exceeds ${MAX_BYTES} bytes`, 413);
      }
      return errorResponse('Downloaded body is empty', 502);
    }

    const buffer = read.buffer;
    if (buffer.byteLength === 0) {
      return errorResponse('Downloaded body is empty', 502);
    }

    const contentType =
      upstream.headers.get('content-type')?.split(';')[0].trim() ||
      'application/octet-stream';
    const filename = parsed.pathname.split('/').pop() || 'download';

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.byteLength.toString(),
        'X-Original-Filename': encodeURIComponent(filename),
        'Access-Control-Expose-Headers': 'X-Original-Filename',
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
