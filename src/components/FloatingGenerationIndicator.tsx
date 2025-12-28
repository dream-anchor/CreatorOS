import { useGenerationContext } from "@/contexts/GenerationContext";
import { Brain, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export function FloatingGenerationIndicator() {
  const { isGenerating, progress, cancelGeneration } = useGenerationContext();
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show on community page (it has its own indicator)
  if (!isGenerating || !progress || location.pathname === "/community") {
    return null;
  }

  const percentage = Math.round((progress.current / progress.total) * 100);

  return (
    <div className="fixed bottom-20 right-4 z-50 animate-in slide-in-from-right-5 fade-in duration-300">
      <div 
        className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-3 cursor-pointer hover:bg-card transition-colors"
        onClick={() => navigate("/community")}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Brain className="h-5 w-5 text-primary animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Generiere Antworten
            </p>
            <p className="text-xs text-muted-foreground">
              {progress.current} / {progress.total}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mini progress ring */}
            <div className="relative w-8 h-8">
              <svg className="w-8 h-8 -rotate-90">
                <circle
                  cx="16"
                  cy="16"
                  r="12"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  className="text-muted"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="12"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray={75.4}
                  strokeDashoffset={75.4 - (75.4 * percentage) / 100}
                  className="text-primary transition-all duration-300"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
                {percentage}%
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                cancelGeneration();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
