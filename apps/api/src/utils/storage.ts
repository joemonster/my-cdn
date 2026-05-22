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

export async function deleteFromR2(bucket: R2Bucket, path: string): Promise<void> {
  await bucket.delete(path);
}

export async function getFromR2(bucket: R2Bucket, path: string): Promise<R2ObjectBody | null> {
  return await bucket.get(path);
}

function getYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function generateStoragePath(hash: string, extension: string, prefix?: string): string {
  const filename = prefix ? `${prefix}-${hash}` : hash;
  return `${getYearMonth()}/${filename}.${extension}`;
}

export function generateThumbnailPath(hash: string, extension: string): string {
  return `${getYearMonth()}/${hash}_thumb.${extension}`;
}

export async function generateFileHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

export async function moveR2Object(
  bucket: R2Bucket,
  from: string,
  to: string,
): Promise<void> {
  const obj = await bucket.get(from);
  if (!obj) {
    throw new Error(`Source object not found: ${from}`);
  }
  await bucket.put(to, obj.body, {
    httpMetadata: obj.httpMetadata,
    customMetadata: obj.customMetadata,
  });
  await bucket.delete(from);
}
