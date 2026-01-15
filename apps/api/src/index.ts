import { Env, EXTENSION_TO_MIME } from './types';
import { validateApiKey, validateAdminCredentials } from './middleware/auth';
import { handleUpload } from './routes/upload';
import { handleGetFiles } from './routes/files';
import { handleGetFile, handleUpdateFile, handleDeleteFile } from './routes/file';
import { getFromR2 } from './utils/storage';
import { jsonResponse, errorResponse, successResponse } from './utils/response';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      let response: Response;

      if (path.match(/^\/\d{6}\/[\w-]+\.\w+$/)) {
        response = await handleFileServing(env, path);
      } else if (path.startsWith('/api/')) {
        response = await handleApiRoutes(request, env, path);
      } else if (path.startsWith('/panel')) {
        const newPath = path.replace('/panel', '') || '/';
        return Response.redirect(`https://my-cdn-panel.pages.dev${newPath}`, 302);
      } else if (path === '/') {
        response = jsonResponse({ name: 'My CDN API', version: '1.0.0', status: 'ok' });
      } else {
        response = errorResponse('Not found', 404);
      }

      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  },
};

async function handleFileServing(env: Env, path: string): Promise<Response> {
  const storedPath = path.substring(1);
  const object = await getFromR2(env.BUCKET, storedPath);

  if (!object) {
    return new Response('File not found', { status: 404 });
  }

  const extension = path.split('.').pop()?.toLowerCase() || '';
  const contentType = EXTENSION_TO_MIME[extension] || 'application/octet-stream';

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': object.size.toString(),
      'ETag': object.etag,
    },
  });
}

async function handleApiRoutes(request: Request, env: Env, path: string): Promise<Response> {
  if (path === '/api/auth/login' && request.method === 'POST') {
    return handleLogin(request, env);
  }

  const authResult = validateApiKey(request, env);
  if (!authResult.authorized) {
    return authResult.error!;
  }

  if (path === '/api/upload' && request.method === 'POST') {
    return handleUpload(request, env);
  }

  if (path === '/api/files' && request.method === 'GET') {
    return handleGetFiles(request, env);
  }

  const fileMatch = path.match(/^\/api\/file\/([a-f0-9-]+)$/i);
  if (fileMatch) {
    const fileId = fileMatch[1];
    switch (request.method) {
      case 'GET':
        return handleGetFile(request, env, fileId);
      case 'PATCH':
        return handleUpdateFile(request, env, fileId);
      case 'DELETE':
        return handleDeleteFile(request, env, fileId);
    }
  }

  return errorResponse('API endpoint not found', 404);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { username?: string; password?: string };
    const { username, password } = body;

    if (!username || !password) {
      return errorResponse('Username and password are required', 400);
    }

    if (!validateAdminCredentials(username, password, env)) {
      return errorResponse('Invalid credentials', 401);
    }

    return successResponse({ token: env.API_KEY, message: 'Login successful' });
  } catch {
    return errorResponse('Invalid request body', 400);
  }
}
