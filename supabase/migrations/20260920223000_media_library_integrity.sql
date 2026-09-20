/*
  Media Library integrity
  - Enforce 50MB + MIME allow-list on the public `media` bucket (client already checked size).
  - Drop unique (category, key, display_order) so default order 0 and re-activate do not collide.
*/

UPDATE storage.buckets
SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
WHERE id = 'media';

DROP INDEX IF EXISTS media_assets_category_key_order_unique;

CREATE INDEX IF NOT EXISTS idx_media_assets_category_key_order
  ON media_assets (category, key, display_order);
