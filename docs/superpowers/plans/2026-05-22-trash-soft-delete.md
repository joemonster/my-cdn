# Trash / Soft-delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hard-delete with a 14-day soft-delete trash, with restore and force-purge from API and a new `/dashboard/trash` panel page.

**Architecture:** Files in trash get their R2 object moved to a `trash/` prefix and a `deleted_at` timestamp set in D1. The existing public file-serving route stops resolving them (R2 has no object at the original key). A new authenticated `/api/file/:id/content` endpoint proxies bytes for the panel's trash view. Existing daily cron (`0 3 * * *`) gets a second handler that purges trashed rows older than 14 days.

**Tech Stack:** Cloudflare Workers (TypeScript), D1, R2, Next.js 14 (static export), lucide-react icons.

**Repo conventions:** No automated test infra. Verification is manual via `curl`, `wrangler d1 execute`, and browser inspection. Commit after each task — frequent, scoped commits.

**Spec:** `docs/superpowers/specs/2026-05-22-trash-soft-delete-design.md`

---

## File Map

**API — files to create:**
- `apps/api/migrations/001-add-deleted-at.sql` — DB column + index migration
- `apps/api/src/utils/trash.ts` — `cleanupTrash` cron function

**API — files to modify:**
- `apps/api/schema.sql` — add `deleted_at` column + index
- `apps/api/src/types.ts` — `FileRecord.deleted_at`, `FileResponse.deleted_at`, `FilesQueryParams.trash`
- `apps/api/src/utils/storage.ts` — add `moveR2Object`
- `apps/api/src/utils/db.ts` — rename `deleteFile` → `hardDeleteFile`, add `softDeleteFile` + `restoreFile`, modify `getFiles` for trash filter, modify `fileRecordToResponse` to include `deleted_at`
- `apps/api/src/routes/file.ts` — modify `handleDeleteFile` (force flag), add `handleRestoreFile`, add `handleGetFileContent`
- `apps/api/src/routes/files.ts` — parse `?trash=true` query param
- `apps/api/src/index.ts` — route `/restore` and `/content`, extend `scheduled()` with `cleanupTrash`
- `apps/api/src/routes/aigenerate.ts` — update `hardDeleteFile` import (was `deleteFile`)

**Panel — files to create:**
- `apps/panel/src/lib/useAuthBlob.ts` — React hook for authed blob URLs
- `apps/panel/src/components/AuthBlobImage.tsx` — `<img>` wrapper using the hook
- `apps/panel/src/app/dashboard/trash/page.tsx` — new trash page

**Panel — files to modify:**
- `apps/panel/src/lib/api.ts` — `FileData.deleted_at`, `FilesQueryParams.trash`, `deleteFile(id, { force })`, `restoreFile(id)`, `getFileBlobUrl(id, type?)`
- `apps/panel/src/app/dashboard/page.tsx` — trash icon in header
- `apps/panel/src/components/FileTable.tsx` — `trashMode` prop with Restore + Delete-forever per row
- `apps/panel/src/components/FileGrid.tsx` — `trashMode` prop, swap checkbox overlay for action overlay, use `AuthBlobImage`

---

## Phase 1 — API

### Task 1: DB migration

**Files:**
- Create: `apps/api/migrations/001-add-deleted-at.sql`
- Modify: `apps/api/schema.sql`

- [ ] **Step 1: Create migration file**

`apps/api/migrations/001-add-deleted-at.sql`:
```sql
ALTER TABLE files ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at);
```

- [ ] **Step 2: Update source schema for fresh installs**

In `apps/api/schema.sql`, inside the `CREATE TABLE` statement, add the column after `updated_at`. Final table block:
```sql
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    thumbnail_path TEXT,
    bucket TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
);
```

And add the index at the bottom (after the existing indexes):
```sql
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at);
```

- [ ] **Step 3: Apply locally**

From `apps/api`:
```bash
npx wrangler d1 execute my-cdn-db --local --file=migrations/001-add-deleted-at.sql
```
Expected: `Executed 2 commands` (or similar success message).

Verify column exists:
```bash
npx wrangler d1 execute my-cdn-db --local --command "PRAGMA table_info(files);"
```
Expected output includes a row: `... deleted_at | TEXT | 0 | | 0`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations/001-add-deleted-at.sql apps/api/schema.sql
git commit -m "feat(api): add deleted_at column for soft-delete"
```

- [ ] **Step 5: Apply to production (deferred — run after Task 11 deploy works)**

Note: the production migration runs as part of Task 11. Do NOT run `npm run db:migrate` yet — the rest of the API code still expects the old schema until Tasks 2–10 complete.

---

### Task 2: `moveR2Object` storage helper

**Files:**
- Modify: `apps/api/src/utils/storage.ts`

- [ ] **Step 1: Add the function**

Append to `apps/api/src/utils/storage.ts`:
```ts
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
```

R2 has no server-side move; this is read → put → delete. For 5–15 MB files inside a Workers request it's fine.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/utils/storage.ts
git commit -m "feat(api): add moveR2Object helper (copy + delete)"
```

---

### Task 3: DB helpers and types

