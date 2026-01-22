import { useSyncExternalStore } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Cache for session state to prevent flash on page reload
let cachedSession: Session | null = null;
let cachedUser: User | null = null;
let isInitialized = false;
let listeners: Set<() => void> = new Set();

// Cached snapshot object - only recreate when values change
let cachedSnapshot = { user: cachedUser, session: cachedSession, loading: !isInitialized };

function updateSnapshot() {
  cachedSnapshot = { user: cachedUser, session: cachedSession, loading: !isInitialized };
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return cachedSnapshot;
}

// Initialize auth state once
if (!isInitialized) {
  // Check localStorage for existing session hint
  const storedSession = localStorage.getItem("sb-utecdkwvjraucimdflnw-auth-token");
  if (storedSession) {
    try {
      const parsed = JSON.parse(storedSession);
      if (parsed?.user) {
        cachedUser = parsed.user;
        cachedSession = parsed;
        updateSnapshot();
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Set up auth listener
  supabase.auth.onAuthStateChange((event, session) => {
    cachedSession = session;
    cachedUser = session?.user ?? null;
    isInitialized = true;
    updateSnapshot();
    listeners.forEach(listener => listener());
  });

  // Get actual session
  supabase.auth.getSession().then(({ data: { session } }) => {
    cachedSession = session;
    cachedUser = session?.user ?? null;
    isInitialized = true;
    updateSnapshot();
    listeners.forEach(listener => listener());
  });
}

export function useAuth() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return state;
}
