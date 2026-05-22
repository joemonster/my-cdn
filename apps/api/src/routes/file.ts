import { Env } from '../types';
import { getFileById, updateFile, hardDeleteFile, fileRecordToResponse } from '../utils/db';
import { deleteFromR2, uploadToR2 } from '../utils/storage';
import { errorResponse, successResponse } from '../utils/response';

export async function handleGetFile(
  request: Request,
  env: Env,
  fileId: string
): Promise<Response> {
  try {
    const file = await getFileById(env.DB, fileId);

    if (!file) {
      return errorResponse('File not found', 404);
    }

    return successResponse({
      file: fileRecordToResponse(file, env.CDN_BASE_URL, true),
    });
  } catch (error) {
    console.error('Get file error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}

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

    await deleteFromR2(env.BUCKET, file.stored_path);

    if (file.thumbnail_path) {
      await deleteFromR2(env.BUCKET, file.thumbnail_path);
    }

    await hardDeleteFile(env.DB, fileId);

    return successResponse({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}
