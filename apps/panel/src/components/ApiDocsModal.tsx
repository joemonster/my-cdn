'use client';

import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface ApiDocsModalProps {
  onClose: () => void;
  apiUrl: string;
}

export function ApiDocsModal({ onClose, apiUrl }: ApiDocsModalProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedSection(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const fullDocs = `# My CDN API Documentation

Base URL: ${apiUrl}

## Authentication

All API endpoints (except file serving) require Bearer token authentication:

\`\`\`
Authorization: Bearer <API_KEY>
\`\`\`

---

## Endpoints

### POST /api/upload
Upload a file (image or video).

**Request:**
- Content-Type: multipart/form-data
- Body:
  - \`file\` (required): The file to upload
  - \`thumbnail\` (optional): Base64 encoded thumbnail image

**Limits:**
- Images: max 5MB (jpg, jpeg, png, webp, gif)
- Videos: max 15MB (mp4, webm)

**Response (201):**
\`\`\`json
{
  "success": true,
  "file": {
    "id": "uuid",
    "url": "${apiUrl}/202512/abc123.jpg",
    "thumbnail_url": "${apiUrl}/202512/abc123_thumb.jpg",
    "original_name": "photo.jpg",
    "file_size": 245000,
    "mime_type": "image/jpeg",
    "file_type": "image",
    "created_at": "2025-12-30T10:00:00Z"
  }
}
\`\`\`

---

### GET /api/files
List files with pagination and filtering.

**Query Parameters:**
- \`page\` (default: 1) - Page number
- \`limit\` (default: 20, max: 100) - Items per page
- \`sort\` (default: created_at) - Sort field: created_at, file_size, original_name
- \`order\` (default: desc) - Sort order: asc, desc
- \`type\` (default: all) - Filter: image, video, all
- \`search\` (optional) - Search by filename

**Response (200):**
\`\`\`json
{
  "success": true,
  "files": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "total_pages": 8
  }
}
\`\`\`

---

### GET /api/file/:id
Get single file details.

**Response (200):**
\`\`\`json
{
  "success": true,
  "file": {
    "id": "uuid",
    "url": "${apiUrl}/202512/abc123.jpg",
    "thumbnail_url": "${apiUrl}/202512/abc123_thumb.jpg",
    "original_name": "photo.jpg",
    "stored_path": "202512/abc123.jpg",
    "mime_type": "image/jpeg",
    "file_size": 245000,
    "file_type": "image",
    "width": 1920,
    "height": 1080,
    "created_at": "2025-12-30T10:00:00Z",
    "updated_at": "2025-12-30T10:00:00Z"
  }
}
\`\`\`

---

### PATCH /api/file/:id
Update file metadata (rename).

**Request:**
\`\`\`json
{
  "original_name": "new-name.jpg"
}
\`\`\`

**Response (200):**
\`\`\`json
{
  "success": true,
  "file": { ... }
}
\`\`\`

---

### DELETE /api/file/:id
Delete a file.

**Response (200):**
\`\`\`json
{
  "success": true,
  "message": "File deleted successfully"
}
\`\`\`

---

### GET /:path (Public - No Auth Required)
Serve files directly. No authentication needed.

**Example:** \`GET ${apiUrl}/202512/abc123.jpg\`

Returns the file with appropriate Content-Type and caching headers.

---

## Example Usage (cURL)

### Upload file:
\`\`\`bash
curl -X POST ${apiUrl}/api/upload \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@photo.jpg"
\`\`\`

### List files:
\`\`\`bash
curl "${apiUrl}/api/files?page=1&limit=10&sort=created_at&order=desc" \\
  -H "Authorization: Bearer YOUR_API_KEY"
\`\`\`

### Delete file:
\`\`\`bash
curl -X DELETE ${apiUrl}/api/file/FILE_ID \\
  -H "Authorization: Bearer YOUR_API_KEY"
\`\`\`

---

## Example Usage (JavaScript/TypeScript)

\`\`\`typescript
const API_URL = '${apiUrl}';
const API_KEY = 'your-api-key';

// Upload file
async function uploadFile(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(\`\${API_URL}/api/upload\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`,
    },
    body: formData,
  });

  return response.json();
}

