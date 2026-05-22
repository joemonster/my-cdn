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
