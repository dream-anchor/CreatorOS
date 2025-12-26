import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Info, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ModelResponse {
  commentId: string;
  commentText: string;
  commenterUsername: string;
  responses: Record<string, string>;
}

const MODELS = [
  { id: "google/gemini-2.5-flash", name: "Gemini Flash", color: "emerald" },
  { id: "google/gemini-2.5-pro", name: "Gemini Pro", color: "blue" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", color: "orange" },
  { id: "openai/gpt-5", name: "GPT-5", color: "purple" },
];

const CACHE_KEY = "ai_model_simulation_cache";

interface CachedData {
  results: ModelResponse[];
  timestamp: number;
}

function loadFromCache(): { results: ModelResponse[]; timestamp: number } | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data: CachedData = JSON.parse(cached);
      return { results: data.results, timestamp: data.timestamp };
    }
  } catch (e) {
    console.error("Error loading cache:", e);
  }
  return null;
}

function saveToCache(results: ModelResponse[]) {
  try {
    const data: CachedData = { results, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Error saving cache:", e);
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {
    console.error("Error clearing cache:", e);
  }
}

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  if (diffDays === 1) return "gestern";
  return `vor ${diffDays} Tagen`;
}

export function ModelComparisonModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ModelResponse[]>([]);
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const initializedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const loadComparison = async (forceRefresh = false) => {
    // Prevent duplicate requests
    if (loadingRef.current) {
      console.log("Already loading, skipping...");
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = loadFromCache();
      if (cached && cached.results.length > 0) {
        console.log("Loading from cache:", cached.results.length, "results");
        setResults(cached.results);
        setCacheTimestamp(cached.timestamp);
        setError(null);
        return;
      }
    }

    // Clear cache on force refresh
    if (forceRefresh) {
      clearCache();
      setCacheTimestamp(null);
    }

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      console.log("Starting simulate-model-responses call...");
      
      const { data, error: fnError } = await supabase.functions.invoke(
        "simulate-model-responses"
      );

      console.log("Response received:", { data, error: fnError });

      if (fnError) {
        console.error("Function error:", fnError);
        setError("Fehler beim Laden der Vergleichsdaten");
        return;
      }

      if (data?.error) {
        if (data.error === "No comments found") {
          setError("Keine unbeantworteten Kommentare gefunden. Synchronisiere zuerst neue Kommentare.");
        } else {
          setError(data.error);
        }
        return;
      }

      if (data?.results) {
        setResults(data.results);
        saveToCache(data.results);
        setCacheTimestamp(Date.now());
      } else {
        setError("Keine Ergebnisse erhalten");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        console.log("Request aborted");
        return;
      }
      console.error("Error loading comparison:", err);
      setError("Unerwarteter Fehler beim Laden");
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && !initializedRef.current) {
      initializedRef.current = true;
      loadComparison(false); // Try cache first
    } else if (!open) {
      // Abort on close
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      loadingRef.current = false;
    }
  };

  const handleRefresh = () => {
    loadComparison(true); // Force refresh, ignore cache
  };

  const getModelColor = (modelId: string) => {
    const model = MODELS.find((m) => m.id === modelId);
    return model?.color || "gray";
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Modelle live vergleichen"
        >
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">
                Live-Modell-Vergleich
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Echte Kommentare, echte Antworten von allen 4 Modellen
                {cacheTimestamp && !isLoading && (
                  <span className="ml-2 text-xs opacity-70">
                    · Erstellt: {formatTimestamp(cacheTimestamp)}
                  </span>
                )}
              </p>
            </div>
            {!isLoading && results.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Neue Beispiele laden
              </Button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="p-6">
            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="relative">
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-foreground">
                    Simuliere Antworten mit Gemini & GPT...
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Dies kann 10-20 Sekunden dauern
                  </p>
                </div>
                <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <div className="text-center">
                  <p className="font-medium text-foreground">{error}</p>
                </div>
                <Button variant="outline" onClick={handleRefresh} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Erneut versuchen
                </Button>
              </div>
            )}

            {/* Results Matrix */}
            {!isLoading && !error && results.length > 0 && (
              <div className="space-y-6">
                {/* Model Headers - Fixed sticky header */}
                <div className="grid grid-cols-5 gap-3 pb-4 border-b border-border mb-4 sticky top-0 bg-background z-10">
                  <div className="font-semibold text-sm text-foreground">
                    Fan-Kommentar
                  </div>
                  {MODELS.map((model) => (
                    <div key={model.id} className="text-center">
                      <div className={`
                        inline-block px-3 py-1.5 rounded-lg font-semibold text-sm
                        ${model.color === "emerald" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : ""}
                        ${model.color === "blue" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" : ""}
                        ${model.color === "orange" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400" : ""}
                        ${model.color === "purple" ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400" : ""}
                      `}>
                        {model.name}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Comparison Rows */}
                {results.map((result, index) => (
                  <div
                    key={result.commentId}
                    className={`grid grid-cols-5 gap-3 p-4 rounded-xl ${
                      index % 2 === 0 ? "bg-muted/30" : "bg-muted/10"
                    }`}
                  >
                    {/* Comment Column */}
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        @{result.commenterUsername}
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">
                        "{result.commentText}"
                      </p>
                    </div>

                    {/* Model Response Columns */}
                    {MODELS.map((model) => (
                      <div
                        key={model.id}
                        className={`
                          text-sm p-3 rounded-lg border leading-relaxed
                          ${model.color === "emerald" ? "bg-emerald-500/5 border-emerald-500/20" : ""}
                          ${model.color === "blue" ? "bg-blue-500/5 border-blue-500/20" : ""}
                          ${model.color === "orange" ? "bg-orange-500/5 border-orange-500/20" : ""}
                          ${model.color === "purple" ? "bg-purple-500/5 border-purple-500/20" : ""}
                        `}
                      >
                        {/* Fallback header (useful if the sticky header is out of view) */}
                        <div className="text-[11px] font-medium text-muted-foreground mb-2 md:hidden">
                          {model.name}
                        </div>
                        {result.responses[model.id] || "—"}
                      </div>
                    ))}
                  </div>
                ))}

                {/* Recommendation */}
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mt-6">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    💡 Tipp zur Auswahl
                  </h4>
                  <div className="text-sm text-muted-foreground grid grid-cols-2 gap-3">
                    <p>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">Gemini Flash:</span>{" "}
                      Schnell & ausgewogen - Ideal für hohe Volumen
                    </p>
                    <p>
                      <span className="font-medium text-blue-600 dark:text-blue-400">Gemini Pro:</span>{" "}
                      Beste Qualität - Für wichtige Konversationen
                    </p>
                    <p>
                      <span className="font-medium text-orange-600 dark:text-orange-400">GPT-5 Mini:</span>{" "}
                      Kurz & prägnant - Für schnelle Reaktionen
                    </p>
                    <p>
                      <span className="font-medium text-purple-600 dark:text-purple-400">GPT-5:</span>{" "}
                      Maximale Präzision - Für komplexe Themen
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
