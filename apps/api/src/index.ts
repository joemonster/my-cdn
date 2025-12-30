import { Env, EXTENSION_TO_MIME } from './types';
import { validateApiKey, validateAdminCredentials, generateSessionToken } from './middleware/auth';
import { handleUpload } from './routes/upload';
import { handleGetFiles } from './routes/files';
import { handleGetFile, handleUpdateFile, handleDeleteFile } from './routes/file';
import { getFromR2 } from './utils/storage';

// CORS headers for panel access
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

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      let response: Response;

      // Public file serving - matches /YYYYMM/hash.ext
      if (path.match(/^\/\d{6}\/[\w-]+\.\w+$/)) {
        response = await handleFileServing(request, env, path);
      }
      // API routes
      else if (path.startsWith('/api/')) {
        response = await handleApiRoutes(request, env, path);
      }
      // Panel redirect
      else if (path.startsWith('/panel')) {
        const newPath = path.replace('/panel', '') || '/';
        return Response.redirect(`https://my-cdn-panel.pages.dev${newPath}`, 302);
      }
      // Root path
      else if (path === '/') {
        response = new Response(
          JSON.stringify({
            name: 'My CDN API',
            version: '1.0.0',
            status: 'ok',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      // 404
      else {
        response = new Response(
          JSON.stringify({ success: false, error: 'Not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Add CORS headers to response
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
        JSON.stringify({
          success: false,
          error: 'Internal server error',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
  },
};

async function handleFileServing(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  // Remove leading slash
  const storedPath = path.substring(1);

  // Get file from R2
  const object = await getFromR2(env.BUCKET, storedPath);

  if (!object) {
    return new Response('File not found', { status: 404 });
  }

  // Determine content type from extension
  const extension = path.split('.').pop()?.toLowerCase() || '';
  const contentType = EXTENSION_TO_MIME[extension] || 'application/octet-stream';

  // Return file with caching headers
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

async function handleApiRoutes(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  // Auth endpoint (no API key required)
  if (path === '/api/auth/login' && request.method === 'POST') {
    return handleLogin(request, env);
  }

  // All other API endpoints require API key
  const authResult = validateApiKey(request, env);
  if (!authResult.authorized) {
    return authResult.error!;
  }

  // Upload
  if (path === '/api/upload' && request.method === 'POST') {
    return handleUpload(request, env);
  }

  // Files list
  if (path === '/api/files' && request.method === 'GET') {
    return handleGetFiles(request, env);
  }

  // Single file operations
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

  // 404 for unknown API routes
  return new Response(
    JSON.stringify({ success: false, error: 'API endpoint not found' }),
    { status: 404, headers: { 'Content-Type': 'application/json' } }
  );
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { username?: string; password?: string };
    const { username, password } = body;

    if (!username || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Username and password are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!validateAdminCredentials(username, password, env)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid credentials' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return the API key as the session token
    // In a production environment, you might want to generate a separate session token
    return new Response(
      JSON.stringify({
        success: true,
        token: env.API_KEY,
        message: 'Login successful',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
