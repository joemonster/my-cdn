export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  API_KEY: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  CDN_BASE_URL: string;
}

export interface FileRecord {
  id: string;
  original_name: string;
  stored_path: string;
  mime_type: string;
  file_size: number;
  file_type: 'image' | 'video';
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileResponse {
  id: string;
  url: string;
  thumbnail_url: string | null;
  original_name: string;
  stored_path?: string;
  mime_type: string;
  file_size: number;
  file_type: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UploadResponse {
  success: boolean;
  file: FileResponse;
}

export interface FilesListResponse {
  success: boolean;
  files: FileResponse[];
  pagination: PaginationInfo;
}

export interface FileDetailResponse {
  success: boolean;
  file: FileResponse;
}

export type SortField = 'created_at' | 'file_size' | 'original_name';
export type SortOrder = 'asc' | 'desc';
export type FileTypeFilter = 'image' | 'video' | 'all';

export interface FilesQueryParams {
  page: number;
  limit: number;
  sort: SortField;
  order: SortOrder;
  type: FileTypeFilter;
  search?: string;
}

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
] as const;

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_VIDEO_SIZE = 15 * 1024 * 1024; // 15MB

export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export const EXTENSION_TO_MIME: Record<string, string> = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'gif': 'image/gif',
  'mp4': 'video/mp4',
  'webm': 'video/webm',
};
