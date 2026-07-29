/*
# Link smart_sort_subscriptions to profiles

1. Problem
  - The admin Subscriptions tab queries `smart_sort_subscriptions` with a join
    to `profiles` (`select('*, profiles(full_name, email)')`).
  - PostgREST could not resolve the relationship because
    `smart_sort_subscriptions.user_id` only has a FK to `auth.users`, not to
    `profiles`. Error: "Could not find a relationship between
    'smart_sort_subscriptions' and 'profiles' in the schema cache".

2. Fix
  - Add a foreign key from `smart_sort_subscriptions.user_id` to `profiles.id`.
    `profiles.id` itself references `auth.users(id)` ON DELETE CASCADE, so the
    cascade chain is preserved: deleting a user deletes their profile and their
    subscriptions.
  - Profiles are auto-created on signup via the existing
    `on_auth_user_created` trigger, so every `auth.users` row has a matching
    `profiles` row, satisfying the FK for existing data.

3. Security
  - No RLS or policy changes. The FK is a schema-only constraint.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'smart_sort_subscriptions_user_id_profiles_fkey'
      AND conrelid = 'smart_sort_subscriptions'::regclass
  ) THEN
    ALTER TABLE smart_sort_subscriptions
      ADD CONSTRAINT smart_sort_subscriptions_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
