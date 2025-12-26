import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rocket, PlayCircle, RefreshCw } from "lucide-react";

type SmartStrategy = "warmup" | "afterglow" | "natural" | null;

interface ActionBarProps {
  selectedCount: number;
  totalCount: number;
  smartStrategy: SmartStrategy;
  sending: boolean;
  onSmartReply: () => void;
  onTestRun: () => void;
}

export function ActionBar({
  selectedCount,
  totalCount,
  smartStrategy,
  sending,
  onSmartReply,
  onTestRun,
}: ActionBarProps) {
  const getStrategyInfo = () => {
    switch (smartStrategy) {
      case "warmup":
        return { icon: "🔥", label: "Warm-Up", color: "bg-orange-500/10 text-orange-500 border-orange-500/30" };
      case "afterglow":
        return { icon: "✨", label: "After-Glow", color: "bg-violet-500/10 text-violet-500 border-violet-500/30" };
      default:
        return { icon: "🌿", label: "Natürlich", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" };
    }
  };

  const strategyInfo = getStrategyInfo();

  if (totalCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="max-w-5xl mx-auto px-6 pb-6">
        <div className="pointer-events-auto flex items-center justify-between gap-4 p-4 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-lg">
          {/* Left side: Info */}
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="font-semibold text-foreground">{selectedCount}</span>
              <span className="text-muted-foreground"> von {totalCount} Antworten bereit</span>
            </div>
            
            {smartStrategy && (
              <Badge variant="outline" className={`text-xs ${strategyInfo.color}`}>
                {strategyInfo.icon} {strategyInfo.label}
              </Badge>
            )}
          </div>

          {/* Right side: Actions */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onTestRun}
              disabled={selectedCount === 0 || sending}
              className="h-10 px-4 gap-2"
            >
              <PlayCircle className="h-4 w-4" />
              Test-Lauf
            </Button>

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
