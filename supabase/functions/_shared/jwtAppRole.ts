/** Reads `app_role` from a Bearer JWT. Absent until the custom access token hook is enabled. */
export function jwtAppRoleFromHeader(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    const payload = JSON.parse(json) as { app_role?: unknown };
    return typeof payload.app_role === "string" && payload.app_role ? payload.app_role : null;
  } catch {
    return null;
  }
}
