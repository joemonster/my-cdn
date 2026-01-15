const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export function errorResponse(error: string, status = 400): Response {
  return jsonResponse({ success: false, error }, status);
}

export function successResponse<T extends object>(data: T, status = 200): Response {
  return jsonResponse({ success: true, ...data }, status);
}
