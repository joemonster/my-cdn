import { Env } from '../types';
import { errorResponse } from '../utils/response';

export interface AuthResult {
  authorized: boolean;
  error?: Response;
}

export function validateApiKey(request: Request, env: Env): AuthResult {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return {
      authorized: false,
      error: errorResponse('Authorization header is required', 401),
    };
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return {
      authorized: false,
      error: errorResponse('Invalid authorization format. Use: Bearer <token>', 401),
    };
  }

  if (token !== env.API_KEY) {
    return {
      authorized: false,
      error: errorResponse('Invalid API key', 401),
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
