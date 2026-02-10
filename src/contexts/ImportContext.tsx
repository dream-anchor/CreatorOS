import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { toast } from "sonner";
import { apiGet, invokeFunction } from "@/lib/api";
import { getUser } from "@/lib/auth";

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
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // Load last import status on mount
  React.useEffect(() => {
    const loadLastImport = async () => {
      const user = getUser();
      if (!user) return;

      // Get last sync time
      let settings: any = null;
      try {
        settings = await apiGet<any>("/api/settings");
      } catch {}

      if (settings?.settings?.last_sync_at) {
        setLastSyncAt(settings.settings.last_sync_at);

        // Try to get details from logs
        let logs: any = null;
        try {
          const logsArr = await apiGet<any[]>("/api/logs", {
            event_types: "instagram_history_imported,instagram_smart_sync",
            limit: "1",
          });
          logs = logsArr?.[0] || null;
        } catch {}

        if (logs?.details) {
          const details = logs.details as any;
          // Reconstruct a partial result for display
          setImportResult({
            success: true,
            imported: details.total_fetched || details.synced_count || 0,
            pages_fetched: details.pages_fetched || 0,
            unicorn_count: details.unicorn_count || 0,
            top_score_threshold: details.top_1_percent_threshold || 0,
            message: `Letzter Import: ${new Date(logs.created_at).toLocaleDateString()}`
          });
        }
      }
    };
    
    loadLastImport();
  }, []);

  const startImport = useCallback(async () => {
    if (isImporting) return;

    setIsImporting(true);
    setImportResult(null);
    setProgress(10);
    
    // Determine mode based on last sync
    // If we have synced before, we use 'sync_recent' (default 50 posts) but maybe expand it if user wants deeper?
    // For now, let's stick to 'full' but with pagination to be safe, OR 'sync_recent' if just updating.
    // User requested: "only import posts... that haven't been imported yet".
    // Since 'fetch-instagram-history' with 'full' mode uses upsert, it handles existing posts fine.
    // But to save time, we can default to 'sync_recent' if lastSyncAt is recent (< 7 days?).
    // For this specific request, let's keep 'full' to ensure we get everything, but rely on the new pagination to not timeout.
    
    // Actually, to fix the "200 limit" issue, we MUST ensure the pagination continues.
    // And to satisfy "only new", we could use 'sync_recent' if lastSyncAt exists.
    // Let's use 'full' to guarantee consistency but the pagination loop handles the volume.
    
    const mode = lastSyncAt ? 'sync_recent' : 'full';
    // If user wants DEEP scan, they can use a different button? For now, standard behavior.
    // Wait, user said "only import... not yet imported". 'sync_recent' fetches 50. 
    // If user has 2000 posts and only 200 imported, 'sync_recent' won't get the rest.
    // So we should stick to 'full' (which iterates everything) but maybe stop if we see old posts?
    // The current backend doesn't support "stop at old".
    // Let's stick to 'full' for now to ensure we get the missing posts > 200.
    
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
      
      let totalImported = 0;
      let nextCursor: string | undefined = undefined;
      let hasMore = true;
      let batchCount = 0;
      
      while (hasMore) {
        batchCount++;
        setStatusMessage(`Importiere Batch ${batchCount}... (${totalImported} bisher)`);
        
        const { data, error } = await invokeFunction('fetch-instagram-history', {
          body: {
            cursor: nextCursor,
            mode: 'full'
          }
        });

        if (error) {
          console.error("Import error details:", error);
          throw error;
        }
        
        const result = data as ImportResult & { paging?: { next?: string, has_more?: boolean } };
        
        if (!result.success) {
          throw new Error(result.message || "Import fehlgeschlagen");
        }
        
        totalImported += result.imported;
        
        // Update result state to show accumulated progress
        setImportResult(prev => ({
          ...result,
          imported: totalImported,
          // Keep the unicorn count from the latest batch or sum it up? 
          // For now, let's just show the latest batch's analysis or sum if needed.
          // Ideally, we'd sum it up, but the edge function returns independent stats.
          // Let's accumulate unicorn count too.
          unicorn_count: (prev?.unicorn_count || 0) + result.unicorn_count
        }));

        // Check pagination
        if (result.paging && result.paging.has_more && result.paging.next) {
          nextCursor = result.paging.next;
          hasMore = true;
          // Small delay to be nice to the API/server
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          hasMore = false;
        }
        
        // Update progress bar
        setProgress(Math.min(90, 10 + (batchCount * 10)));
      }

      clearInterval(progressInterval);
      setProgress(90);
      
      if (totalImported > 0) {
        toast.success(`${totalImported} Posts erfolgreich importiert!`);
        
        // Auto-trigger style analysis
        setProgress(95);
        setStatusMessage("Analysiere Stil-DNA...");
        
        try {
          const { error: analyzeError } = await invokeFunction('analyze-style', { body: {} });
          if (!analyzeError) {
            toast.success("Stil-Profil aktualisiert!");
          }
        } catch (styleErr) {
          console.error("Style analysis error:", styleErr);
        }
      } else {
        toast.info("Keine neuen Posts gefunden");
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
      
      // Check for specific error types and provide helpful messages
      if (message.includes('504') || message.includes('timeout') || message.includes('Timeout')) {
        message = "Der Import dauert länger als erwartet. Bitte warte 1-2 Minuten und lade die Seite neu - die Daten werden im Hintergrund importiert.";
      } else if (message.includes('Unauthorized') || message.includes('401')) {
        message = "Sitzung abgelaufen. Bitte melde dich erneut an und versuche es noch einmal.";
      } else if (message.includes('Failed to send a request') || message.includes('FunctionsHttpError')) {
        // Check if it's actually a server error vs connection error
        if (err.context?.status === 504 || err.context?.status === 502) {
          message = "Der Server ist überlastet. Bitte versuche es in einer Minute erneut.";
        } else if (err.context?.status === 401 || err.context?.status === 403) {
          message = "Sitzung abgelaufen. Bitte melde dich erneut an.";
        } else {
          message = "Verbindungsfehler beim Import. Bitte überprüfe deine Internetverbindung und versuche es erneut.";
        }
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
