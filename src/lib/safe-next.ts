/**
 * Where to send the user after signing in. Only same-site paths are allowed, so a crafted link can't bounce the
 * user to another website.
 */
export function safeNext(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  if (value === "/sign-in" || value.startsWith("/sign-in?") || value.startsWith("/auth/")) return fallback;
  return value;
}
