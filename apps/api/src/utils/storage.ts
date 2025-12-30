import { Env, EXTENSION_TO_MIME } from '../types';

export async function uploadToR2(
  bucket: R2Bucket,
  path: string,
  data: ArrayBuffer | ReadableStream,
  contentType: string
): Promise<R2Object> {
  return await bucket.put(path, data, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });
}

export async function deleteFromR2(
  bucket: R2Bucket,
  path: string
): Promise<void> {
  await bucket.delete(path);
}

export async function getFromR2(
  bucket: R2Bucket,
  path: string
): Promise<R2ObjectBody | null> {
  return await bucket.get(path);
}

export function generateStoragePath(hash: string, extension: string): string {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `${yearMonth}/${hash}.${extension}`;
}

export function generateThumbnailPath(hash: string, extension: string): string {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `${yearMonth}/${hash}_thumb.${extension}`;
}

export async function generateFileHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

export function getContentTypeFromPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_TO_MIME[extension] || 'application/octet-stream';
}

export function buildFileUrl(cdnBaseUrl: string, storedPath: string): string {
  return `${cdnBaseUrl}/${storedPath}`;
}

export function extractPathFromUrl(url: string): string {
  const urlObj = new URL(url);
  return urlObj.pathname.substring(1); // Remove leading slash
}