// List files
async function getFiles(page = 1, limit = 20): Promise<any> {
  const response = await fetch(
    \`\${API_URL}/api/files?page=\${page}&limit=\${limit}\`,
    {
      headers: {
        'Authorization': \`Bearer \${API_KEY}\`,
      },
    }
  );

  return response.json();
}

// Delete file
async function deleteFile(id: string): Promise<any> {
  const response = await fetch(\`\${API_URL}/api/file/\${id}\`, {
    method: 'DELETE',
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`,
    },
  });

  return response.json();
}
\`\`\`

---

## Error Responses

All errors return JSON with this format:
\`\`\`json
{
  "success": false,
  "error": "Error message description"
}
\`\`\`

**Common HTTP Status Codes:**
- 400 - Bad Request (validation error)
- 401 - Unauthorized (missing/invalid API key)
- 404 - Not Found
- 500 - Internal Server Error
`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-900/95 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] m-4 flex flex-col bg-dark-800
                   rounded-xl border border-dark-600 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
          <div>
            <h2 className="text-xl font-semibold text-white">API Documentation</h2>
            <p className="text-sm text-gray-500 font-mono mt-1">{apiUrl}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(fullDocs, 'all')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neon-cyan/20 text-neon-cyan
                       hover:bg-neon-cyan/30 transition-colors text-sm font-medium"
            >
              {copiedSection === 'all' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              Copy All
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-dark-600 hover:bg-red-500/20 hover:text-red-400
                         transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="prose prose-invert max-w-none">
            {/* Authentication */}
            <section className="mb-8">
              <h3 className="text-lg font-semibold text-neon-cyan mb-3">Authentication</h3>
              <p className="text-gray-400 mb-2">All API endpoints require Bearer token:</p>
              <div className="bg-dark-700 rounded-lg p-4 font-mono text-sm">
                <code className="text-green-400">Authorization: Bearer {'<API_KEY>'}</code>
              </div>
            </section>

            {/* Endpoints */}
            <section className="mb-8">
              <h3 className="text-lg font-semibold text-neon-cyan mb-4">Endpoints</h3>

              {/* Upload */}
              <div className="mb-6 p-4 bg-dark-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-mono rounded">POST</span>
                  <code className="text-white font-mono">/api/upload</code>
                </div>
                <p className="text-gray-400 text-sm mb-2">Upload image or video file (multipart/form-data)</p>
                <p className="text-gray-500 text-xs">Limits: Images 5MB, Videos 15MB</p>
              </div>

              {/* List files */}
              <div className="mb-6 p-4 bg-dark-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded">GET</span>
                  <code className="text-white font-mono">/api/files</code>
                </div>
                <p className="text-gray-400 text-sm mb-2">List files with pagination</p>
                <p className="text-gray-500 text-xs">Params: page, limit, sort, order, type, search</p>
              </div>

              {/* Get file */}
              <div className="mb-6 p-4 bg-dark-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded">GET</span>
                  <code className="text-white font-mono">/api/file/:id</code>
                </div>
                <p className="text-gray-400 text-sm">Get single file details</p>
              </div>

              {/* Update file */}
              <div className="mb-6 p-4 bg-dark-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-mono rounded">PATCH</span>
                  <code className="text-white font-mono">/api/file/:id</code>
                </div>
                <p className="text-gray-400 text-sm">Update file metadata (rename)</p>
              </div>

              {/* Delete file */}
              <div className="mb-6 p-4 bg-dark-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-mono rounded">DELETE</span>
                  <code className="text-white font-mono">/api/file/:id</code>
                </div>
                <p className="text-gray-400 text-sm">Delete a file</p>
              </div>

              {/* Serve file */}
              <div className="mb-6 p-4 bg-dark-700 rounded-lg border border-neon-cyan/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded">GET</span>
                  <code className="text-white font-mono">/:path</code>
                  <span className="px-2 py-1 bg-neon-cyan/20 text-neon-cyan text-xs rounded">PUBLIC</span>
                </div>
                <p className="text-gray-400 text-sm">Serve files directly (no auth required)</p>
                <p className="text-gray-500 text-xs mt-1">Example: {apiUrl}/202512/abc123.jpg</p>
              </div>
            </section>

            {/* Quick Examples */}
            <section className="mb-8">
              <h3 className="text-lg font-semibold text-neon-cyan mb-4">Quick Examples</h3>

              <div className="bg-dark-700 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Upload file (cURL)</span>
                  <button
                    onClick={() => copyToClipboard(
                      `curl -X POST ${apiUrl}/api/upload \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F "file=@photo.jpg"`,
                      'curl-upload'
                    )}
                    className="p-1 rounded hover:bg-dark-500"
                  >
                    {copiedSection === 'curl-upload' ? (
                      <Check className="w-4 h-4 text-neon-cyan" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
                <pre className="text-sm text-green-400 overflow-x-auto">
{`curl -X POST ${apiUrl}/api/upload \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@photo.jpg"`}
                </pre>
              </div>

              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">List files (cURL)</span>
                  <button
                    onClick={() => copyToClipboard(
                      `curl "${apiUrl}/api/files?page=1&limit=10" \\\n  -H "Authorization: Bearer YOUR_API_KEY"`,
                      'curl-list'
                    )}
                    className="p-1 rounded hover:bg-dark-500"
                  >
                    {copiedSection === 'curl-list' ? (
                      <Check className="w-4 h-4 text-neon-cyan" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
                <pre className="text-sm text-green-400 overflow-x-auto">
{`curl "${apiUrl}/api/files?page=1&limit=10" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                </pre>
              </div>
            </section>

            {/* Copy full docs hint */}
            <div className="text-center p-4 bg-dark-700/50 rounded-lg border border-dashed border-dark-500">
              <p className="text-gray-400 text-sm">
                Click <span className="text-neon-cyan font-medium">"Copy All"</span> above to copy full documentation in Markdown format
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