**Files:**
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/utils/db.ts`
- Modify: `apps/api/src/routes/aigenerate.ts` (import update only — `deleteFile` doesn't exist there, but `getFileById` does. Re-check; only change if a `deleteFile` import surfaces during typecheck.)

- [ ] **Step 1: Add `deleted_at` to `FileRecord` and `FileResponse`**

In `apps/api/src/types.ts`, modify `FileRecord` (currently lines 11–25) — add `deleted_at` before `created_at`:
```ts
export interface FileRecord {
  id: string;
  original_name: string;
  stored_path: string;
  mime_type: string;
  file_size: number;
  file_type: 'image' | 'video';
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnail_path: string | null;
  bucket: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
```

In the same file, modify `FileResponse` — add `deleted_at`:
```ts
export interface FileResponse {
  id: string;
  url: string;
  thumbnail_url: string | null;
  view_url: string;
  original_name: string;
  stored_path?: string;
  mime_type: string;
  file_size: number;
  file_type: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  bucket?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at?: string;
}
```

Also extend `FilesQueryParams` (currently lines 79–86) with an optional `trash` flag:
```ts
export interface FilesQueryParams {
  page: number;
  limit: number;
  sort: SortField;
  order: SortOrder;
  type: FileTypeFilter;
  search?: string;
  trash?: boolean;
}
```

- [ ] **Step 2: Rename `deleteFile` → `hardDeleteFile`, add `softDeleteFile` and `restoreFile`**

In `apps/api/src/utils/db.ts`, replace the existing `deleteFile` function (line 97-99) with:
```ts
export async function hardDeleteFile(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
}

export async function softDeleteFile(
  db: D1Database,
  id: string,
  newStoredPath: string,
  newThumbnailPath: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE files SET stored_path = ?, thumbnail_path = ?, deleted_at = ?, updated_at = ? WHERE id = ?`
    )
    .bind(newStoredPath, newThumbnailPath, now, now, id)
    .run();
}

export async function restoreFile(
  db: D1Database,
  id: string,
  newStoredPath: string,
  newThumbnailPath: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE files SET stored_path = ?, thumbnail_path = ?, deleted_at = NULL, updated_at = ? WHERE id = ?`
    )
    .bind(newStoredPath, newThumbnailPath, now, id)
    .run();
}
```

- [ ] **Step 3: Modify `getFiles` to filter by trash state**

In `apps/api/src/utils/db.ts`, modify `getFiles` (currently starts ~line 101). After the existing `if (type !== 'all')` and `if (search)` blocks (before the `whereClause = ...` line), add:
```ts
  if (params.trash) {
    conditions.push('deleted_at IS NOT NULL');
  } else {
    conditions.push('deleted_at IS NULL');
  }
```

The rest of `getFiles` stays unchanged.

- [ ] **Step 4: Include `deleted_at` in `fileRecordToResponse`**

In `apps/api/src/utils/db.ts`, modify `fileRecordToResponse` — set `deleted_at` on the response (always, since the trash page needs it):
```ts
export function fileRecordToResponse(
  file: FileRecord,
  cdnBaseUrl: string,
  includeDetails = false
): FileResponse {
  const response: FileResponse = {
    id: file.id,
    url: `${cdnBaseUrl}/${file.stored_path}`,
    thumbnail_url: file.thumbnail_path ? `${cdnBaseUrl}/${file.thumbnail_path}` : null,
    view_url: `${cdnBaseUrl}/view/${file.stored_path}`,
    original_name: file.original_name,
    mime_type: file.mime_type,
    file_size: file.file_size,
    file_type: file.file_type,
    bucket: file.bucket,
    deleted_at: file.deleted_at,
    created_at: file.created_at,
  };

  if (includeDetails) {
    response.stored_path = file.stored_path;
    response.width = file.width;
    response.height = file.height;
    response.duration = file.duration;
    response.updated_at = file.updated_at;
  }

  return response;
}
```

- [ ] **Step 5: Verify imports — update any caller still using `deleteFile`**

Run:
```bash
grep -rn "deleteFile" apps/api/src
```
Expected: only references should be inside `apps/api/src/utils/db.ts` (definition `hardDeleteFile`) and `apps/api/src/routes/file.ts` (will be updated in Task 5). If `aigenerate.ts` or any other file imports `deleteFile`, rename to `hardDeleteFile`.

- [ ] **Step 6: Typecheck**

From `apps/api`:
```bash
npx wrangler deploy --dry-run
```
Expected: builds without TS errors. Any `deleteFile is not exported` errors mean Step 5 missed a spot — fix and re-run.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/utils/db.ts
git commit -m "feat(api): add soft-delete / restore DB helpers and trash filter"
```

---

### Task 4: `handleDeleteFile` — force flag and soft-delete path

**Files:**
- Modify: `apps/api/src/routes/file.ts`

- [ ] **Step 1: Update imports**

In `apps/api/src/routes/file.ts`, replace existing imports (lines 1–4):
```ts
import { Env } from '../types';
import { getFileById, updateFile, hardDeleteFile, softDeleteFile, restoreFile, fileRecordToResponse } from '../utils/db';
import { deleteFromR2, uploadToR2, moveR2Object } from '../utils/storage';
import { errorResponse, successResponse } from '../utils/response';
```

- [ ] **Step 2: Replace `handleDeleteFile`**

Replace the existing function (lines 93–121) with:
```ts
export async function handleDeleteFile(
  request: Request,
  env: Env,
  fileId: string
): Promise<Response> {
  try {
    const file = await getFileById(env.DB, fileId);
    if (!file) {
      return errorResponse('File not found', 404);
    }

    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';

    if (force) {
      await deleteFromR2(env.BUCKET, file.stored_path);
      if (file.thumbnail_path) {
        await deleteFromR2(env.BUCKET, file.thumbnail_path);
      }
      await hardDeleteFile(env.DB, fileId);
      return successResponse({ message: 'File deleted permanently' });
    }

    if (file.deleted_at) {
      return errorResponse('Already in trash', 400);
    }

    const newStoredPath = `trash/${file.stored_path}`;
    const newThumbnailPath = file.thumbnail_path ? `trash/${file.thumbnail_path}` : null;

    await moveR2Object(env.BUCKET, file.stored_path, newStoredPath);
    if (file.thumbnail_path && newThumbnailPath) {
      await moveR2Object(env.BUCKET, file.thumbnail_path, newThumbnailPath);
    }
    await softDeleteFile(env.DB, fileId, newStoredPath, newThumbnailPath);

    return successResponse({ message: 'File moved to trash' });
  } catch (error) {
    console.error('Delete file error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npx wrangler deploy --dry-run
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/file.ts
git commit -m "feat(api): soft-delete by default, ?force=true for hard delete"
```

