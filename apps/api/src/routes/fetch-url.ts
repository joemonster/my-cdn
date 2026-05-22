import { Env } from '../types';
import { errorResponse } from '../utils/response';

const MAX_BYTES = 15 * 1024 * 1024; // 15MB — matches video upload cap
const FETCH_TIMEOUT_MS = 15000;

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
  clearTimeout(timeoutId);

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

  let buffer: ArrayBuffer;
  try {
    buffer = await upstream.arrayBuffer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to read body';
    return errorResponse(`Download failed: ${msg}`, 502);
  }

  if (buffer.byteLength === 0) {
    return errorResponse('Downloaded body is empty', 502);
  }
  if (buffer.byteLength > MAX_BYTES) {
    return errorResponse(
      `File too large: ${buffer.byteLength} bytes (max ${MAX_BYTES})`,
      413
    );
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
}
