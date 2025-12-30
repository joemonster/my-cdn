# My CDN

Personal file hosting CDN built with Cloudflare Workers, D1, R2, and Next.js.

## Features

- **File Upload**: Upload images (JPG, PNG, WebP, GIF) up to 5MB and videos (MP4, WebM) up to 15MB
- **Thumbnail Generation**: Client-side thumbnail generation for images and videos
- **Fast CDN Delivery**: Files served directly from Cloudflare R2 with edge caching
- **Admin Panel**: Modern dark-themed admin panel with file management
- **API Access**: Full REST API for programmatic access
- **Search & Filter**: Search files by name, filter by type
- **Sorting & Pagination**: Sort by date, size, or name with pagination

## Architecture

```
my-cdn/
├── apps/
│   ├── api/          # Cloudflare Workers API
│   └── panel/        # Next.js Admin Panel
├── .github/
│   └── workflows/    # GitHub Actions for deployment
└── package.json      # Root package.json (workspaces)
```

## Tech Stack

### API
- **Cloudflare Workers** - Serverless edge runtime
- **Cloudflare D1** - SQLite database at the edge
- **Cloudflare R2** - S3-compatible object storage

### Panel
- **Next.js 14** - React framework with static export
- **Tailwind CSS** - Utility-first CSS
- **Lucide React** - Icons
- **React Hot Toast** - Notifications

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/my-cdn.git
   cd my-cdn
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up API locally**
   ```bash
   cd apps/api

   # Create D1 database
   npx wrangler d1 create my-cdn-db

   # Update wrangler.toml with the database_id from the output

   # Run migrations locally
   npx wrangler d1 execute my-cdn-db --local --file=schema.sql

   # Create R2 bucket
   npx wrangler r2 bucket create my-cdn-files

   # Start the API locally
   npm run dev
   ```

4. **Set up Panel locally** (in a new terminal)
   ```bash
   cd apps/panel
   npm run dev
   ```

5. **Access the panel**
   - Panel: http://localhost:3000
   - API: http://localhost:8787

### Default Credentials

Edit `apps/api/wrangler.toml` to change:

```toml
[vars]
API_KEY = "your-secret-api-key-here"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "your-admin-password"
CDN_BASE_URL = "https://cdn.yourdomain.com"
```

## Deployment

### Prerequisites

1. Create a Cloudflare API token with permissions:
   - Workers Scripts: Edit
   - Workers R2 Storage: Edit
   - D1: Edit
   - Cloudflare Pages: Edit

2. Add the token as a GitHub secret: `CF_API_TOKEN`

3. Create the D1 database and R2 bucket in Cloudflare dashboard

4. Update `wrangler.toml` with production values

### Deploy API

Push to main branch or manually trigger the workflow:
```bash
git push origin main
```

The API will be deployed to `https://my-cdn-api.<your-subdomain>.workers.dev`

### Deploy Panel

1. Add GitHub variable `API_URL` with your API URL
2. Push to main branch

The panel will be deployed to `https://my-cdn-panel.pages.dev`

## API Reference

### Authentication

All `/api/*` endpoints require the `Authorization` header:
```
Authorization: Bearer <API_KEY>
```

### Endpoints

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

#### Upload File
```http
POST /api/upload
Authorization: Bearer <API_KEY>
Content-Type: multipart/form-data

file: <binary>
thumbnail: <base64> (optional)
```

#### List Files
```http
GET /api/files?page=1&limit=20&sort=created_at&order=desc&type=all&search=query
Authorization: Bearer <API_KEY>
```

Parameters:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `sort` - Sort field: `created_at`, `file_size`, `original_name`
- `order` - Sort order: `asc`, `desc`
- `type` - Filter: `image`, `video`, `all`
- `search` - Search query

#### Get File
```http
GET /api/file/:id
Authorization: Bearer <API_KEY>
```

#### Update File
```http
PATCH /api/file/:id
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "original_name": "new-name.jpg"
}
```

#### Delete File
```http
DELETE /api/file/:id
Authorization: Bearer <API_KEY>
```

#### Serve File (Public)
```http
GET /:path
```

Example: `GET /202512/abc123.jpg`

## File Storage Structure

Files are stored in R2 with the following path structure:
```
{YYYYMM}/{hash}.{extension}
{YYYYMM}/{hash}_thumb.{extension}  (thumbnails)
```

Example:
```
202512/a1b2c3d4e5f6g7h8.jpg
202512/a1b2c3d4e5f6g7h8_thumb.jpg
```

## Environment Variables

### API (wrangler.toml)

| Variable | Description |
|----------|-------------|
| `API_KEY` | Secret key for API authentication |
| `ADMIN_USERNAME` | Admin panel username |
| `ADMIN_PASSWORD` | Admin panel password |
| `CDN_BASE_URL` | Base URL for file URLs |

### Panel

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | API URL for the panel |

## GitHub Secrets & Variables

### Secrets
- `CF_API_TOKEN` - Cloudflare API token

### Variables
- `API_URL` - Production API URL

## License

MIT
