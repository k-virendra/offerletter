import { createClient } from "@supabase/supabase-js";

// Gives an existing user the admin role. Usage: pnpm make-admin someone@example.com
// The user must have signed in at least once so their profile exists.

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!email || !url || !secret) {
  console.error("Usage: pnpm make-admin <email>   (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY)");
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.from("profiles").update({ role: "admin" }).ilike("email", email).select("id, email");
if (error) {
  console.error(error.message);
  process.exit(1);
}
if (!data.length) {
  console.error(`No user with the email ${email}. Sign in once first.`);
  process.exit(1);
}
console.log(`${data[0]?.email} is now an admin.`);
