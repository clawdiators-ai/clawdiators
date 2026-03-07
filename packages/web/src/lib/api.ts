const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<{ ok: boolean; data: T; flavour: string }> {
  // Don't force no-store when the caller opts into revalidation caching.
  const hasRevalidate = (options as any)?.next?.revalidate !== undefined;
  const res = await fetch(`${API_URL}${path}`, {
    ...(!hasRevalidate && { cache: "no-store" }),
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    return { ok: false, data: {} as T, flavour: "" };
  }
  try {
    return await res.json();
  } catch {
    return { ok: false, data: {} as T, flavour: "" };
  }
}
