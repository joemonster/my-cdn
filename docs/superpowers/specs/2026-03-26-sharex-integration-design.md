# ShareX Integration Design

## Goal

Enable ShareX as an image/video upload destination for my-cdn, with two URL options: direct file link and a public preview page.

## Scope

1. Add `view_url` field to upload API response
2. Create public preview page endpoint (`GET /view/{stored_path}`)
3. Server-side thumbnail generation for uploads without client thumbnail
4. Add DB index on `stored_path`
5. Provide ShareX Custom Uploader config file (`.sxcu`)

## Out of Scope

- Authentication for preview page (it's public)
- Panel changes
- Delete URL support in ShareX (can be added later)

---

## 1. New `view_url` Field in API Response

**File:** `apps/api/src/types.ts` — `FileResponse` interface

Add:
```ts
view_url: string;
```

**File:** `apps/api/src/utils/db.ts` — `fileRecordToResponse()`

Add `view_url` to the **base** response object (outside `if (includeDetails)` block):
```ts
view_url: `${cdnBaseUrl}/view/${file.stored_path}`
```

Always present (non-nullable) since every file has a `stored_path`.

---

## 2. Public Preview Page: `GET /view/{YYYYMM}/{hash}.{ext}`

### Routing

**File:** `apps/api/src/index.ts`

Add route pattern before the `/api/` check:
```
path.match(/^\/view\/\d{6}\/[\w-]+\.\w+$/)
```

No authentication required — public page.

Note: regex `[\w-]+` handles the `shx-` prefix (e.g. `/view/202603/shx-a1b2c3d4.png`).

### Handler

**New file:** `apps/api/src/routes/view.ts`

Workflow:
1. Extract `stored_path` from URL (strip `/view/` prefix)
2. Query DB: `getFileByStoredPath(db, storedPath)`
3. If not found → 404 HTML page
4. Render HTML page with file info

Response headers:
- `Content-Type: text/html; charset=utf-8`
- `Cache-Control: public, max-age=3600` (1 hour — file could be deleted)

### DB Changes

**File:** `apps/api/src/utils/db.ts`

New function:
```ts
export async function getFileByStoredPath(
  db: D1Database,
  storedPath: string
): Promise<FileRecord | null>
```

Query: `SELECT * FROM files WHERE stored_path = ? LIMIT 1`

**File:** `apps/api/schema.sql` — add index:
```sql
CREATE INDEX IF NOT EXISTS idx_files_stored_path ON files(stored_path);
```

Also run this as a D1 migration to apply to existing database.

### HTML Page Content

Minimal, self-contained HTML (no external dependencies). Dark theme.

**Head / OpenGraph meta tags:**
- `og:title` — original filename
- `og:site_name` — "My CDN"
- `og:description` — file type and size (e.g. "PNG image — 1.2 MB")
- `og:url` — the view page URL
- `og:type` — `website`
- For images:
  - `og:image` — direct file URL
  - `og:image:width` / `og:image:height` — from DB (omit if null)
  - `twitter:card` — `summary_large_image`
- For videos:
  - `og:video` — direct file URL
  - `og:video:type` — MIME type (e.g. `video/mp4`)
  - `og:video:width` / `og:video:height` — from DB (omit if null)
  - `twitter:card` — `player`
- `<title>` — filename

**Body:**
- Centered layout, max-width container
- Image: `<img>` with direct URL, max-width 100%, rounded corners
- Video: `<video>` with controls, direct URL
- Metadata: original name, file size (human-readable), upload date
- "Open original" link to direct file URL
- Minimal footer: "My CDN"

**Style:**
- Dark background (`#1a1a2e` or similar), light text
- Rounded corners on media, responsive
- No external fonts or CSS frameworks

---

## 3. Server-Side Thumbnail Generation

ShareX does not send a client-generated thumbnail like the panel does. The API should generate thumbnails server-side when the `thumbnail` field is missing from the upload.

**Approach: Cloudflare Image Resizing via `fetch()` with `cf.image` options.**

After uploading the original image to R2, if no `thumbnail` was provided and the file is an image:

1. Fetch the just-uploaded image back from its public CDN URL
2. Apply Cloudflare Image Resizing via `cf.image`:
   ```ts
   const resized = await fetch(`${cdnBaseUrl}/${storedPath}`, {
     cf: {
       image: {
         width: 300,
         height: 300,
         fit: 'inside',
         format: 'jpeg',
         quality: 75,
       },
     },
   });
   ```
3. Upload the resized response body to R2 at the thumbnail path (`{YYYYMM}/{hash}_thumb.jpg`)

**File:** `apps/api/src/routes/upload.ts` — after the existing thumbnail handling block, add an `else if` for server-side generation.

**Requirements:**
- Cloudflare Image Resizing must be enabled (requires custom domain, not `workers.dev`). If not available, thumbnail generation silently skips (same as current behavior when panel doesn't send one).
- Only for images (not videos — video thumbnail extraction is not feasible in Workers).

**Fallback:** If the `cf.image` fetch fails (e.g. Image Resizing not enabled), catch the error and continue without thumbnail. Log a warning.

---

## 4. ShareX Custom Uploader Config

**New file:** `sharex-uploader.sxcu` (repo root, added to `.gitignore`)

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

**Template file (committed):** `sharex-uploader.sxcu.template` — same but with placeholder credentials:
```json
"RequestURL": "https://YOUR_CDN_URL/api/upload",
"Authorization": "Bearer YOUR_API_KEY"
```

**`.gitignore`:** Add `sharex-uploader.sxcu` (actual file with secrets stays local).

---

## 5. Routing Summary (index.ts)

| Pattern | Auth | Handler |
|---------|------|---------|
| `/YYYYMM/hash.ext` | No | File serving (R2) |
| `/view/YYYYMM/hash.ext` | No | **Preview page (new)** |
| `/ai-gen/...` | No | AI gen file serving |
| `/api/*` | Yes (Bearer) | API routes |
| `/panel` | No | Redirect to panel |
| `/` | No | Health check |

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/api/src/types.ts` | Add `view_url` to `FileResponse` |
| `apps/api/src/utils/db.ts` | Add `getFileByStoredPath()`, add `view_url` to `fileRecordToResponse()` |
| `apps/api/src/routes/view.ts` | **New** — preview page handler |
| `apps/api/src/routes/upload.ts` | Add server-side thumbnail generation fallback |
| `apps/api/src/index.ts` | Add `/view/` route |
| `apps/api/schema.sql` | Add index on `stored_path` |
| `sharex-uploader.sxcu` | **New** — ShareX config (gitignored) |
| `sharex-uploader.sxcu.template` | **New** — template with placeholders (committed) |
| `.gitignore` | Add `sharex-uploader.sxcu` |

## Known Limitations

- **No thumbnails for videos from ShareX** — video frame extraction is not feasible in CF Workers. Videos uploaded via ShareX will have `thumbnail_url: null`.
- **`width`/`height` null from ShareX** — the upload endpoint does not extract image dimensions server-side. OG dimension tags will be omitted for ShareX uploads. Panel-uploaded files will have dimensions if the panel sends them.
- **Image Resizing availability** — thumbnail generation requires Cloudflare Image Resizing (custom domain). On `workers.dev` domain, thumbnails will silently not be generated.

## Testing

- Upload a file via API, verify `view_url` is in response
- Upload via API without `thumbnail` field — verify thumbnail is generated server-side (on custom domain)
- Visit `view_url` in browser — see preview page with metadata and OG tags
- Paste `view_url` in Discord — verify OpenGraph embed shows image
- Import `.sxcu` into ShareX, upload screenshot — verify URL copied to clipboard
- Verify `sharex-uploader.sxcu` is gitignored, template is committed
