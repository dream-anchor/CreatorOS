import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface NavigationContextType {
  navigateTo: (path: string) => void;
  currentIntent: string | null;
  setIntent: (intent: string | null) => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [currentIntent, setCurrentIntent] = useState<string | null>(null);

  const navigateTo = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  const setIntent = useCallback((intent: string | null) => {
    setCurrentIntent(intent);
  }, []);

  return (
    <NavigationContext.Provider value={{ navigateTo, currentIntent, setIntent }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return context;
}

// Intent to route mapping
export const intentRouteMap: Record<string, string> = {
  "kommentare": "/community",
  "community": "/community",
  "feedback": "/community",
  "antworten": "/community",
  "planung": "/calendar",
  "kalender": "/calendar",
  "calendar": "/calendar",
  "terminplan": "/calendar",
  "bilder": "/media",
  "fotos": "/media",
  "media": "/media",
  "archiv": "/media",
  "analytics": "/analytics",
  "statistik": "/analytics",
  "performance": "/analytics",
  "zahlen": "/analytics",
  "einstellungen": "/settings",
  "settings": "/settings",
  "generator": "/generator",
  "erstellen": "/generator",
  "neuer post": "/generator",
  "post erstellen": "/generator",
  "review": "/review",
  "prüfen": "/review",
  "freigabe": "/review",
  "home": "/dashboard",
  "start": "/dashboard",
  "dashboard": "/dashboard",
};

// Parse user message for navigation intent
// Conservative approach: only navigate for short, explicit commands
export function parseNavigationIntent(message: string): string | null {
  const trimmed = message.trim();
  const lowerMessage = trimmed.toLowerCase();
  
  // Tokenize: split on non-alphanumeric (incl. German chars)
  const tokens = lowerMessage.split(/[^a-z0-9äöüß]+/).filter(Boolean);
  const wordCount = tokens.length;
  
  // GUARD: If message is long/content-rich, never navigate
  // This prevents AI prompts from being hijacked
  if (trimmed.length > 80 || wordCount > 10) {
    return null;
  }
  
  // Check for explicit navigation patterns (verbs + target)
  const explicitPatterns = [
    /^(?:zeig|öffne|geh zu|navigiere zu|show|open|go to)\s+(?:mir\s+)?(?:die\s+)?(.+)$/i,
    /^(?:zur?|to)\s+(.+)$/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = lowerMessage.match(pattern);
    if (match) {
      const intent = match[1].trim();
      for (const [key, route] of Object.entries(intentRouteMap)) {
        if (intent.includes(key)) {
          return route;
        }
      }
    }
  }

  // Direct keyword matching - ONLY for very short messages (≤ 3 words)
  // and the token must exactly match a key
  if (wordCount <= 3) {
    for (const [key, route] of Object.entries(intentRouteMap)) {
      // Exact token match (not substring)
      if (tokens.includes(key)) {
        return route;
      }
    }
  }

  return null;
}
