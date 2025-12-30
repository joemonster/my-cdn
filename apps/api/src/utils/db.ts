import {
  FileRecord,
  FileResponse,
  FilesQueryParams,
  PaginationInfo,
  SortField,
  SortOrder,
  FileTypeFilter,
} from '../types';

export async function insertFile(
  db: D1Database,
  file: Omit<FileRecord, 'created_at' | 'updated_at'>
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO files (id, original_name, stored_path, mime_type, file_size, file_type, width, height, duration, thumbnail_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      file.id,
      file.original_name,
      file.stored_path,
      file.mime_type,
      file.file_size,
      file.file_type,
      file.width,
      file.height,
      file.duration,
      file.thumbnail_path,
      now,
      now
    )
    .run();
}

export async function getFileById(
  db: D1Database,
  id: string
): Promise<FileRecord | null> {
  const result = await db
    .prepare('SELECT * FROM files WHERE id = ?')
    .bind(id)
    .first<FileRecord>();

  return result;
}

export async function updateFile(
  db: D1Database,
  id: string,
  updates: Partial<Pick<FileRecord, 'original_name'>>
): Promise<FileRecord | null> {
  const now = new Date().toISOString();

  if (updates.original_name !== undefined) {
    await db
      .prepare('UPDATE files SET original_name = ?, updated_at = ? WHERE id = ?')
      .bind(updates.original_name, now, id)
      .run();
  }

  return await getFileById(db, id);
}

export async function deleteFile(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
}

export async function getFiles(
  db: D1Database,
  params: FilesQueryParams
): Promise<{ files: FileRecord[]; pagination: PaginationInfo }> {
  const { page, limit, sort, order, type, search } = params;
  const offset = (page - 1) * limit;

  // Build WHERE clause
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (type !== 'all') {
    conditions.push('file_type = ?');
    bindings.push(type);
  }

  if (search) {
    conditions.push('original_name LIKE ?');
    bindings.push(`%${search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate sort field to prevent SQL injection
  const validSortFields: SortField[] = ['created_at', 'file_size', 'original_name'];
  const sortField = validSortFields.includes(sort) ? sort : 'created_at';

  // Validate order
  const validOrders: SortOrder[] = ['asc', 'desc'];
  const sortOrder = validOrders.includes(order) ? order.toUpperCase() : 'DESC';

  // Get total count
  const countQuery = `SELECT COUNT(*) as count FROM files ${whereClause}`;
  const countResult = await db
    .prepare(countQuery)
    .bind(...bindings)
    .first<{ count: number }>();

  const total = countResult?.count || 0;

  // Get files
  const filesQuery = `
    SELECT * FROM files
    ${whereClause}
    ORDER BY ${sortField} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  const filesResult = await db
    .prepare(filesQuery)
    .bind(...bindings, limit, offset)
    .all<FileRecord>();

  return {
    files: filesResult.results || [],
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

export function fileRecordToResponse(
  file: FileRecord,
  cdnBaseUrl: string,
  includeDetails = false
): FileResponse {
  const response: FileResponse = {
    id: file.id,
    url: `${cdnBaseUrl}/${file.stored_path}`,
    thumbnail_url: file.thumbnail_path ? `${cdnBaseUrl}/${file.thumbnail_path}` : null,
    original_name: file.original_name,
    mime_type: file.mime_type,
    file_size: file.file_size,
    file_type: file.file_type,
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
