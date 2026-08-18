-- Migration: create users table
-- Run with: supabase db push (or via supabase migrations)

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row-Level Security and a simple policy for authenticated users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow logged-in users to select their own record
CREATE POLICY "Users can view their own record"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id::text OR auth.role() = 'service_role');
