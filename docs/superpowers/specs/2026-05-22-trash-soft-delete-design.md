# Trash / Soft-delete with 14-day retention

**Date:** 2026-05-22
**Status:** Design approved, pending implementation plan

## Summary

Replace hard-delete with soft-delete that moves files to a trash area for 14 days before the cron purges them. Both the API endpoint (`DELETE /api/file/:id`) and the panel UI move files to trash by default; a `?force=true` flag still allows immediate hard delete. The panel gets a new `/dashboard/trash` page with restore and delete-forever actions, accessed via an icon in the header (no label).

## Goals

- Deletion is recoverable for 14 days (mistakes happen).
- Direct public URLs of trashed files stop working immediately (no public access by guessable hash).
- Existing daily cron (`0 3 * * *`) handles automatic purging.
- API and panel behave consistently: both soft-delete by default.

## Non-goals

- No bulk restore / bulk delete-forever (single-item actions only in trash view).
- No "Empty trash" button.
- No search/filter/sort UI in trash view (kosz expected to be small).
- No retention configurability — 14 days is hard-coded.

## Architecture

### Storage layout

| State | DB `stored_path` | R2 key | Direct URL `/YYYYMM/hash.ext` |
|---|---|---|---|
| Live | `YYYYMM/hash.ext` | `YYYYMM/hash.ext` | 200, served from R2 |
| Trashed | `trash/YYYYMM/hash.ext` | `trash/YYYYMM/hash.ext` | 404 (no R2 object at original key) |

`stored_path` always reflects the current R2 location. Soft-delete prepends `trash/`; restore strips it. Thumbnail follows the same rule via `thumbnail_path`.

The existing file-serving route `/YYYYMM/hash.ext` (regex `^\/\d{6}\/[\w-]+\.\w+$`) doesn't match `/trash/...`, so trashed files are not publicly servable even if someone guesses the trash prefix.

### Database schema

New migration `apps/api/migrations/001-add-deleted-at.sql`:

```sql
ALTER TABLE files ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at);
```

Source `apps/api/schema.sql` gets the same column + index so fresh installs are consistent.

`deleted_at`:
- `NULL` → live file
- ISO timestamp (e.g., `2026-05-22T14:30:00.000Z`) → in trash since that moment

## API

### `DELETE /api/file/:id` (modified)

Query param `force`:
- `force=true` → immediate hard delete. Works whether file is live or already trashed. Deletes R2 object(s) at current `stored_path` / `thumbnail_path` and the DB row.
- absent / `force=false` (default):
  - Live file → soft-delete: move R2 objects from `<path>` to `trash/<path>` (copy + delete), update DB: `stored_path = 'trash/' + stored_path`, `thumbnail_path = 'trash/' + thumbnail_path` (if present), `deleted_at = now()`.
  - Already trashed → `400 "Already in trash"`.

### `POST /api/file/:id/restore` (new)

- File must have `deleted_at != NULL`; otherwise `400 "Not in trash"`.
- Strip `trash/` prefix from `stored_path` and `thumbnail_path`.
- Move R2 objects back to original paths.
- Update DB: `deleted_at = NULL`, restored paths.

### `GET /api/file/:id/content` (new)

Authenticated proxy that returns R2 bytes at the file's current `stored_path` (or `thumbnail_path` if `?type=thumbnail`). Works for both live and trashed files. Used by the panel to render thumbnails / previews of trashed files (since direct R2 URLs of trashed files return 404).

