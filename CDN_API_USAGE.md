# CDN API Usage Guide

This document describes how to use the CDN API for uploading and retrieving files.

## Base URL

```
https://my-cdn-api.literalnie.workers.dev
```

## Authentication

All API endpoints (except login) require Bearer token authentication:

```
Authorization: Bearer <API_KEY>
```

## Upload File

**Endpoint:** `POST /api/upload`

**Content-Type:** `multipart/form-data`

**Form fields:**
- `file` (required) - The file to upload
- `thumbnail` (optional) - Base64-encoded thumbnail image (data URI format)

**Allowed file types:**
- Images (max 5MB): `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Videos (max 15MB): `video/mp4`, `video/webm`

**Example request:**

```bash
curl -X POST https://my-cdn-api.literalnie.workers.dev/api/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@image.jpg"
```

**Example response:**

```json
{
  "success": true,
  "file": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "url": "https://my-cdn-api.literalnie.workers.dev/202501/a1b2c3d4e5f6g7h8.jpg",
    "thumbnail_url": null,
    "original_name": "image.jpg",
    "mime_type": "image/jpeg",
    "file_size": 123456,
    "file_type": "image",
    "created_at": "2025-01-15T12:00:00.000Z"
  }
}
```

## File URLs

After upload, files are accessible at:

```
https://my-cdn-api.literalnie.workers.dev/{YYYYMM}/{hash}.{ext}
```

**URL structure:**
- `YYYYMM` - Year and month of upload (e.g., `202501` for January 2025)
- `hash` - 16-character SHA-256 hash of file content
- `ext` - File extension based on MIME type

**Examples:**
- `https://my-cdn-api.literalnie.workers.dev/202501/a1b2c3d4e5f6g7h8.jpg`
- `https://my-cdn-api.literalnie.workers.dev/202501/a1b2c3d4e5f6g7h8_thumb.jpg` (thumbnail)

**File URLs are:**
- Publicly accessible (no authentication required)
- Cached for 1 year (`Cache-Control: public, max-age=31536000, immutable`)
- Content-addressable (same file content = same URL)

## List Files

**Endpoint:** `GET /api/files`

**Query parameters:**
- `page` (default: 1) - Page number
- `limit` (default: 20, max: 100) - Items per page
- `sort` - Sort field: `created_at`, `file_size`, `original_name`
- `order` - Sort order: `asc`, `desc`
- `type` - Filter by type: `image`, `video`, `all`
- `search` - Search in original filename

**Example:**

```bash
curl "https://my-cdn-api.literalnie.workers.dev/api/files?page=1&limit=10&type=image" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Get Single File

**Endpoint:** `GET /api/file/{id}`

```bash
curl "https://my-cdn-api.literalnie.workers.dev/api/file/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Update File

**Endpoint:** `PATCH /api/file/{id}`

**Body:**
```json
{
  "original_name": "new-filename.jpg"
}
```

## Delete File

**Endpoint:** `DELETE /api/file/{id}`

```bash
curl -X DELETE "https://my-cdn-api.literalnie.workers.dev/api/file/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Error Responses

All errors return JSON:

```json
{
  "success": false,
  "error": "Error message"
}
```

Common HTTP status codes:
- `400` - Bad request (invalid file type, file too large, etc.)
- `401` - Unauthorized (missing or invalid token)
- `404` - File not found
- `500` - Internal server error
