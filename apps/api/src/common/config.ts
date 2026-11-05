/** Refuses to start in production with settings that would quietly leave it open or broken. */
export function configProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const out: string[] = [];
  if (!env.DATABASE_URL) out.push("DATABASE_URL is required");
  if (!env.WEB_ORIGINS) out.push("WEB_ORIGINS is required, for example https://time.example.com");
  else if (env.WEB_ORIGINS.split(",").some((o) => !o.trim().startsWith("https://"))) out.push("WEB_ORIGINS must all be https:// in production");
  if (!env.WALLET_DOMAIN) out.push("WALLET_DOMAIN is required, for example time.example.com");
  if ((env.ADMIN_TOKEN ?? "").length < 32) out.push("ADMIN_TOKEN must be at least 32 characters");
  if ((env.PROXY_SECRET ?? "").length < 32) out.push("PROXY_SECRET must be at least 32 characters, and match the web app's");
  return out;
}
