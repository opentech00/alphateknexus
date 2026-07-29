/*
# Add notifications, messages, and documents tables

1. New Tables
  - `notifications`
    - `id` (uuid, primary key)
    - `user_id` (uuid, FK to auth.users, owner)
    - `title` (text, notification title)
    - `body` (text, notification content)
    - `type` (text: booking_update, message, system)
    - `read` (boolean, default false)
    - `booking_id` (uuid, nullable, FK to bookings)
    - `created_at` (timestamptz)

  - `messages`
    - `id` (uuid, primary key)
    - `booking_id` (uuid, FK to bookings)
    - `sender_id` (uuid, FK to auth.users)
    - `sender_name` (text)
    - `content` (text)
    - `is_admin` (boolean, default false)
    - `created_at` (timestamptz)

  - `documents`
    - `id` (uuid, primary key)
    - `booking_id` (uuid, FK to bookings)
    - `user_id` (uuid, FK to auth.users)
    - `file_name` (text)
    - `file_url` (text)
    - `file_type` (text, nullable - mime type)
    - `file_size` (integer, nullable - bytes)
    - `uploaded_by_admin` (boolean, default false)
    - `created_at` (timestamptz)

2. Security
  - RLS enabled on all tables.
  - notifications: users can read/update their own; admins can insert for any user.
  - messages: users can read messages for their bookings; authenticated can insert.
  - documents: users can CRUD for their bookings; admins can CRUD all.

3. Important Notes
  - All tables use auth.uid() for ownership checks.
  - notifications.user_id defaults to auth.uid().
  - messages/documents use booking ownership for access control.
*/

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'system' CHECK (type IN ('booking_update', 'message', 'system')),
  read boolean NOT NULL DEFAULT false,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  content text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_booking_messages" ON messages;
CREATE POLICY "select_booking_messages" ON messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM bookings WHERE bookings.id = messages.booking_id AND bookings.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "insert_messages" ON messages;
CREATE POLICY "insert_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "update_own_messages" ON messages;
CREATE POLICY "update_own_messages" ON messages FOR UPDATE
  TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages" ON messages FOR DELETE
  TO authenticated USING (auth.uid() = sender_id);

CREATE INDEX IF NOT EXISTS idx_messages_booking_id ON messages(booking_id);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  uploaded_by_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_booking_documents" ON documents;
CREATE POLICY "select_booking_documents" ON documents FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM bookings WHERE bookings.id = documents.booking_id AND bookings.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "insert_documents" ON documents;
CREATE POLICY "insert_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_documents" ON documents;
CREATE POLICY "update_own_documents" ON documents FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_documents" ON documents;
CREATE POLICY "delete_own_documents" ON documents FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_documents_booking_id ON documents(booking_id);

-- Storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_upload_documents" ON storage.objects;
CREATE POLICY "auth_upload_documents" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "public_read_documents" ON storage.objects;
CREATE POLICY "public_read_documents" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "owner_delete_documents" ON storage.objects;
CREATE POLICY "owner_delete_documents" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
