/**
 * Load custom env vars for edge functions.
 *
 * `supabase start` only injects built-in vars (SUPABASE_URL, etc.) into the
 * edge runtime container. Custom vars (NOTION_CLIENT_ID, etc.) must come from
 * a `.env` file co-located inside the functions directory, which IS mounted.
 */

const loaded: Record<string, string> = {};

function loadOnce() {
  if (Object.keys(loaded).length > 0) return;

  // Try reading from the functions-level .env file
  const paths = [
    new URL("../.env", import.meta.url).pathname,
    new URL("../.env.local", import.meta.url).pathname,
  ];

  for (const path of paths) {
    try {
      const text = Deno.readTextFileSync(path);
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        loaded[key] = value;
      }
    } catch {
      // File doesn't exist — skip
    }
  }
}

/**
 * Get an env var: checks Deno.env first (works in production / functions serve),
 * then falls back to the file-based loader (works with supabase start).
 */
export function env(key: string): string | undefined {
  const fromEnv = Deno.env.get(key);
  if (fromEnv !== undefined) return fromEnv;

  loadOnce();
  return loaded[key];
}
