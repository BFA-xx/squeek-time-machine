import "server-only";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:4300";

export async function serverFetch<T = unknown>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}/v1${path}`, { next: { revalidate: 30 }, signal: AbortSignal.timeout(6000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