---

### Task 5: `handleRestoreFile` endpoint

**Files:**
- Modify: `apps/api/src/routes/file.ts`

- [ ] **Step 1: Append the handler**

Add to `apps/api/src/routes/file.ts` (after `handleDeleteFile`):
```ts
export async function handleRestoreFile(
  request: Request,
  env: Env,
  fileId: string
): Promise<Response> {
  try {
    const file = await getFileById(env.DB, fileId);
    if (!file) {
      return errorResponse('File not found', 404);
    }
    if (!file.deleted_at) {
      return errorResponse('Not in trash', 400);
    }

    const originalStoredPath = file.stored_path.replace(/^trash\//, '');
    const originalThumbnailPath = file.thumbnail_path
      ? file.thumbnail_path.replace(/^trash\//, '')
      : null;

    await moveR2Object(env.BUCKET, file.stored_path, originalStoredPath);
    if (file.thumbnail_path && originalThumbnailPath) {
      await moveR2Object(env.BUCKET, file.thumbnail_path, originalThumbnailPath);
    }
    await restoreFile(env.DB, fileId, originalStoredPath, originalThumbnailPath);

    return successResponse({ message: 'File restored' });
  } catch (error) {
    console.error('Restore file error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/file.ts
git commit -m "feat(api): handleRestoreFile endpoint"
```

---

### Task 6: `handleGetFileContent` endpoint

**Files:**
- Modify: `apps/api/src/routes/file.ts`

- [ ] **Step 1: Append the handler**

Add to `apps/api/src/routes/file.ts`:
```ts
export async function handleGetFileContent(
  request: Request,
  env: Env,
  fileId: string
): Promise<Response> {
  try {
    const file = await getFileById(env.DB, fileId);
    if (!file) {
      return errorResponse('File not found', 404);
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const path = type === 'thumbnail' ? file.thumbnail_path : file.stored_path;
    if (!path) {
      return errorResponse('Thumbnail not available', 404);
    }

    const obj = await env.BUCKET.get(path);
    if (!obj) {
      return errorResponse('Object not found in storage', 404);
    }

    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || file.mime_type || 'application/octet-stream',
        'Content-Length': obj.size.toString(),
        'Cache-Control': 'private, no-store',
        'ETag': obj.etag,
      },
    });
  } catch (error) {
    console.error('Get file content error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/file.ts
git commit -m "feat(api): authenticated /api/file/:id/content endpoint"
```

---

### Task 7: `handleGetFiles` — parse `?trash=true`

**Files:**
- Modify: `apps/api/src/routes/files.ts`

- [ ] **Step 1: Parse the param**

In `apps/api/src/routes/files.ts`, modify `parseQueryParams` (currently lines 32–61). At the end, before `return { page, limit, sort, order, type, search };`, add:
```ts
  const trash = searchParams.get('trash') === 'true';
```
And change the return statement to:
```ts
  return { page, limit, sort, order, type, search, trash };
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npx wrangler deploy --dry-run
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/files.ts
git commit -m "feat(api): GET /api/files accepts ?trash=true"
```

---

### Task 8: Add `/restore` and `/content` routes in `index.ts`

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Update imports**

In `apps/api/src/index.ts` line 6, replace:
```ts
import { handleGetFile, handleUpdateFile, handleDeleteFile } from './routes/file';
```
with:
```ts
import { handleGetFile, handleUpdateFile, handleDeleteFile, handleRestoreFile, handleGetFileContent } from './routes/file';
```

- [ ] **Step 2: Add the two route matches before the existing fileMatch**

In `apps/api/src/index.ts`, locate the existing `fileMatch` block (around lines 139–150):
```ts
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
```

Immediately BEFORE that block, insert:
```ts
  const restoreMatch = path.match(/^\/api\/file\/([a-f0-9-]+)\/restore$/i);
  if (restoreMatch && request.method === 'POST') {
    return handleRestoreFile(request, env, restoreMatch[1]);
  }

  const contentMatch = path.match(/^\/api\/file\/([a-f0-9-]+)\/content$/i);
  if (contentMatch && request.method === 'GET') {
    return handleGetFileContent(request, env, contentMatch[1]);
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npx wrangler deploy --dry-run
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): route /restore and /content endpoints"
```

---

### Task 9: Cron `cleanupTrash`

**Files:**
- Create: `apps/api/src/utils/trash.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create the cleanup function**

`apps/api/src/utils/trash.ts`:
```ts
import { Env } from '../types';

const RETENTION_DAYS = 14;

