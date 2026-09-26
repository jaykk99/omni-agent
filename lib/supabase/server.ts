import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// The app has no per-user accounts — a single shared PIN (checked in
// middleware) gates the whole thing, and RLS is disabled on both tables
// (see supabase/schema.sql), so the anon key already has full access.
// No service-role key is needed.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
