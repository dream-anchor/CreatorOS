import { Button } from "@/components/ui/button";
import { Rocket, RefreshCw } from "lucide-react";

interface ActionBarProps {
  selectedCount: number;
  totalCount: number;
  sending: boolean;
  onSmartReply: () => void;
}

export function ActionBar({
  selectedCount,
  totalCount,
  sending,
  onSmartReply,
}: ActionBarProps) {
  if (totalCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Solid background bar */}
      <div className="bg-background/95 backdrop-blur-md border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.15)]">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left side: Simple count */}
            <div className="text-sm text-foreground">
              <span className="font-semibold">{selectedCount}</span>
              <span className="text-muted-foreground"> Entwürfe bereit zur Freigabe</span>
            </div>

            {/* Right side: Main action button */}
            <Button
              size="lg"
              onClick={onSmartReply}
              disabled={selectedCount === 0 || sending}
              className="h-11 px-6 gap-2 font-semibold shadow-md hover:shadow-lg transition-shadow"
            >
              {sending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Sende...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Smart Reply starten
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