export async function cleanupTrash(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400 * 1000).toISOString();
  const expired = await env.DB
    .prepare('SELECT id, stored_path, thumbnail_path FROM files WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .bind(cutoff)
    .all<{ id: string; stored_path: string; thumbnail_path: string | null }>();

  const rows = expired.results || [];
  let purged = 0;

  for (const row of rows) {
    try {
      await env.BUCKET.delete(row.stored_path);
      if (row.thumbnail_path) {
        await env.BUCKET.delete(row.thumbnail_path);
      }
      await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(row.id).run();
      purged++;
    } catch (err) {
      console.error(`Failed to purge ${row.id}:`, err);
    }
  }

  console.log(`Trash cleanup: purged ${purged}/${rows.length} expired files`);
}
```

- [ ] **Step 2: Wire it into `scheduled`**

In `apps/api/src/index.ts` around line 8, add to imports:
```ts
import { cleanupTrash } from './utils/trash';
```

And replace the `scheduled` handler (currently lines 20–22):
```ts
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(Promise.all([
      cleanupExpiredImages(env),
      cleanupTrash(env),
    ]).then(() => undefined));
  },
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npx wrangler deploy --dry-run
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/utils/trash.ts apps/api/src/index.ts
git commit -m "feat(api): cron purges trashed files older than 14 days"
```

---

### Task 10: Deploy API + smoke test

**Files:** (none modified)

- [ ] **Step 1: Apply migration to production**

From `apps/api`:
```bash
npx wrangler d1 execute my-cdn-db --remote --file=migrations/001-add-deleted-at.sql
```
Expected: success.

Verify column:
```bash
npx wrangler d1 execute my-cdn-db --remote --command "PRAGMA table_info(files);"
```
Expected: includes `deleted_at | TEXT` row.

- [ ] **Step 2: Deploy worker**

From repo root:
```bash
npm run deploy:api
```
Expected: `Deployed my-cdn-api triggers` and a `Current Version ID`.

- [ ] **Step 3: Smoke test — upload, soft-delete, verify**

Pick any existing file's id from the dashboard, or upload a fresh one. Substitute `$ID` and `$KEY` (API_KEY from wrangler.jsonc — `22d-49f5-af40-c98`).

Soft-delete:
```bash
curl -X DELETE "https://my-cdn-api.literalnie.workers.dev/api/file/$ID" \
  -H "Authorization: Bearer $KEY"
```
Expected: `{"success":true,"message":"File moved to trash"}`.

Verify direct URL 404:
```bash
curl -I "https://my-cdn-api.literalnie.workers.dev/<original-stored-path>"
```
Expected: `HTTP/2 404`.

List trash:
```bash
curl "https://my-cdn-api.literalnie.workers.dev/api/files?trash=true" \
  -H "Authorization: Bearer $KEY" | head -c 500
```
Expected: file appears with `deleted_at` set and `stored_path` starting with `trash/`.

Verify main list excludes it:
```bash
curl "https://my-cdn-api.literalnie.workers.dev/api/files" \
  -H "Authorization: Bearer $KEY" | grep -c "$ID"
```
Expected: `0`.

- [ ] **Step 4: Smoke test — restore**

```bash
curl -X POST "https://my-cdn-api.literalnie.workers.dev/api/file/$ID/restore" \
  -H "Authorization: Bearer $KEY"
```
Expected: `{"success":true,"message":"File restored"}`.

Verify original URL works again:
```bash
curl -I "https://my-cdn-api.literalnie.workers.dev/<original-stored-path>"
```
Expected: `HTTP/2 200`.

- [ ] **Step 5: Smoke test — force delete**

```bash
curl -X DELETE "https://my-cdn-api.literalnie.workers.dev/api/file/$ID?force=true" \
  -H "Authorization: Bearer $KEY"
```
Expected: `{"success":true,"message":"File deleted permanently"}`.

Verify gone from both lists:
```bash
curl "https://my-cdn-api.literalnie.workers.dev/api/file/$ID" \
  -H "Authorization: Bearer $KEY"
```
Expected: `{"success":false,"error":"File not found"}`.

- [ ] **Step 6: Smoke test — content endpoint (auth proxy)**

Upload a file, soft-delete it, then:
```bash
curl -I "https://my-cdn-api.literalnie.workers.dev/api/file/$ID/content" \
  -H "Authorization: Bearer $KEY"
```
Expected: `HTTP/2 200` with appropriate `Content-Type`. (Authed access to trashed file's bytes.)

Without auth:
```bash
curl -I "https://my-cdn-api.literalnie.workers.dev/api/file/$ID/content"
```
Expected: `HTTP/2 401`.

- [ ] **Step 7: No commit required (deployment task)**

If any of the smoke tests fail, do NOT proceed to Phase 2. Debug and re-deploy.

---

## Phase 2 — Panel

### Task 11: API client updates

**Files:**
- Modify: `apps/panel/src/lib/api.ts`

- [ ] **Step 1: Extend `FileData` and `FilesQueryParams`**

In `apps/panel/src/lib/api.ts`, modify `FileData` (currently lines 3–18) — add `deleted_at`:
```ts
export interface FileData {
  id: string;
  url: string;
  thumbnail_url: string | null;
  original_name: string;
  stored_path?: string;
  mime_type: string;
  file_size: number;
  file_type: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  bucket?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at?: string;
}
```

Modify `FilesQueryParams` (lines 63–70) — add `trash`:
```ts
export interface FilesQueryParams {
  page?: number;
  limit?: number;
  sort?: SortField;
  order?: SortOrder;
  type?: FileTypeFilter;
  search?: string;
  trash?: boolean;
}
```

- [ ] **Step 2: Pass `trash` through `getFiles`**

In `apps/panel/src/lib/api.ts`, modify the body of `getFiles` (lines 148–162). Add inside the `if (params.search)` line area:
```ts
    if (params.trash) searchParams.set('trash', 'true');
