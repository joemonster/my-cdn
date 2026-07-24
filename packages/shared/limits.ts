/**
 * Single source of truth for upload limits, shared by apps/api and apps/panel.
 * Change the two constants below and every validator and docs string follows.
 *
 * Hard ceiling: Cloudflare Workers rejects request bodies over 100MB on the
 * Free/Pro plans, so a limit above that cannot be reached by a normal upload.
 */

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

export const MAX_IMAGE_SIZE_MB = MAX_IMAGE_SIZE / (1024 * 1024);
export const MAX_VIDEO_SIZE_MB = MAX_VIDEO_SIZE / (1024 * 1024);
