import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AI_MODELS } from "@/components/community/AiModelSelector";

interface GenerationProgress {
  current: number;
  total: number;
}

interface GenerationContextValue {
  isGenerating: boolean;
  progress: GenerationProgress | null;
  currentModel: string | null;
  error: string | null;
  startGeneration: (commentIds: string[], model: string, onBatchComplete?: () => void) => void;
  cancelGeneration: () => void;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

export function useGenerationContext() {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error("useGenerationContext must be used within a GenerationProvider");
  }
  return context;
}

interface GenerationProviderProps {
  children: ReactNode;
}

export function GenerationProvider({ children }: GenerationProviderProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const isCancelledRef = useRef(false);
  const onBatchCompleteRef = useRef<(() => void) | undefined>(undefined);

  const chunkArray = <T,>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  };

  const startGeneration = useCallback((commentIds: string[], model: string, onBatchComplete?: () => void) => {
    if (isGenerating) {
      toast.info("Generierung läuft bereits");
      return;
    }

    if (commentIds.length === 0) {
      toast.info("Alle Kommentare haben bereits Antworten");
      return;
    }

    isCancelledRef.current = false;
    onBatchCompleteRef.current = onBatchComplete;
    setIsGenerating(true);
    setCurrentModel(model);
    setError(null);
    setProgress({ current: 0, total: commentIds.length });

    const modelName = AI_MODELS.find(m => m.id === model)?.name || model;
    const BATCH_SIZE = 10;
    const batches = chunkArray(commentIds, BATCH_SIZE);

    toast.info(`🧠 Starte Generierung von ${commentIds.length} Antworten in ${batches.length} Batches...`);

    // Run generation in background (not blocking)
    (async () => {
      let totalSuccess = 0;
      let totalErrors = 0;

      try {
        for (let i = 0; i < batches.length; i++) {
          if (isCancelledRef.current) {
            toast.info(`Generierung abgebrochen nach ${totalSuccess} Antworten`);
            break;
          }

          const batch = batches[i];
          const currentProgress = i * BATCH_SIZE;
          
          setProgress({ 
            current: currentProgress, 
            total: commentIds.length 
          });

          console.log(`[GenerationContext] Processing batch ${i + 1}/${batches.length} (${batch.length} comments)`);

          try {
            const { data, error: batchError } = await supabase.functions.invoke("batch-generate-replies", {
              body: { comment_ids: batch, model },
            });

            if (batchError) {
              console.error(`[GenerationContext] Batch ${i + 1} error:`, batchError);
              totalErrors += batch.length;
            } else {
              const successCount = data?.successCount || 0;
              totalSuccess += successCount;
              totalErrors += (batch.length - successCount);
              console.log(`[GenerationContext] Batch ${i + 1} completed: ${successCount} successes`);
            }
          } catch (err) {
            console.error(`[GenerationContext] Batch ${i + 1} failed:`, err);
            totalErrors += batch.length;
          }

          // Notify parent to refresh data
          onBatchCompleteRef.current?.();

          // Small delay between batches
          if (i < batches.length - 1 && !isCancelledRef.current) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        setProgress({ current: commentIds.length, total: commentIds.length });

        if (!isCancelledRef.current) {
          if (totalErrors === 0) {
            toast.success(`✨ Alle ${totalSuccess} Antworten erfolgreich generiert!`);
          } else {
            toast.success(`✨ ${totalSuccess} Antworten generiert, ${totalErrors} Fehler`);
          }
        }
      } catch (err) {
        console.error("Generation error:", err);
        setError("Fehler bei der Generierung");
        toast.error("Fehler bei der Generierung");
      } finally {
        setIsGenerating(false);
        setProgress(null);
      }
    })();
  }, [isGenerating]);

  const cancelGeneration = useCallback(() => {
    isCancelledRef.current = true;
    toast.info("Generierung wird abgebrochen...");
  }, []);

  return (
    <GenerationContext.Provider
      value={{
        isGenerating,
        progress,
        currentModel,
        error,
        startGeneration,
        cancelGeneration,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
}
