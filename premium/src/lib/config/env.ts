/**
 * Environment validation. Error messages name the variable and the problem, NEVER the value.
 * Pass a plain object (not process.env directly) so tests can exercise it and so Next.js can inline
 * NEXT_PUBLIC_* values into the browser bundle (it only does so for literal `process.env.NEXT_PUBLIC_X` reads).
 */
export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n - ${problems.join("\n - ")}\nSee .env.example.`);
    this.name = "EnvError";
  }
}
export type EnvSource = Record<string, string | undefined>;
export interface PublicEnv { appUrl: string; supabaseUrl: string; supabaseAnonKey: string }

function isHttpUrl(v: string, allowLocalHttp: boolean): boolean {
  try {
    const u = new URL(v);
    if (u.protocol === "https:") return true;
    return allowLocalHttp && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch { return false; }
}

export function readPublicEnv(src: EnvSource): PublicEnv {
  const problems: string[] = [];
  const get = (name: string) => (src[name] ?? "").trim();
  const appUrl = get("NEXT_PUBLIC_APP_URL");
  const supabaseUrl = get("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!appUrl) problems.push("NEXT_PUBLIC_APP_URL is missing");
  else if (!isHttpUrl(appUrl, true)) problems.push("NEXT_PUBLIC_APP_URL must be an https URL (http is allowed only for localhost)");
  if (!supabaseUrl) problems.push("NEXT_PUBLIC_SUPABASE_URL is missing");
  else if (!isHttpUrl(supabaseUrl, true)) problems.push("NEXT_PUBLIC_SUPABASE_URL must be an https URL");
  else if (/YOUR-PROJECT-REF/i.test(supabaseUrl)) problems.push("NEXT_PUBLIC_SUPABASE_URL still contains the .env.example placeholder");
  if (!supabaseAnonKey) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
  else if (/^your-anon/i.test(supabaseAnonKey)) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY still contains the .env.example placeholder");
  if (problems.length) throw new EnvError(problems);
  return { appUrl: appUrl.replace(/\/+$/, ""), supabaseUrl: supabaseUrl.replace(/\/+$/, ""), supabaseAnonKey };
}

/** Literal reads so Next.js can inline them in client bundles. */
export function publicEnv(): PublicEnv {
  return readPublicEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** AdSense is optional. Returns null (ads OFF) unless a correctly formatted id is supplied. Never invents an id. */
export function adsensePublisherId(src: EnvSource): string | null {
  const v = (src.ADSENSE_PUBLISHER_ID ?? "").trim();
  return /^ca-pub-\d{16}$/.test(v) ? v : null;
}
