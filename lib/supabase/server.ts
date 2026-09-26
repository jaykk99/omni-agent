import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// The app has no per-user accounts — a single shared PIN (checked in
// middleware) gates the whole thing. API routes use the service role key
// so they can read/write freely without needing an auth session.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
