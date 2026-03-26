import { Env, FileRecord } from '../types';
import { getFileByStoredPath } from '../utils/db';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getMimeLabel(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'JPEG image',
    'image/jpg': 'JPEG image',
    'image/png': 'PNG image',
    'image/webp': 'WebP image',
    'image/gif': 'GIF image',
    'video/mp4': 'MP4 video',
    'video/webm': 'WebM video',
  };
  return map[mime] || mime;
}

function renderPage(file: FileRecord, cdnBaseUrl: string, viewUrl: string): string {
  const fileUrl = `${cdnBaseUrl}/${file.stored_path}`;
  const isVideo = file.file_type === 'video';
  const description = `${getMimeLabel(file.mime_type)} — ${formatFileSize(file.file_size)}`;

  let ogMedia = '';
  if (isVideo) {
    ogMedia = `
    <meta property="og:video" content="${fileUrl}" />
    <meta property="og:video:type" content="${file.mime_type}" />
    ${file.width ? `<meta property="og:video:width" content="${file.width}" />` : ''}
    ${file.height ? `<meta property="og:video:height" content="${file.height}" />` : ''}
    <meta name="twitter:card" content="player" />
    <meta name="twitter:player" content="${fileUrl}" />`;
  } else {
    ogMedia = `
    <meta property="og:image" content="${fileUrl}" />
    ${file.width ? `<meta property="og:image:width" content="${file.width}" />` : ''}
    ${file.height ? `<meta property="og:image:height" content="${file.height}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${fileUrl}" />`;
  }

  const mediaElement = isVideo
    ? `<video class="media" controls preload="metadata"><source src="${fileUrl}" type="${file.mime_type}" /></video>`
    : `<img class="media" src="${fileUrl}" alt="${file.original_name}" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${file.original_name}</title>
  <meta property="og:title" content="${file.original_name}" />
  <meta property="og:site_name" content="My CDN" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${viewUrl}" />
  <meta property="og:type" content="website" />${ogMedia}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 2rem 1rem; }
    .container { max-width: 900px; width: 100%; }
    .media { max-width: 100%; max-height: 80vh; border-radius: 8px; display: block; margin: 0 auto; }
    video.media { background: #000; }
    .info { margin-top: 1.5rem; padding: 1rem; background: #16213e; border-radius: 8px; }
    .info h1 { font-size: 1.1rem; font-weight: 600; word-break: break-all; margin-bottom: 0.5rem; }
    .meta { color: #8a8a9a; font-size: 0.9rem; }
    .meta span { margin-right: 1.5rem; }
    .open-link { display: inline-block; margin-top: 0.75rem; color: #6c7eff; text-decoration: none; font-size: 0.9rem; }
    .open-link:hover { text-decoration: underline; }
    footer { margin-top: auto; padding-top: 2rem; color: #4a4a5a; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="container">
    ${mediaElement}
    <div class="info">
      <h1>${file.original_name}</h1>
      <div class="meta">
        <span>${getMimeLabel(file.mime_type)}</span>
        <span>${formatFileSize(file.file_size)}</span>
        <span>${formatDate(file.created_at)}</span>
      </div>
      <a class="open-link" href="${fileUrl}" target="_blank">Open original</a>
    </div>
  </div>
  <footer>My CDN</footer>
</body>
</html>`;
}

function render404(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>File not found</title>
  <style>
    body { background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    h1 { font-size: 1.5rem; font-weight: 400; }
  </style>
</head>
<body><h1>File not found</h1></body>
</html>`;
}

export async function handleViewPage(env: Env, path: string): Promise<Response> {
  const storedPath = path.substring('/view/'.length);

  const file = await getFileByStoredPath(env.DB, storedPath);

  if (!file) {
    return new Response(render404(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const viewUrl = `${env.CDN_BASE_URL}/view/${file.stored_path}`;
  const html = renderPage(file, env.CDN_BASE_URL, viewUrl);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