```
The full `getFiles` becomes:
```ts
  async getFiles(params: FilesQueryParams = {}): Promise<FilesResponse> {
    const searchParams = new URLSearchParams();

    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.order) searchParams.set('order', params.order);
    if (params.type) searchParams.set('type', params.type);
    if (params.search) searchParams.set('search', params.search);
    if (params.trash) searchParams.set('trash', 'true');

    const queryString = searchParams.toString();
    const endpoint = `/api/files${queryString ? `?${queryString}` : ''}`;

    return this.request<FilesResponse>(endpoint);
  }
```

- [ ] **Step 3: Accept `force` in `deleteFile`**

Replace `deleteFile` (lines 182–186):
```ts
  async deleteFile(id: string, opts?: { force?: boolean }): Promise<DeleteResponse> {
    const query = opts?.force ? '?force=true' : '';
    return this.request<DeleteResponse>(`/api/file/${id}${query}`, {
      method: 'DELETE',
    });
  }
```

- [ ] **Step 4: Add `restoreFile`**

After `deleteFile`, add:
```ts
  async restoreFile(id: string): Promise<DeleteResponse> {
    return this.request<DeleteResponse>(`/api/file/${id}/restore`, {
      method: 'POST',
    });
  }
```

- [ ] **Step 5: Add `getFileBlobUrl`**

After `restoreFile`, add:
```ts
  async getFileBlobUrl(id: string, type?: 'thumbnail'): Promise<string> {
    const token = this.getToken();
    const url = `${API_URL}/api/file/${id}/content${type ? `?type=${type}` : ''}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch content (HTTP ${res.status})`);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }
```

- [ ] **Step 6: Typecheck**

From `apps/panel`:
```bash
npx tsc --noEmit
```
Expected: no errors. (If `tsc` complains about missing config, instead run `npm run lint --workspace=apps/panel` and check for type errors there.)

- [ ] **Step 7: Commit**

```bash
git add apps/panel/src/lib/api.ts
git commit -m "feat(panel): API client supports trash, restore, force-delete, blob content"
```

---

### Task 12: `useAuthBlob` hook + `AuthBlobImage` component

**Files:**
- Create: `apps/panel/src/lib/useAuthBlob.ts`
- Create: `apps/panel/src/components/AuthBlobImage.tsx`

- [ ] **Step 1: Create the hook**

`apps/panel/src/lib/useAuthBlob.ts`:
```ts
'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

export function useAuthBlob(id: string | null, type?: 'thumbnail'): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    api.getFileBlobUrl(id, type)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => {
        // Silent failure — caller renders a placeholder when url is null
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, type]);

  return url;
}
```

- [ ] **Step 2: Create the component**

`apps/panel/src/components/AuthBlobImage.tsx`:
```tsx
'use client';

import { useAuthBlob } from '@/lib/useAuthBlob';

interface AuthBlobImageProps {
  id: string;
  type?: 'thumbnail';
  alt?: string;
  className?: string;
}

