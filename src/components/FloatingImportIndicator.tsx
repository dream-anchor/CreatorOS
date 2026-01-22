import { useImport } from "@/contexts/ImportContext";
import { Loader2, Download, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function FloatingImportIndicator() {
  const { isImporting, statusMessage, importResult } = useImport();

  // Show if importing OR if we have a fresh result (for 3s)
  const isVisible = isImporting || (importResult && statusMessage);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="fixed top-20 right-4 lg:top-6 lg:right-6 z-[60] flex items-center gap-3 px-4 py-3 bg-background/80 backdrop-blur-md border border-primary/20 rounded-full shadow-lg"
        >
          {isImporting ? (
            <div className="relative">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="absolute inset-0 bg-primary/20 blur-lg animate-pulse rounded-full" />
            </div>
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          )}
          
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {statusMessage || (isImporting ? "Import läuft..." : "Fertig!")}
            </span>
            {isImporting && (
              <span className="text-xs text-muted-foreground">
                Bitte Seite nicht schließen
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
