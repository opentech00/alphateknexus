-- Add attachment support to messages for in-chat image uploads
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name text;

-- Allow content to be nullable when an image is attached (image-only messages)
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;

-- Add a check: either content or attachment_url must be present
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_or_attachment_check;
ALTER TABLE messages ADD CONSTRAINT messages_content_or_attachment_check
  CHECK (content IS NOT NULL OR attachment_url IS NOT NULL);
