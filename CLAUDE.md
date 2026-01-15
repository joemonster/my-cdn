# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal file hosting CDN built as a monorepo with two apps:
- **apps/api** - Cloudflare Workers API (TypeScript) with D1 database and R2 storage
- **apps/panel** - Next.js 14 admin panel with static export

## Commands

### Development
```bash
# Install all dependencies (from root)
npm install

# Run API locally (starts on http://localhost:8787)
npm run dev:api

# Run Panel locally (starts on http://localhost:3000)
npm run dev:panel
```

### Database (from apps/api directory)
```bash
# Run migrations locally
npm run db:migrate:local

# Run migrations in production
npm run db:migrate
```

### Linting
```bash
# Lint panel (from apps/panel or root)
npm run lint --workspace=apps/panel
```

### Build & Deploy
```bash
# Build API (dry-run deploy)
npm run build:api

# Build Panel (Next.js static export)
npm run build:panel

# Deploy API to Cloudflare Workers
npm run deploy:api

# Deploy Panel to Cloudflare Pages
npm run deploy:panel
```

## Architecture

### API (Cloudflare Workers)
- Entry point: `apps/api/src/index.ts` - main router handling CORS, file serving, and API routes
- Routes are in `apps/api/src/routes/` - upload.ts, files.ts, file.ts
- Auth middleware: `apps/api/src/middleware/auth.ts`
- Storage/DB utilities: `apps/api/src/utils/`
- Types and constants: `apps/api/src/types.ts`

**Request flow:**
1. Public files: `/YYYYMM/hash.ext` → served directly from R2 with 1-year cache
2. API routes: `/api/*` → require Bearer token auth (except `/api/auth/login`)

**Environment bindings (wrangler.jsonc):**
- `DB` - D1 database binding
- `BUCKET` - R2 storage binding
- `API_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CDN_BASE_URL` - env vars

### Panel (Next.js)
- Pages: `apps/panel/src/app/` - login page and dashboard
- Components: `apps/panel/src/components/` - FileTable, UploadModal, FilePreview, etc.
- API client: `apps/panel/src/lib/api.ts` - handles all API calls, auth token management, and thumbnail generation

**Key patterns:**
- Uses `NEXT_PUBLIC_API_URL` env var to connect to API
- Client-side thumbnail generation for images and videos before upload
- Token stored in localStorage under `cdn_token`

### File Storage
Files stored in R2 as: `{YYYYMM}/{hash}.{extension}`
Thumbnails stored as: `{YYYYMM}/{hash}_thumb.{extension}`

### Database Schema
Single `files` table with columns: id, original_name, stored_path, mime_type, file_size, file_type, width, height, duration, thumbnail_path, created_at, updated_at