Response: `Content-Type` from R2 metadata, `Cache-Control: private, no-store` (don't want browser caching trash content under stable URLs).

### `GET /api/files` (modified)

New query param `trash`:
- absent / `false` → `WHERE deleted_at IS NULL` (default — main list).
- `true` → `WHERE deleted_at IS NOT NULL` (trash list).

Existing sort/filter/search params still apply within the selected scope.

### Helper functions

**`apps/api/src/utils/storage.ts`** — new `moveR2Object(bucket, from, to)`:
```ts
const obj = await bucket.get(from);
if (!obj) throw new Error(`Source not found: ${from}`);
await bucket.put(to, obj.body, {
  httpMetadata: obj.httpMetadata,
  customMetadata: obj.customMetadata,
});
await bucket.delete(from);
```
R2 has no server-side move — this is copy + delete. Acceptable for 5–15 MB files.

**`apps/api/src/utils/db.ts`**:
- Rename existing `deleteFile` → `hardDeleteFile`.
- New `softDeleteFile(db, id, newStoredPath, newThumbnailPath)` — UPDATE setting `deleted_at`, paths.
- New `restoreFile(db, id, originalStoredPath, originalThumbnailPath)` — UPDATE clearing `deleted_at`, paths.
- Modify `getFiles` to accept `includeTrash: 'only' | 'exclude'` (default `'exclude'`), adding `deleted_at IS NULL` or `deleted_at IS NOT NULL` to WHERE.

## Cron

Existing schedule `0 3 * * *` in `wrangler.jsonc` stays unchanged.

`apps/api/src/index.ts` `scheduled()` handler is extended to also run `cleanupTrash`:

```ts
async scheduled(_event, env, ctx) {
  ctx.waitUntil(Promise.all([
    cleanupExpiredImages(env),
    cleanupTrash(env),
  ]));
}
```

New `apps/api/src/utils/trash.ts`:

```ts
export async function cleanupTrash(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const expired = await env.DB
    .prepare('SELECT id, stored_path, thumbnail_path FROM files WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .bind(cutoff)
    .all<{ id: string; stored_path: string; thumbnail_path: string | null }>();

  let purged = 0;
  for (const row of expired.results || []) {
    try {
      await env.BUCKET.delete(row.stored_path);
      if (row.thumbnail_path) await env.BUCKET.delete(row.thumbnail_path);
      await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(row.id).run();
      purged++;
    } catch (err) {
      console.error(`Failed to purge ${row.id}:`, err);
    }
  }
  console.log(`Trash cleanup: purged ${purged}/${expired.results?.length || 0} expired files`);
}
```

14 days measured from `deleted_at`. Failures on individual files log and continue — the row stays and gets retried tomorrow.

## Panel

### Header (`apps/panel/src/app/dashboard/page.tsx`)

Add a `Trash2` icon (lucide-react) in the actions row, between HelpCircle and LogOut. No text label. Links to `/dashboard/trash`. Same styling as other icon buttons; hover tint red (consistent with destructive intent already shown on LogOut hover).

### New page `/dashboard/trash`

`apps/panel/src/app/dashboard/trash/page.tsx` — slimmed-down dashboard:
- Header with "Trash" title and back link to `/dashboard`.
- Calls `api.getFiles({ trash: true })`.
- Reuses `FileTable` / `FileGrid` in a new `trashMode` prop, which:
  - Hides the per-row Open / Edit / Delete buttons.
  - Shows two new buttons: **Restore** (Undo2, neon-cyan) and **Delete forever** (Trash2, red, requires confirm dialog).
  - Renders thumbnails via authenticated blob fetch (see below).
- No upload modal, no search/filter/sort/bulk UI (intentionally minimal).
- Pagination kept (same `Pagination` component) — easy and consistent.

### Auth-loaded thumbnails

New in `apps/panel/src/lib/api.ts`:
```ts
async getFileBlobUrl(id: string, type?: 'thumbnail'): Promise<string> {
  const res = await fetch(`${API_URL}/api/file/${id}/content${type ? `?type=${type}` : ''}`, {
    headers: { Authorization: `Bearer ${this.getToken()}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch content (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
```

Custom hook `useAuthBlob(id, type?)` in a shared location (e.g., `apps/panel/src/lib/useAuthBlob.ts`):
- Returns `string | null` (object URL when ready).
- On unmount or id-change, revokes the URL.
- Shows skeleton in caller until URL ready.

In `trashMode`, `FileTable` / `FileGrid` use this hook for `<img src>` instead of `file.thumbnail_url`. For full-screen `FilePreview` of trashed files, also use this hook for the main media src.

### API client additions (`apps/panel/src/lib/api.ts`)

- `getFiles({ trash, ... })` → adds `&trash=true` when set.
- `deleteFile(id, opts?: { force?: boolean })` → adds `?force=true` when set.
- `restoreFile(id)` → POST `/api/file/:id/restore`.
- `getFileBlobUrl(id, type?)` → as above.

Update `FileData` type to include `deleted_at?: string | null`.

## Data flow examples

**Soft delete (live → trash):**
1. Panel: `api.deleteFile(id)` → `DELETE /api/file/{id}` (no force).
2. API loads row, computes `newStoredPath = 'trash/' + stored_path`.
3. `moveR2Object(BUCKET, stored_path, newStoredPath)` (and thumbnail).
4. `softDeleteFile(DB, id, newStoredPath, newThumbnailPath)` → sets `deleted_at = now()`.
5. Returns 200. Panel refetches, file vanishes from main list.

**Restore (trash → live):**
1. Panel: `api.restoreFile(id)` → `POST /api/file/{id}/restore`.
2. API checks `deleted_at != NULL`, computes `originalPath = stored_path.replace(/^trash\//, '')`.
3. `moveR2Object(BUCKET, current, original)` (and thumbnail).
4. `restoreFile(DB, id, original, originalThumbnail)` → clears `deleted_at`.
5. Returns 200. Panel refetches.

**Delete forever (from trash view):**
1. Panel: `api.deleteFile(id, { force: true })` → `DELETE /api/file/{id}?force=true`.
2. API: `deleteFromR2(stored_path)` (already trash path), thumbnail too, `hardDeleteFile(DB, id)`.
3. Returns 200.

**Cron purge:**
1. 03:00 UTC daily, `scheduled()` fires.
2. `cleanupTrash` selects rows where `deleted_at < now() - 14 days`.
3. For each: delete R2 object(s), delete DB row. Errors logged, loop continues.

## Error handling

| Scenario | Behavior |
|---|---|
| DELETE on already-trashed file (no force) | 400 `"Already in trash"` |
| RESTORE on live file | 400 `"Not in trash"` |
| RESTORE / DELETE on unknown id | 404 `"File not found"` |
| `moveR2Object` fails on put | 502 — abort the request, leave DB unchanged (R2 still has source) |
| `moveR2Object` fails on delete after put | Log warning; orphaned old copy. Won't break logical state but wastes storage. Acceptable for an edge case. |
| Cron purge fails for one file | Log error, continue with others. Retry tomorrow. |
| Auth missing on `/api/file/:id/content` | 401, same as other authed endpoints |

## Testing (manual)

No automated test infra in repo currently. Test plan:

- [ ] Apply migration locally (`npm run db:migrate:local`); verify column present.
- [ ] Upload file → delete via panel → confirm: file disappears from main list, appears in trash, direct URL returns 404, R2 has `trash/...` object.
- [ ] Restore → confirm: file returns to main list, direct URL works again, R2 has original-prefix object.
- [ ] Delete forever from trash → confirm: file gone, R2 empty, DB row gone.
- [ ] API: `DELETE /api/file/{id}` → soft-delete. `DELETE /api/file/{id}?force=true` on trashed file → hard-delete.
- [ ] Trash thumbnails render via auth blob fetch (network tab shows `/api/file/{id}/content?type=thumbnail` with Bearer header).
- [ ] Set a row's `deleted_at` to 15 days ago via `wrangler d1 execute`; trigger scheduled job; verify row + R2 objects gone.

## Open questions / future work

- **Bulk actions in trash** — deferred per design discussion. Add later if kosz becomes large.
- **Empty trash** — deferred.
- **Retention configurability** — hard-coded 14 days; revisit if needed.
- **Concurrent restore + soft-delete race** — extremely unlikely given personal usage; if it becomes an issue, add a transactional check.