export function AuthBlobImage({ id, type, alt, className }: AuthBlobImageProps) {
  const url = useAuthBlob(id, type);

  if (!url) {
    return <div className={`${className ?? ''} bg-dark-700 animate-pulse`} />;
  }

  return <img src={url} alt={alt ?? ''} loading="lazy" className={className} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/panel/src/lib/useAuthBlob.ts apps/panel/src/components/AuthBlobImage.tsx
git commit -m "feat(panel): useAuthBlob hook + AuthBlobImage component"
```

---

### Task 13: Trash icon in dashboard header

**Files:**
- Modify: `apps/panel/src/app/dashboard/page.tsx`

- [ ] **Step 1: Add `Trash2` to imports**

In `apps/panel/src/app/dashboard/page.tsx` lines 5–18, find the lucide-react import and add `Trash2`:
```ts
import {
  Upload,
  Search,
  RefreshCw,
  LogOut,
  CloudUpload,
  ImageIcon,
  Video,
  Layers,
  List,
  Grid3X3,
  Loader2,
  HelpCircle,
  Trash2,
} from 'lucide-react';
```

- [ ] **Step 2: Add the icon link in the actions row**

Locate the `{/* Actions */}` div (around line 312–338). Between the `HelpCircle` button (`onClick={() => setShowApiDocs(true)}`) and the `LogOut` button, insert:
```tsx
              <a
                href="/dashboard/trash"
                className="p-2 rounded-lg bg-dark-600 hover:bg-red-500/20 hover:text-red-400
                         transition-colors"
                title="Trash"
              >
                <Trash2 className="w-5 h-5" />
              </a>
```

- [ ] **Step 3: Commit**

```bash
git add apps/panel/src/app/dashboard/page.tsx
git commit -m "feat(panel): trash icon link in dashboard header"
```

---

### Task 14: `FileTable` — `trashMode` prop

**Files:**
- Modify: `apps/panel/src/components/FileTable.tsx`

- [ ] **Step 1: Update imports**

At top of `apps/panel/src/components/FileTable.tsx`, modify the lucide import to add `Undo2`:
```ts
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Edit2,
  Trash2,
  Eye,
  Check,
  X,
  FileImage,
  FileVideo,
  MoreVertical,
  Undo2,
} from 'lucide-react';
```

And add `AuthBlobImage` import:
```ts
import { AuthBlobImage } from './AuthBlobImage';
```

- [ ] **Step 2: Add `trashMode` to props**

Modify the `FileTableProps` interface to add `trashMode?: boolean` and `onRestore?: (id: string) => Promise<void> | void`:
```ts
interface FileTableProps {
  files: FileData[];
  loading: boolean;
  sort: SortField;
  order: SortOrder;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
  onSort: (field: SortField) => void;
  onPreview: (file: FileData) => void;
  onRefresh: () => void;
  trashMode?: boolean;
  onRestore?: (id: string) => Promise<void> | void;
}
```

Add to component destructuring:
```ts
export function FileTable({
  files,
  loading,
  sort,
  order,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  allSelected,
  onSort,
  onPreview,
  onRefresh,
  trashMode = false,
  onRestore,
}: FileTableProps) {
```

- [ ] **Step 3: Add restore + force-delete handlers**

Inside the component, after the existing `handleDelete` function, add:
```ts
  const handleRestore = async (id: string) => {
    if (!onRestore) return;
    try {
      await onRestore(id);
      toast.success('File restored');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restore');
    }
  };

  const handleDeleteForever = async (id: string) => {
    if (!confirm('Delete this file permanently? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await api.deleteFile(id, { force: true });
      toast.success('File deleted permanently');
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };
```

- [ ] **Step 4: Swap thumbnail rendering when in trashMode**

In the "Preview Thumbnail" cell (currently around lines 205–262), replace the existing `<img>` / fallback logic with a conditional:
```tsx
            {/* Preview Thumbnail */}
            <div
              onClick={() => onPreview(file)}
              className="w-16 h-12 rounded bg-dark-600 overflow-hidden cursor-pointer
                        hover:ring-2 hover:ring-neon-cyan/50 transition-all"
            >
              {trashMode ? (
                file.file_type === 'image' || file.thumbnail_url ? (
                  <AuthBlobImage
                    id={file.id}
                    type={file.thumbnail_url ? 'thumbnail' : undefined}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileVideo className="w-6 h-6 text-neon-purple" />
                  </div>
                )
              ) : file.thumbnail_url ? (
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
            </div>
```

- [ ] **Step 5: Swap per-row actions when in trashMode**

Replace the entire "Actions" cell (currently lines 338–417) with a conditional:
```tsx
            {/* Actions */}
            <div className="flex items-center gap-1 relative">
              {trashMode ? (
                <>
                  <button
                    onClick={() => handleRestore(file.id)}
                    className="p-2 rounded hover:bg-neon-cyan/10 transition-colors"
                    title="Restore"
                  >
                    <Undo2 className="w-4 h-4 text-neon-cyan" />
                  </button>
                  <button
                    onClick={() => handleDeleteForever(file.id)}
                    disabled={deletingId === file.id}
                    className="p-2 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Delete forever"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onPreview(file)}
                    className="p-2 rounded hover:bg-dark-500 transition-colors md:hidden"
                    title="Preview"
                  >
                    <Eye className="w-4 h-4 text-gray-400" />
                  </button>
                  <button
                    onClick={() => handleCopyLink(file.url)}
                    className="p-2 rounded hover:bg-dark-500 transition-colors"
                    title="Copy link"
                  >
                    <Copy className="w-4 h-4 text-gray-400 hover:text-neon-cyan" />
                  </button>

                  {/* Actions Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setActionMenuId(actionMenuId === file.id ? null : file.id)}
                      className="p-2 rounded hover:bg-dark-500 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>

                    {actionMenuId === file.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setActionMenuId(null)}
                        />
                        <div className="absolute right-0 bottom-full mb-1 z-20 bg-dark-700 border border-dark-500
                                      rounded-lg shadow-lg py-1 min-w-[140px]">
                          <button
                            onClick={() => {
                              onPreview(file);
                              setActionMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-dark-600
                                     flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" /> Preview
                          </button>
                          <button
                            onClick={() => handleStartEdit(file)}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-dark-600
                                     flex items-center gap-2"
                          >
                            <Edit2 className="w-4 h-4" /> Rename
                          </button>
                          <button
                            onClick={() => {
                              handleCopyLink(file.url);
                              setActionMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-dark-600
                                     flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" /> Copy link
                          </button>
                          <hr className="my-1 border-dark-500" />
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this file?')) {
                                handleDelete(file.id);
                              }
                              setActionMenuId(null);
                            }}
                            disabled={deletingId === file.id}
                            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10
                                     flex items-center gap-2 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            {deletingId === file.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
```

- [ ] **Step 6: Hide the checkbox column in trashMode**

In the header row (around lines 166–184), wrap the first checkbox cell in a conditional. Actually simpler — leave checkboxes visible, they're harmless (selectedIds stays empty when caller doesn't pass selection handlers). Skip this step. *Rationale:* trash page can pass empty Set + no-op handlers; bulk UI on dashboard only renders when `selectedIds.size > 0`, which won't happen here.

- [ ] **Step 7: Commit**

```bash
git add apps/panel/src/components/FileTable.tsx
git commit -m "feat(panel): FileTable trashMode with Restore + Delete-forever"
```

---

### Task 15: `FileGrid` — `trashMode` prop

**Files:**
- Modify: `apps/panel/src/components/FileGrid.tsx`

- [ ] **Step 1: Update imports**

Replace the top of `apps/panel/src/components/FileGrid.tsx`:
```tsx
'use client';

import { FileVideo, Undo2, Trash2 } from 'lucide-react';
import { FileData, api } from '@/lib/api';
import { AuthBlobImage } from './AuthBlobImage';
import toast from 'react-hot-toast';
import { useState } from 'react';
```

- [ ] **Step 2: Add `trashMode` and `onRestore` to props**

Modify `FileGridProps`:
```ts
interface FileGridProps {
  files: FileData[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
  onPreview: (file: FileData) => void;
  onRefresh: () => void;
  trashMode?: boolean;
  onRestore?: (id: string) => Promise<void> | void;
}
```

Update destructuring:
```tsx
export function FileGrid({
  files,
  loading,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  allSelected,
  onPreview,
  onRefresh,
  trashMode = false,
  onRestore,
}: FileGridProps) {
```

- [ ] **Step 3: Add handlers inside the component**

Right after the destructuring, before `if (loading) {`, add:
```tsx
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleRestore = async (id: string) => {
    if (!onRestore) return;
    try {
      await onRestore(id);
      toast.success('File restored');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restore');
    }
  };

  const handleDeleteForever = async (id: string) => {
    if (!confirm('Delete this file permanently? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await api.deleteFile(id, { force: true });
      toast.success('File deleted permanently');
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };
```

- [ ] **Step 4: Hide "Select all" header in trashMode**

Wrap the "Select all" header block (currently lines 59–68):
```tsx
      {!trashMode && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            className="w-4 h-4 rounded border-dark-500 bg-dark-600 text-neon-cyan
                       focus:ring-neon-cyan/30 focus:ring-offset-0 cursor-pointer accent-[#00FFD1]"
          />
          <span className="text-xs text-gray-500 uppercase tracking-wide">Select all</span>
        </div>
      )}
```

- [ ] **Step 5: Swap thumbnail + overlay in trashMode**

Replace the per-file block (currently lines 71–157) with a version that branches on trashMode. Full new block:
```tsx
        {files.map((file) => (
          <div key={file.id} className="group">
            <div
              className={`relative aspect-[4/3] rounded-xl overflow-hidden bg-dark-700 cursor-pointer
                         border-2 transition-all ${
                           !trashMode && selectedIds.has(file.id)
                             ? 'border-neon-cyan'
                             : 'border-transparent hover:border-dark-500'
                         }`}
              onClick={() => onPreview(file)}
            >
              {trashMode ? (
                file.file_type === 'image' || file.thumbnail_url ? (
                  <AuthBlobImage
                    id={file.id}
                    type={file.thumbnail_url ? 'thumbnail' : undefined}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileVideo className="w-12 h-12 text-neon-purple" />
                  </div>
                )
              ) : file.thumbnail_url ? (
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
                      // Silently fail
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FileVideo className="w-12 h-12 text-neon-purple" />
                </div>
              )}

              {trashMode ? (
                <div
                  className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleRestore(file.id)}
                    className="p-1.5 rounded bg-dark-900/80 hover:bg-neon-cyan/20 transition-colors"
                    title="Restore"
                  >
                    <Undo2 className="w-4 h-4 text-neon-cyan" />
                  </button>
                  <button
                    onClick={() => handleDeleteForever(file.id)}
                    disabled={deletingId === file.id}
                    className="p-1.5 rounded bg-dark-900/80 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    title="Delete forever"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ) : (
                <div
                  className={`absolute top-2 left-2 transition-opacity duration-150 ${
                    selectedIds.size > 0
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(file.id);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(file.id)}
                    onChange={() => {}}
                    className="w-5 h-5 rounded border-dark-400 bg-dark-800/80 text-neon-cyan
                               focus:ring-0 cursor-pointer accent-[#00FFD1]"
                  />
                </div>
              )}
            </div>

            <p className="mt-1.5 text-xs font-mono text-gray-500 text-center">
              {formatDateShort(file.created_at)}
            </p>
          </div>
        ))}
```

- [ ] **Step 6: Commit**

```bash
git add apps/panel/src/components/FileGrid.tsx
git commit -m "feat(panel): FileGrid trashMode with hover-action overlay"
```

---

### Task 16: `/dashboard/trash` page

**Files:**
- Create: `apps/panel/src/app/dashboard/trash/page.tsx`

- [ ] **Step 1: Write the page**

`apps/panel/src/app/dashboard/trash/page.tsx`:
```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, List, Grid3X3, RefreshCw, Loader2, Trash2 } from 'lucide-react';
import { api, FileData, PaginationInfo } from '@/lib/api';
import { FileTable } from '@/components/FileTable';
import { FileGrid } from '@/components/FileGrid';
import { Pagination } from '@/components/Pagination';
import toast from 'react-hot-toast';

export default function TrashPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('cdn_view_mode') as 'list' | 'grid') || 'list';
    }
    return 'list';
  });

  useEffect(() => {
    if (!api.isAuthenticated()) {
      router.replace('/');
    } else {
      setCheckingAuth(false);
    }
  }, [router]);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getFiles({
        page: pagination.page,
        limit: pagination.limit,
        sort: 'created_at',
        order: 'desc',
        trash: true,
      });
      if (response.success) {
        setFiles(response.files);
        setPagination(response.pagination);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load trash');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

  useEffect(() => {
    if (!checkingAuth) fetchFiles();
  }, [fetchFiles, checkingAuth]);

  useEffect(() => {
    localStorage.setItem('cdn_view_mode', viewMode);
  }, [viewMode]);

  const handleRestore = useCallback(async (id: string) => {
    await api.restoreFile(id);
    fetchFiles();
  }, [fetchFiles]);

  const handlePageChange = (page: number) => {
    setPagination((p) => ({ ...p, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <header className="sticky top-0 z-40 bg-dark-800/80 backdrop-blur-lg border-b border-dark-600">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <a
              href="/dashboard"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-dark-600 to-dark-700
                             border border-dark-500 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Trash</h1>
                <p className="text-xs text-gray-500 font-mono">Auto-purged after 14 days</p>
              </div>
            </a>

            <div className="flex items-center gap-2">
              <a
                href="/dashboard"
                className="flex items-center gap-2 p-2 rounded-lg bg-dark-600
                         hover:bg-neon-cyan/20 hover:text-neon-cyan transition-colors"
                title="Back to dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </a>
              <div className="flex items-center bg-dark-700 rounded-xl border border-dark-600 p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'list' ? 'bg-dark-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'grid' ? 'bg-dark-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Grid view"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={fetchFiles}
                disabled={loading}
                className="p-2.5 rounded-xl bg-dark-700 border border-dark-600 text-gray-400
                         hover:text-neon-cyan hover:border-neon-cyan/30 transition-all duration-200
                         disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 text-sm">
          <span className="text-gray-500">
            <span className="text-white font-mono">{pagination.total}</span> file{pagination.total === 1 ? '' : 's'} in trash
          </span>
        </div>

        {viewMode === 'list' ? (
          <FileTable
            files={files}
            loading={loading}
            sort="created_at"
            order="desc"
            selectedIds={new Set()}
            onToggleSelect={() => {}}
            onSelectAll={() => {}}
            allSelected={false}
            onSort={() => {}}
            onPreview={() => {}}
            onRefresh={fetchFiles}
            trashMode
            onRestore={handleRestore}
          />
        ) : (
          <FileGrid
            files={files}
            loading={loading}
            selectedIds={new Set()}
            onToggleSelect={() => {}}
            onSelectAll={() => {}}
            allSelected={false}
            onPreview={() => {}}
            onRefresh={fetchFiles}
            trashMode
            onRestore={handleRestore}
          />
        )}

        {pagination.total_pages > 1 && (
          <div className="mt-6">
            <Pagination
              page={pagination.page}
              totalPages={pagination.total_pages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify Next.js picks up the new route**

From `apps/panel`:
```bash
npm run build
```
Expected output includes a line like `├ ○ /dashboard/trash` in the route table.

- [ ] **Step 3: Commit**

```bash
git add apps/panel/src/app/dashboard/trash/page.tsx
git commit -m "feat(panel): /dashboard/trash page with restore + delete-forever"
```

---

### Task 17: Build, deploy, end-to-end manual test

**Files:** (none modified)

- [ ] **Step 1: Build panel**

From repo root:
```bash
npm run build:panel
```
Expected: success, no TS errors, `/dashboard/trash` listed in route output.

- [ ] **Step 2: Deploy panel**

```bash
npm run deploy:panel
```
Expected: `Deployment complete!` with a `*.pages.dev` URL.

- [ ] **Step 3: E2E test — soft delete via panel**

In the deployed panel:
1. Log in.
2. Upload a small image.
3. Delete it via the actions menu.
4. Verify it disappears from the main list.
5. Click the new Trash icon in the header.
6. Verify the file appears in the trash list, with a thumbnail.
7. Verify the direct URL (right-click → copy from the network tab if needed, or compute from old known path) returns 404 in a new tab.

- [ ] **Step 4: E2E test — restore**

In the trash view:
1. Click the Restore (Undo2) button on the file.
2. Verify the toast says "File restored".
3. Navigate back to `/dashboard`.
4. Verify the file is back in the main list with a working thumbnail and direct URL.

- [ ] **Step 5: E2E test — delete forever**

1. Soft-delete the file again from `/dashboard`.
2. Open `/dashboard/trash`.
3. Click Delete forever (Trash2).
4. Accept the confirm dialog.
5. Verify the toast says "File deleted permanently" and the file disappears.
6. Verify the file is also gone from `/dashboard`.

- [ ] **Step 6: E2E test — bulk delete still works**

1. Upload 2–3 files.
2. Select all via the dashboard's bulk-select.
3. Click bulk delete.
4. Verify all files move to trash (visible in `/dashboard/trash`).

- [ ] **Step 7: Cron sanity check (optional but recommended)**

To verify the cron path without waiting 14 days, manually mark a file as old:
```bash
cd apps/api
ID=<some-trashed-file-id>
npx wrangler d1 execute my-cdn-db --remote --command "UPDATE files SET deleted_at = '2026-04-01T00:00:00.000Z' WHERE id = '$ID';"
```

Then trigger the scheduled handler:
```bash
curl -X POST "https://my-cdn-api.literalnie.workers.dev/__scheduled?cron=0+3+*+*+*"
```
(If that endpoint isn't enabled, wait for the next 03:00 UTC tick or skip this step.)

Verify the row and R2 objects are gone:
```bash
npx wrangler d1 execute my-cdn-db --remote --command "SELECT id FROM files WHERE id = '$ID';"
```
Expected: empty result.

- [ ] **Step 8: No commit (deployment task). Done.**

---

## Self-review checklist (run after writing this plan)

- Spec sections covered:
  - DB migration → Task 1 ✓
  - R2 path scheme + moveR2Object → Tasks 2, 4, 5 ✓
  - `DELETE ?force=true` → Task 4 ✓
  - `POST /restore` → Tasks 5, 8 ✓
  - `GET /content` → Tasks 6, 8 ✓
  - `GET /files?trash=true` → Tasks 3, 7 ✓
  - Cron extension → Task 9 ✓
  - Trash icon in header → Task 13 ✓
  - `/dashboard/trash` page → Task 16 ✓
  - `useAuthBlob` + `AuthBlobImage` → Task 12 ✓
  - FileTable / FileGrid trashMode → Tasks 14, 15 ✓
  - API client (deleteFile force, restoreFile, getFileBlobUrl, trash param) → Task 11 ✓
- Placeholder scan: no TBD/TODO/handle-edge-cases left in plan.
- Type consistency: `softDeleteFile` / `restoreFile` / `hardDeleteFile` named consistently between Task 3 definitions and Task 4–5 callers. `trashMode` / `onRestore` props consistent between Tasks 14/15 (component) and Task 16 (caller).

---

## Execution

**Plan complete and saved to `docs/superpowers/plans/2026-05-22-trash-soft-delete.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — I execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach?**
