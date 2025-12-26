import { useState } from "react";
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

export function ModelComparisonModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ModelResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadComparison = async () => {
    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "simulate-model-responses"
      );

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
      }
    } catch (err) {
      console.error("Error loading comparison:", err);
      setError("Unerwarteter Fehler beim Laden");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      loadComparison();
    }
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
              </p>
            </div>
            {!isLoading && results.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={loadComparison}
                className="gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Neu laden
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
                <Button variant="outline" onClick={loadComparison} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Erneut versuchen
                </Button>
              </div>
            )}

            {/* Results Matrix */}
            {!isLoading && !error && results.length > 0 && (
              <div className="space-y-6">
                {/* Model Headers */}
                <div className="grid grid-cols-5 gap-3">
                  <div className="font-medium text-sm text-muted-foreground">
                    Fan-Kommentar
                  </div>
                  {MODELS.map((model) => (
                    <div key={model.id} className="text-center">
                      <Badge
                        variant="secondary"
                        className={`
                          ${model.color === "emerald" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : ""}
                          ${model.color === "blue" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" : ""}
                          ${model.color === "orange" ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" : ""}
                          ${model.color === "purple" ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" : ""}
                          border
                        `}
                      >
                        {model.name}
                      </Badge>
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
