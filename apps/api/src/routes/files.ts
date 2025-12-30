import {
  Env,
  FilesQueryParams,
  SortField,
  SortOrder,
  FileTypeFilter,
} from '../types';
import { getFiles, fileRecordToResponse } from '../utils/db';

export async function handleGetFiles(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const params = parseQueryParams(url.searchParams);

    const { files, pagination } = await getFiles(env.DB, params);

    const filesResponse = files.map((file) =>
      fileRecordToResponse(file, env.CDN_BASE_URL)
    );

    return new Response(
      JSON.stringify({
        success: true,
        files: filesResponse,
        pagination,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Get files error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

function parseQueryParams(searchParams: URLSearchParams): FilesQueryParams {
  // Page
  let page = parseInt(searchParams.get('page') || '1', 10);
  if (isNaN(page) || page < 1) page = 1;

  // Limit
  let limit = parseInt(searchParams.get('limit') || '20', 10);
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  // Sort field
  const sortParam = searchParams.get('sort') || 'created_at';
  const validSortFields: SortField[] = ['created_at', 'file_size', 'original_name'];
  const sort: SortField = validSortFields.includes(sortParam as SortField)
    ? (sortParam as SortField)
    : 'created_at';

  // Order
  const orderParam = searchParams.get('order') || 'desc';
  const validOrders: SortOrder[] = ['asc', 'desc'];
  const order: SortOrder = validOrders.includes(orderParam as SortOrder)
    ? (orderParam as SortOrder)
    : 'desc';

  // Type filter
  const typeParam = searchParams.get('type') || 'all';
  const validTypes: FileTypeFilter[] = ['image', 'video', 'all'];
  const type: FileTypeFilter = validTypes.includes(typeParam as FileTypeFilter)
    ? (typeParam as FileTypeFilter)
    : 'all';

  // Search
  const search = searchParams.get('search') || undefined;

  return { page, limit, sort, order, type, search };
}
