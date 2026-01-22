import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ImportResult {
  success: boolean;
  imported: number;
  pages_fetched: number;
  unicorn_count: number;
  top_score_threshold: number;
  best_performer?: {
    caption_preview: string;
    likes: number;
    comments: number;
    score: number;
    image_url?: string;
  };
  message: string;
}

interface ImportContextType {
  isImporting: boolean;
  progress: number;
  importResult: ImportResult | null;
  startImport: () => Promise<void>;
  statusMessage: string;
}

const ImportContext = createContext<ImportContextType | undefined>(undefined);

export function ImportProvider({ children }: { children: ReactNode }) {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const startImport = useCallback(async () => {
    if (isImporting) return;

    setIsImporting(true);
    setImportResult(null);
    setProgress(10);
    setStatusMessage("Starte Import...");

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) return prev;
        return prev + 5;
      });
    }, 2000);

    try {
      setStatusMessage("Hole Daten von Instagram...");
      const { data, error } = await supabase.functions.invoke('fetch-instagram-history', {});

      clearInterval(progressInterval);
      setProgress(90);

      if (error) {
        console.error("Import error details:", error);
        throw error;
      }
      
      const result = data as ImportResult;
      
      if (!result.success) {
        throw new Error(result.message || "Import fehlgeschlagen");
      }

      setImportResult(result);
      
      if (result.success && result.imported > 0) {
        toast.success(`${result.imported} Posts importiert!`);
        
        // Auto-trigger style analysis
        setProgress(95);
        setStatusMessage("Analysiere Stil-DNA...");
        
        try {
          const { error: analyzeError } = await supabase.functions.invoke('analyze-style', {});
          if (!analyzeError) {
            toast.success("Stil-Profil aktualisiert!");
          }
        } catch (styleErr) {
          console.error("Style analysis error:", styleErr);
        }
      } else {
        toast.info(result.message || "Keine neuen Posts gefunden");
      }
      
      setProgress(100);
    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Full import error object:", err);
      
      // Extract meaningful message from nested error objects
      let message = 'Import fehlgeschlagen';
      
      if (err.message) {
        message = err.message;
      } else if (err.context?.message) {
        message = err.context.message;
      } else if (typeof err === 'string') {
        message = err;
      }
      
      if (message.includes("Failed to send a request to the Edge Function")) {
        message = "Verbindung fehlgeschlagen: Die Funktion 'fetch-instagram-history' ist möglicherweise nicht deployed.";
      }

      toast.error(message);
      setStatusMessage("Fehler: " + message);
    } finally {
      // Keep status visible for a moment
      setTimeout(() => {
        setIsImporting(false);
        setStatusMessage("");
        setProgress(0);
      }, 3000);
    }
  }, [isImporting]);

  return (
    <ImportContext.Provider value={{ isImporting, progress, importResult, startImport, statusMessage }}>
      {children}
    </ImportContext.Provider>
  );
}

export function useImport() {
  const context = useContext(ImportContext);
  if (context === undefined) {
    throw new Error("useImport must be used within an ImportProvider");
  }
  return context;
}
