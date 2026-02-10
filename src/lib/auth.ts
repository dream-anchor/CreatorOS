/**
 * Auth module for CreatorOS.
 * Uses Neon Auth (Better Auth) for authentication.
 */

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  profileImageUrl?: string;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

// Internal state
let _user: AuthUser | null = null;
let _session: AuthSession | null = null;
let _loading = true;
let _listeners: Set<() => void> = new Set();
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

const NEON_AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL || "";

function notifyListeners() {
  _listeners.forEach((l) => l());
}

/** Get the current access token (JWT) */
export function getToken(): string | null {
  return _session?.accessToken ?? localStorage.getItem("creatoros_auth_token");
}

/** Get the current user */
export function getUser(): AuthUser | null {
  return _user;
}

/** Check if auth is loading */
export function isLoading(): boolean {
  return _loading;
}

/** Subscribe to auth state changes */
export function onAuthChange(callback: () => void): () => void {
  _listeners.add(callback);
  return () => _listeners.delete(callback);
}

/** Fetch a JWT from the Neon Auth /token endpoint using session cookie */
async function fetchJWT(): Promise<string | null> {
  try {
    const res = await fetch(`${NEON_AUTH_URL}/token`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token || null;
  } catch {
    return null;
  }
}

/** Schedule JWT refresh (JWT expires in ~15 min, refresh at 12 min) */
function scheduleRefresh() {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(async () => {
    const jwt = await fetchJWT();
    if (jwt && _session) {
      _session.accessToken = jwt;
      localStorage.setItem("creatoros_auth_token", jwt);
      scheduleRefresh();
    }
  }, 12 * 60 * 1000); // 12 minutes
}

/** Sign in with email and password via Neon Auth */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const res = await fetch(`${NEON_AUTH_URL}/sign-in/email`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: "Anmeldung fehlgeschlagen" }));
    throw new Error(data.message || data.error || "Ungültige Anmeldedaten");
  }

  const data = await res.json();
  const user = data.user;

  // The sign-in sets a HttpOnly session cookie automatically.
  // Now fetch a JWT for API calls using that cookie.
  const jwt = await fetchJWT();
  if (!jwt) {
    throw new Error("Konnte kein Zugangstoken erhalten");
  }

  _user = {
    id: user.id,
    email: user.email || email,
    displayName: user.name || user.displayName,
    profileImageUrl: user.image,
  };
  _session = { accessToken: jwt, user: _user };
  _loading = false;

  localStorage.setItem("creatoros_auth_token", jwt);
  localStorage.setItem("creatoros_auth_user", JSON.stringify(_user));

  scheduleRefresh();
  notifyListeners();
}

/** Sign out */
export async function signOut(): Promise<void> {
  try {
    await fetch(`${NEON_AUTH_URL}/sign-out`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Ignore signout API errors
  }

  if (_refreshTimer) clearTimeout(_refreshTimer);
  _user = null;
  _session = null;
  _loading = false;

  localStorage.removeItem("creatoros_auth_token");
  localStorage.removeItem("creatoros_auth_user");

  notifyListeners();
}

/** Initialize auth state from stored token */
export async function initAuth(): Promise<void> {
  const storedUser = localStorage.getItem("creatoros_auth_user");

  if (storedUser) {
    try {
      _user = JSON.parse(storedUser);
    } catch {
      // Invalid stored data
    }
  }

  // Try refreshing the JWT using the session cookie
  const jwt = await fetchJWT();
  if (jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      _user = {
        id: payload.sub || payload.id,
        email: payload.email || "",
        displayName: payload.name,
      };
      _session = { accessToken: jwt, user: _user };
      localStorage.setItem("creatoros_auth_token", jwt);
      localStorage.setItem("creatoros_auth_user", JSON.stringify(_user));
      scheduleRefresh();
    } catch {
      _user = null;
      _session = null;
      localStorage.removeItem("creatoros_auth_token");
      localStorage.removeItem("creatoros_auth_user");
    }
  } else {
    _user = null;
    _session = null;
    localStorage.removeItem("creatoros_auth_token");
    localStorage.removeItem("creatoros_auth_user");
  }

  _loading = false;
  notifyListeners();
}

// Auto-initialize on import
initAuth();
