import { Env } from '../types';

export interface AuthResult {
  authorized: boolean;
  error?: Response;
}

export function validateApiKey(request: Request, env: Env): AuthResult {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return {
      authorized: false,
      error: new Response(
        JSON.stringify({
          success: false,
          error: 'Authorization header is required',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return {
      authorized: false,
      error: new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid authorization format. Use: Bearer <token>',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  if (token !== env.API_KEY) {
    return {
      authorized: false,
      error: new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid API key',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  return { authorized: true };
}

export function validateAdminCredentials(
  username: string,
  password: string,
  env: Env
): boolean {
  return username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD;
}

export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
