# ShareX Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable ShareX as an upload destination for my-cdn with a public preview page and lazy thumbnail generation.

**Architecture:** Add a `/view/` route to the CF Workers API that renders an HTML preview page with OpenGraph tags. Extend the upload response with `view_url`. Extend `PATCH /api/file/{id}` to accept thumbnails. Panel lazily generates thumbnails for files missing them. Ship a `.sxcu` config file for one-click ShareX import.

**Tech Stack:** Cloudflare Workers (TypeScript), D1, R2, Next.js (panel)

**Spec:** `docs/superpowers/specs/2026-03-26-sharex-integration-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `apps/api/src/types.ts` | Add `view_url` to `FileResponse` |
| `apps/api/src/utils/db.ts` | Add `getFileByStoredPath()`, extend `updateFile()`, add `view_url` to response |
| `apps/api/src/routes/view.ts` | **New** — preview page handler + HTML renderer |
| `apps/api/src/routes/file.ts` | Extend PATCH handler to accept `thumbnail` |
| `apps/api/src/index.ts` | Add `/view/` route |
| `apps/api/schema.sql` | Add index on `stored_path` |
| `apps/panel/src/lib/api.ts` | Add `uploadThumbnail()` method |
| `apps/panel/src/components/FileTable.tsx` | Add lazy thumbnail generation |
| `sharex-uploader.sxcu` | **New** — ShareX config with real credentials (gitignored) |
| `sharex-uploader.sxcu.template` | **New** — ShareX config with placeholders (committed) |
| `.gitignore` | Add `sharex-uploader.sxcu` |

---

### Task 1: Add `view_url` to types and response builder

**Files:**
- Modify: `apps/api/src/types.ts:27-42`
- Modify: `apps/api/src/utils/db.ts:137-163`

- [ ] **Step 1: Add `view_url` to `FileResponse` interface**

In `apps/api/src/types.ts`, add `view_url` field after `thumbnail_url` (line 30):

```ts
view_url: string;
```

- [ ] **Step 2: Add `view_url` to `fileRecordToResponse()`**

In `apps/api/src/utils/db.ts`, add to the base response object (inside `const response: FileResponse = {`, after `thumbnail_url` line ~145):

```ts
view_url: `${cdnBaseUrl}/view/${file.stored_path}`,
```

This goes in the **base** object, NOT inside `if (includeDetails)`.

- [ ] **Step 3: Verify build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/utils/db.ts
git commit -m "feat: add view_url field to file API response"
```

---

### Task 2: Add `getFileByStoredPath` DB function and index

**Files:**
- Modify: `apps/api/src/utils/db.ts` (after `getFileById`, line 50)
- Modify: `apps/api/schema.sql`

- [ ] **Step 1: Add `getFileByStoredPath` function**

In `apps/api/src/utils/db.ts`, add after `getFileById` function (after line 50):

```ts
export async function getFileByStoredPath(
  db: D1Database,
  storedPath: string
): Promise<FileRecord | null> {
  const result = await db
    .prepare('SELECT * FROM files WHERE stored_path = ? LIMIT 1')
    .bind(storedPath)
    .first<FileRecord>();

  return result;
}
```

- [ ] **Step 2: Add index to schema.sql**

In `apps/api/schema.sql`, add after the last existing index (line 23):

```sql
CREATE INDEX IF NOT EXISTS idx_files_stored_path ON files(stored_path);
```

- [ ] **Step 3: Apply migration to local D1**

Run from `apps/api`:
```bash
npx wrangler d1 execute my-cdn-db --local --command="CREATE INDEX IF NOT EXISTS idx_files_stored_path ON files(stored_path);"
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/utils/db.ts apps/api/schema.sql
git commit -m "feat: add getFileByStoredPath function and stored_path index"
```

---

### Task 3: Create preview page handler

**Files:**
- Create: `apps/api/src/routes/view.ts`

- [ ] **Step 1: Create `apps/api/src/routes/view.ts`**

```ts
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
```

- [ ] **Step 2: Verify build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/view.ts
git commit -m "feat: add public preview page handler with OpenGraph tags"
```

---

### Task 4: Wire up `/view/` route in index.ts

**Files:**
- Modify: `apps/api/src/index.ts:1-8` (imports) and `apps/api/src/index.ts:33-35` (routing)

- [ ] **Step 1: Add import**

In `apps/api/src/index.ts`, add import after existing route imports (after line 5):

```ts
import { handleViewPage } from './routes/view';
```

- [ ] **Step 2: Add route pattern**

In `apps/api/src/index.ts`, inside the `try` block, add a new `else if` between the file serving block (line 34) and the ai-gen block (line 35):

```ts
      } else if (path.match(/^\/view\/\d{6}\/[\w-]+\.\w+$/)) {
        response = await handleViewPage(env, path);
```

- [ ] **Step 3: Verify build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Smoke test locally**

Run: `cd apps/api && npx wrangler dev`

Then in another terminal:
```bash
curl -X POST http://localhost:8787/api/upload \
  -H "Authorization: Bearer 22d-49f5-af40-c98" \
  -F "file=@some-test-image.png"
```

Check `view_url` is in response, then open it in a browser.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: wire up /view/ route for public preview pages"
```

---

### Task 5: Extend PATCH endpoint to accept thumbnail

**Files:**
- Modify: `apps/api/src/utils/db.ts:52-67` (`updateFile` function)
- Modify: `apps/api/src/routes/file.ts:30-73` (`handleUpdateFile`)

- [ ] **Step 1: Extend `updateFile` in db.ts to accept `thumbnail_path`**

In `apps/api/src/utils/db.ts`, replace the `updateFile` function (lines 52-67):

```ts
export async function updateFile(
  db: D1Database,
  id: string,
  updates: Partial<Pick<FileRecord, 'original_name' | 'thumbnail_path'>>
): Promise<FileRecord | null> {
  const now = new Date().toISOString();
  const setClauses: string[] = [];
  const bindings: (string | null)[] = [];

  if (updates.original_name !== undefined) {
    setClauses.push('original_name = ?');
    bindings.push(updates.original_name);
  }

  if (updates.thumbnail_path !== undefined) {
    setClauses.push('thumbnail_path = ?');
    bindings.push(updates.thumbnail_path);
  }

  if (setClauses.length > 0) {
    setClauses.push('updated_at = ?');
    bindings.push(now);
    bindings.push(id);

    await db
      .prepare(`UPDATE files SET ${setClauses.join(', ')} WHERE id = ?`)
      .bind(...bindings)
      .run();
  }

  return await getFileById(db, id);
}
```

- [ ] **Step 2: Extend `handleUpdateFile` in file.ts to handle thumbnail**

In `apps/api/src/routes/file.ts`, add imports at line 3 (after existing imports):

```ts
import { uploadToR2 } from '../utils/storage';
```

Then replace `handleUpdateFile` (lines 30-73) with:

```ts
export async function handleUpdateFile(
  request: Request,
  env: Env,
  fileId: string
): Promise<Response> {
  try {
    const existingFile = await getFileById(env.DB, fileId);

    if (!existingFile) {
      return errorResponse('File not found', 404);
    }

    let body: { original_name?: string; thumbnail?: string };
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    if (body.original_name !== undefined) {
      if (typeof body.original_name !== 'string' || body.original_name.trim() === '') {
        return errorResponse('original_name must be a non-empty string', 400);
      }
    }

    let thumbnailPath: string | undefined;
    if (body.thumbnail) {
      try {
        const base64Data = body.thumbnail.replace(/^data:image\/\w+;base64,/, '');
        const thumbnailBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

        const hash = existingFile.stored_path.split('/').pop()?.split('.')[0] || fileId;
        const yearMonth = existingFile.stored_path.split('/')[0];
        thumbnailPath = `${yearMonth}/${hash}_thumb.jpg`;

        await uploadToR2(env.BUCKET, thumbnailPath, thumbnailBuffer.buffer, 'image/jpeg');
      } catch (error) {
        console.error('Thumbnail upload error:', error);
        return errorResponse('Failed to process thumbnail', 400);
      }
    }

    const updatedFile = await updateFile(env.DB, fileId, {
      original_name: body.original_name,
      thumbnail_path: thumbnailPath,
    });

    if (!updatedFile) {
      return errorResponse('Failed to update file', 500);
    }

    return successResponse({
      file: fileRecordToResponse(updatedFile, env.CDN_BASE_URL, true),
    });
  } catch (error) {
    console.error('Update file error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}
```

- [ ] **Step 3: Verify build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/utils/db.ts apps/api/src/routes/file.ts
git commit -m "feat: extend PATCH /api/file/:id to accept thumbnail"
```

---

### Task 6: Lazy thumbnail generation in panel

**Files:**
- Modify: `apps/panel/src/lib/api.ts:168-173` (add `uploadThumbnail` method)
- Modify: `apps/panel/src/components/FileTable.tsx:183-202` (thumbnail fallback section)

- [ ] **Step 1: Add `uploadThumbnail` method to ApiClient**

In `apps/panel/src/lib/api.ts`, add after the existing `updateFile` method (after line 173):

```ts
  async uploadThumbnail(id: string, thumbnailBase64: string): Promise<FileResponse> {
    return this.request<FileResponse>(`/api/file/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ thumbnail: thumbnailBase64 }),
    });
  }
```

- [ ] **Step 2: Add lazy thumbnail generation to FileTable**

In `apps/panel/src/components/FileTable.tsx`, add import for the thumbnail generator (at line 18, extend the existing import):

```ts
import { FileData, formatFileSize, formatDate, api, SortField, SortOrder, generateImageThumbnail } from '@/lib/api';
```

Then replace the thumbnail fallback section (lines 183-202) with:

```tsx
              {file.thumbnail_url ? (
                <img
                  src={file.thumbnail_url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : file.file_type === 'image' ? (
                <img
                  src={file.url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onLoad={async (e) => {
                    try {
                      const img = e.currentTarget;
                      const canvas = document.createElement('canvas');
                      const MAX_SIZE = 200;
                      let width = img.naturalWidth;
                      let height = img.naturalHeight;

                      if (width > height) {
                        if (width > MAX_SIZE) {
                          height = Math.round((height * MAX_SIZE) / width);
                          width = MAX_SIZE;
                        }
                      } else {
                        if (height > MAX_SIZE) {
                          width = Math.round((width * MAX_SIZE) / height);
                          height = MAX_SIZE;
                        }
                      }

                      canvas.width = width;
                      canvas.height = height;
                      const ctx = canvas.getContext('2d');
                      if (!ctx) return;
                      ctx.drawImage(img, 0, 0, width, height);
                      const base64 = canvas.toDataURL('image/jpeg', 0.8);

                      await api.uploadThumbnail(file.id, base64);
                    } catch {
                      // Silently fail — thumbnail will be generated on next visit
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FileVideo className="w-6 h-6 text-neon-purple" />
                </div>
              )}
```

Note: We inline the Canvas logic instead of using `generateImageThumbnail()` because that function takes a `File` object, not an already-loaded `<img>` element. Using the `onLoad` event on the existing `<img>` avoids loading the image twice.

- [ ] **Step 3: Verify panel build**

Run: `cd apps/panel && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/panel/src/lib/api.ts apps/panel/src/components/FileTable.tsx
git commit -m "feat: lazy thumbnail generation in panel for files without thumbnails"
```

---

### Task 7: ShareX config files and .gitignore

**Files:**
- Create: `sharex-uploader.sxcu`
- Create: `sharex-uploader.sxcu.template`
- Modify: `.gitignore`

- [ ] **Step 1: Create `sharex-uploader.sxcu`** (gitignored, stays local)

```json
{
  "Version": "16.1.0",
  "Name": "My CDN",
  "DestinationType": "ImageUploader",
  "RequestMethod": "POST",
  "RequestURL": "https://my-cdn-api.literalnie.workers.dev/api/upload",
  "Headers": {
    "Authorization": "Bearer 22d-49f5-af40-c98"
  },
  "Body": "MultipartFormData",
  "FileFormName": "file",
  "Arguments": {
    "prefix": "shx",
    "bucket": "sharex"
  },
  "URL": "$json:file.view_url$",
  "ThumbnailURL": "$json:file.thumbnail_url$",
  "DeletionURL": "",
  "ErrorMessage": "$json:error$"
}
```

- [ ] **Step 2: Create `sharex-uploader.sxcu.template`** (committed)

```json
{
  "Version": "16.1.0",
  "Name": "My CDN",
  "DestinationType": "ImageUploader",
  "RequestMethod": "POST",
  "RequestURL": "https://YOUR_CDN_URL/api/upload",
  "Headers": {
    "Authorization": "Bearer YOUR_API_KEY"
  },
  "Body": "MultipartFormData",
  "FileFormName": "file",
  "Arguments": {
    "prefix": "shx",
    "bucket": "sharex"
  },
  "URL": "$json:file.view_url$",
  "ThumbnailURL": "$json:file.thumbnail_url$",
  "DeletionURL": "",
  "ErrorMessage": "$json:error$"
}
```

- [ ] **Step 3: Add to `.gitignore`**

Add at the end of `.gitignore`:

```
# ShareX config with credentials
sharex-uploader.sxcu
```

- [ ] **Step 4: Commit**

```bash
git add sharex-uploader.sxcu.template .gitignore
git commit -m "feat: add ShareX custom uploader config template"
```

---

### Task 8: Deploy and end-to-end test

- [ ] **Step 1: Apply DB migration to production**

```bash
cd apps/api
npx wrangler d1 execute my-cdn-db --command="CREATE INDEX IF NOT EXISTS idx_files_stored_path ON files(stored_path);"
```

- [ ] **Step 2: Deploy API**

```bash
npm run deploy:api
```

- [ ] **Step 3: Deploy Panel**

```bash
npm run deploy:panel
```

- [ ] **Step 4: Test upload with view_url**

```bash
curl -X POST https://my-cdn-api.literalnie.workers.dev/api/upload \
  -H "Authorization: Bearer 22d-49f5-af40-c98" \
  -F "file=@test-image.png" \
  -F "prefix=shx" \
  -F "bucket=sharex"
```

Verify response contains `view_url` field.

- [ ] **Step 5: Test preview page**

Open the `view_url` from the response in a browser. Verify:
- Page renders with dark theme
- Image displays correctly
- Metadata (name, size, date) shown
- "Open original" link works

- [ ] **Step 6: Test lazy thumbnail generation**

Open the panel, find the file uploaded in step 4. It should:
- Initially show full image as thumbnail (loaded from `file.url`)
- Automatically generate and upload thumbnail in background
- On next page load, show the cached thumbnail from `thumbnail_url`

- [ ] **Step 7: Test OpenGraph embed**

Paste the `view_url` in Discord or use https://www.opengraph.xyz/ to verify OG tags render correctly.

- [ ] **Step 8: Import `.sxcu` into ShareX**

Double-click `sharex-uploader.sxcu` to import. Take a screenshot with ShareX, verify:
- Upload succeeds
- View URL is copied to clipboard
- Preview page works for the uploaded screenshot
