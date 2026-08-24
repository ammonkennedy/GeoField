export const GUEST_MODE_KEY = "geofield-guest-mode";
const AUTH_RETURN_PATH_KEY = "geofield-auth-return-path";

export function isGuestMode() {
  try { return localStorage.getItem(GUEST_MODE_KEY) === "true"; } catch { return false; }
}

export function enterGuestMode() {
  try { localStorage.setItem(GUEST_MODE_KEY, "true"); } catch {}
}

export function leaveGuestMode() {
  try { localStorage.removeItem(GUEST_MODE_KEY); } catch {}
}

export function requireAccountForSave(
  user: unknown,
  setLocation: (path: string) => void,
  returnPath?: string,
) {
  if (user) return true;
  const path = returnPath || `${window.location.pathname}${window.location.search}`;
  try { sessionStorage.setItem(AUTH_RETURN_PATH_KEY, path); } catch {}
  setLocation("/login");
  return false;
}

export function consumeAuthReturnPath() {
  try {
    const path = sessionStorage.getItem(AUTH_RETURN_PATH_KEY) || "/";
    sessionStorage.removeItem(AUTH_RETURN_PATH_KEY);
    return path;
  } catch {
    return "/";
  }
}
