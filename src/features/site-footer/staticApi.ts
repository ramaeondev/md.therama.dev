// Read-only access to public reference data on the self-hosted Supabase backend
// (schema "static" at https://api-v3.therama.dev). No login needed.
// The publishable key is meant to be public; the backend only allows SELECT on this schema.
// Copied from apps.therama.dev so both sites read the same social_links rows.

const SUPABASE_URL = (
  (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "https://api-v3.therama.dev"
).replace(/\/$/, "");

const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ??
  "sb_publishable_TvfycUXoZ1whU1e-L8qhH-_PwN2YmxB";

async function selectStatic<T>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Accept-Profile": "static",
    },
  });
  if (!response.ok) {
    throw new Error(`API error (static.${table}): ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T[]>;
}

// ---------------------------------------------------------------------------
// Social links

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  label: string;
  created_at: string;
}

interface SocialLinkRow {
  id: string;
  platform: string;
  url: string;
  display_name: string;
  created_at: string;
}

/** Active social links from the shared "static" schema, in display order. */
export async function getSocialLinks(): Promise<SocialLink[]> {
  const rows = await selectStatic<SocialLinkRow>(
    "social_links",
    "select=id,platform,url,display_name,created_at&is_active=eq.true&order=sort_order.asc",
  );
  return rows
    .filter((row) => /^https?:\/\//i.test(row.url))
    .map((row) => ({
      id: row.id,
      platform: row.platform,
      url: row.url,
      label: row.display_name,
      created_at: row.created_at,
    }));
}

/** Profile details shown in the footer; mirrors apps.therama.dev's local profile. */
export const PROFILE = {
  name: "Markdown AI Workspace",
  owner: "therama.dev",
  website: "https://therama.dev",
} as const;

/** Query keys for the shared footer data. */
export const siteFooterQueryKeys = {
  socialLinks: ["static", "social-links"] as const,
};
