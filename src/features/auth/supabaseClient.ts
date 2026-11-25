import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] || "https://api-v3.therama.dev";
const publishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

export const supabaseClient = publishableKey ? createClient(supabaseUrl, publishableKey) : null;
export const isSupabaseConfigured = Boolean(supabaseClient);
