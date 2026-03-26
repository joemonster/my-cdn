# ShareX Integration Design

## Goal

Enable ShareX as an image/video upload destination for my-cdn, with two URL options: direct file link and a public preview page.

## Scope

1. Add `view_url` field to upload API response
2. Create public preview page endpoint (`GET /view/{stored_path}`)
3. Provide ShareX Custom Uploader config file (`.sxcu`)

## Out of Scope

- Authentication for preview page (it's public)
- Panel changes
- Delete URL support in ShareX (can be added later)

---

## 1. New `view_url` Field in API Response

**File:** `apps/api/src/utils/db.ts` — `fileRecordToResponse()`

Add `view_url` to `FileResponse` type and to the response builder:

```ts
view_url: `${cdnBaseUrl}/view/${file.stored_path}`
```

**File:** `apps/api/src/types.ts` — `FileResponse` interface

Add:
```ts
view_url: string;
```

This field is always present (non-nullable) since every file has a `stored_path`.

---

## 2. Public Preview Page: `GET /view/{YYYYMM}/{hash}.{ext}`

### Routing

**File:** `apps/api/src/index.ts`

Add route pattern before the `/api/` check:
```
path.match(/^\/view\/\d{6}\/[\w-]+\.\w+$/)
```

No authentication required — this is a public page.

### Handler

**New file:** `apps/api/src/routes/view.ts`

Workflow:
1. Extract `stored_path` from URL (strip `/view/` prefix)
2. Query DB: `getFileByStoredPath(db, storedPath)` — new function in `db.ts`
3. If not found → 404 HTML page
4. Render HTML page with file info

### DB Function

**File:** `apps/api/src/utils/db.ts`

New function:
```ts
export async function getFileByStoredPath(
  db: D1Database,
  storedPath: string
): Promise<FileRecord | null>
```

Query: `SELECT * FROM files WHERE stored_path = ?`

### HTML Page Content

Minimal, self-contained HTML (no external dependencies). Dark theme.

**Head:**
- OpenGraph meta tags for rich embeds (Discord, Slack, Twitter/X):
  - `og:title` — original filename
  - `og:image` — direct file URL (for images)
  - `og:video` — direct file URL (for videos)
  - `og:type` — `website`
  - `og:url` — the view page URL
  - `twitter:card` — `summary_large_image`
- Proper `<title>` with filename

**Body:**
- Centered layout, max-width container
- Image: `<img>` tag with direct URL, max-width 100%
- Video: `<video>` tag with controls, direct URL
- Metadata below: original name, file size (human-readable), upload date
- "Open original" link to direct file URL
- Minimal footer with CDN name

**Style:**
- Dark background (`#1a1a2e` or similar)
- Light text
- Rounded corners on media
- No external fonts or CSS frameworks
- Responsive

---

## 3. ShareX Custom Uploader Config

**New file:** `sharex-uploader.sxcu` (repo root)

```json
{
  "Version": "16.1.0",
  "Name": "My CDN",
  "DestinationType": "ImageUploader, FileUploader",
  "RequestMethod": "POST",
  "RequestURL": "https://YOUR_API_URL/api/upload",
  "Headers": {
    "Authorization": "Bearer YOUR_API_KEY"
  },
  "Body": "MultipartFormData",
  "FileFormName": "file",
  "URL": "$json:file.view_url$",
  "ThumbnailURL": "$json:file.thumbnail_url$",
  "DeletionURL": "",
  "ErrorMessage": "$json:error$"
}
```

User replaces `YOUR_API_URL` and `YOUR_API_KEY` with their values. Double-clicking the `.sxcu` file imports it into ShareX.

---

## 4. Routing Summary (index.ts)

Current routes + new route:

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
| `apps/api/src/index.ts` | Add `/view/` route |
| `sharex-uploader.sxcu` | **New** — ShareX config file |

## Testing

- Upload a file via API, verify `view_url` is in response
- Visit `view_url` in browser — see preview page with metadata
- Paste `view_url` in Discord — verify OpenGraph embed shows image
- Import `.sxcu` into ShareX, upload screenshot — verify URL copied to clipboard
