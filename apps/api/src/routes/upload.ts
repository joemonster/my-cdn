import { v4 as uuidv4 } from 'uuid';
import {
  Env,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MIME_TO_EXTENSION,
} from '../types';
import { uploadToR2, generateStoragePath, generateThumbnailPath, generateFileHash } from '../utils/storage';
import { insertFile, getFileById, fileRecordToResponse } from '../utils/db';
import { errorResponse, successResponse } from '../utils/response';

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  try {
    const contentType = request.headers.get('Content-Type') || '';

    if (!contentType.includes('multipart/form-data')) {
      return errorResponse('Content-Type must be multipart/form-data', 400);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const thumbnailBase64 = formData.get('thumbnail') as string | null;

    if (!file) {
      return errorResponse('File is required', 400);
    }

    const mimeType = file.type;
    const isImage = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
    const isVideo = (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mimeType);

    if (!isImage && !isVideo) {
      return errorResponse(
        `Invalid file type: ${mimeType}. Allowed: ${[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(', ')}`,
        400
      );
    }

    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      return errorResponse(`File too large. Maximum size: ${maxSizeMB}MB`, 400);
    }

    const fileData = await file.arrayBuffer();
    const hash = await generateFileHash(fileData);
    const extension = MIME_TO_EXTENSION[mimeType] || 'bin';
    const storedPath = generateStoragePath(hash, extension);

    await uploadToR2(env.BUCKET, storedPath, fileData, mimeType);

    let thumbnailPath: string | null = null;
    if (thumbnailBase64) {
      try {
        const base64Data = thumbnailBase64.replace(/^data:image\/\w+;base64,/, '');
        const thumbnailBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        thumbnailPath = generateThumbnailPath(hash, 'jpg');
        await uploadToR2(env.BUCKET, thumbnailPath, thumbnailBuffer.buffer, 'image/jpeg');
      } catch (error) {
        console.error('Thumbnail upload error:', error);
      }
    }

    const fileId = uuidv4();

    await insertFile(env.DB, {
      id: fileId,
      original_name: file.name,
      stored_path: storedPath,
      mime_type: mimeType,
      file_size: file.size,
      file_type: isImage ? 'image' : 'video',
      width: null,
      height: null,
      duration: null,
      thumbnail_path: thumbnailPath,
    });

    const insertedFile = await getFileById(env.DB, fileId);

    if (!insertedFile) {
      return errorResponse('Failed to retrieve uploaded file', 500);
    }

    return successResponse({ file: fileRecordToResponse(insertedFile, env.CDN_BASE_URL) }, 201);
  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}
