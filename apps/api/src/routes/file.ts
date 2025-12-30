import { Env } from '../types';
import { getFileById, updateFile, deleteFile, fileRecordToResponse } from '../utils/db';
import { deleteFromR2 } from '../utils/storage';

export async function handleGetFile(
  request: Request,
  env: Env,
  fileId: string
): Promise<Response> {
  try {
    const file = await getFileById(env.DB, fileId);

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'File not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        file: fileRecordToResponse(file, env.CDN_BASE_URL, true),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get file error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function handleUpdateFile(
  request: Request,
  env: Env,
  fileId: string
): Promise<Response> {
  try {
    // Check if file exists
    const existingFile = await getFileById(env.DB, fileId);

    if (!existingFile) {
      return new Response(
        JSON.stringify({ success: false, error: 'File not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let body: { original_name?: string };
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate original_name if provided
    if (body.original_name !== undefined) {
      if (typeof body.original_name !== 'string' || body.original_name.trim() === '') {
        return new Response(
          JSON.stringify({ success: false, error: 'original_name must be a non-empty string' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Update file
    const updatedFile = await updateFile(env.DB, fileId, {
      original_name: body.original_name,
    });

    if (!updatedFile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update file' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        file: fileRecordToResponse(updatedFile, env.CDN_BASE_URL, true),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Update file error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function handleDeleteFile(
  request: Request,
  env: Env,
  fileId: string
): Promise<Response> {
  try {
    // Get file metadata
    const file = await getFileById(env.DB, fileId);

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'File not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Delete main file from R2
    await deleteFromR2(env.BUCKET, file.stored_path);

    // Delete thumbnail from R2 if exists
    if (file.thumbnail_path) {
      await deleteFromR2(env.BUCKET, file.thumbnail_path);
    }

    // Delete record from D1
    await deleteFile(env.DB, fileId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'File deleted successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Delete file error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
