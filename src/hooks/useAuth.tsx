import { useSyncExternalStore } from "react";
import {
  getUser,
  isLoading,
  onAuthChange,
  type AuthUser,
} from "@/lib/auth";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

let cachedSnapshot: AuthState = { user: getUser(), loading: isLoading() };

function updateSnapshot() {
  cachedSnapshot = { user: getUser(), loading: isLoading() };
}

function subscribe(callback: () => void) {
  const unsubscribe = onAuthChange(() => {
    updateSnapshot();
    callback();
  });
  return unsubscribe;
}

function getSnapshot() {
  return cachedSnapshot;
}

export function useAuth() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
