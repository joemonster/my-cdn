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

interface UploadResult {
  success: boolean;
  file?: ReturnType<typeof fileRecordToResponse>;
  error?: string;
  status: number;
}

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  try {
    const result = await processUpload(request, env);

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: result.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, file: result.file }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Upload error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function processUpload(request: Request, env: Env): Promise<UploadResult> {
  const contentType = request.headers.get('Content-Type') || '';

  if (!contentType.includes('multipart/form-data')) {
    return {
      success: false,
      error: 'Content-Type must be multipart/form-data',
      status: 400,
    };
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const thumbnailBase64 = formData.get('thumbnail') as string | null;

  if (!file) {
    return {
      success: false,
      error: 'File is required',
      status: 400,
    };
  }

  // Validate file type
  const mimeType = file.type;
  const isImage = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
  const isVideo = (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mimeType);

  if (!isImage && !isVideo) {
    return {
      success: false,
      error: `Invalid file type: ${mimeType}. Allowed: ${[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(', ')}`,
      status: 400,
    };
  }

  // Validate file size
  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
  if (file.size > maxSize) {
    const maxSizeMB = maxSize / (1024 * 1024);
    return {
      success: false,
      error: `File too large. Maximum size: ${maxSizeMB}MB`,
      status: 400,
    };
  }

  // Read file data
  const fileData = await file.arrayBuffer();

  // Generate unique hash and paths
  const hash = await generateFileHash(fileData);
  const extension = MIME_TO_EXTENSION[mimeType] || 'bin';
  const storedPath = generateStoragePath(hash, extension);

  // Upload main file to R2
  await uploadToR2(env.BUCKET, storedPath, fileData, mimeType);

  // Handle thumbnail
  let thumbnailPath: string | null = null;
  if (thumbnailBase64) {
    try {
      // Remove data URL prefix if present
      const base64Data = thumbnailBase64.replace(/^data:image\/\w+;base64,/, '');
      const thumbnailBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      thumbnailPath = generateThumbnailPath(hash, 'jpg');
      await uploadToR2(env.BUCKET, thumbnailPath, thumbnailBuffer.buffer, 'image/jpeg');
    } catch (error) {
      console.error('Thumbnail upload error:', error);
      // Continue without thumbnail if it fails
    }
  }

  // Generate file ID
  const fileId = uuidv4();

  // Insert into database
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

  // Get the inserted file
  const insertedFile = await getFileById(env.DB, fileId);

  if (!insertedFile) {
    return {
      success: false,
      error: 'Failed to retrieve uploaded file',
      status: 500,
    };
  }

  return {
    success: true,
    file: fileRecordToResponse(insertedFile, env.CDN_BASE_URL),
    status: 201,
  };
}
