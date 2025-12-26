import { Link } from "react-router-dom";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

export function GenerateButton() {
  return (
    <Link to="/generator" className="block h-full">
      <div
        className={cn(
          "group relative h-full min-h-[180px] rounded-3xl overflow-hidden",
          "bg-gradient-to-br from-primary/20 via-cyan-500/20 to-violet-500/20",
          "border border-primary/30 hover:border-primary/60",
          "transition-all duration-500 cursor-pointer",
          "hover:shadow-[0_0_60px_-10px_hsl(var(--primary))]",
          "hover:scale-[1.02]"
        )}
      >
        {/* Animated glow background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/5 to-primary/0 group-hover:from-primary/10 group-hover:via-primary/20 group-hover:to-cyan-500/10 transition-all duration-500" />
        
        {/* Sparkle particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                left: `${20 + i * 15}%`,
                top: `${30 + (i % 3) * 20}%`,
                animation: `sparkle 2s ease-in-out ${i * 0.3}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center p-6 text-center">
          <div className="p-4 rounded-2xl bg-primary/20 group-hover:bg-primary/30 transition-colors mb-4 group-hover:scale-110 duration-300">
            <Lightbulb className="h-8 w-8 text-primary group-hover:text-white transition-colors" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">
            ✨ Eine Idee umsetzen
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Erstelle gezielt EINEN Post zu einem Thema deiner Wahl.
          </p>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 text-primary text-sm font-medium group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
            Manuellen Entwurf starten
          </span>
        </div>

        <style>{`
          @keyframes sparkle {
            0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
            50% { transform: scale(1) rotate(180deg); opacity: 1; }
          }
        `}</style>
      </div>
    </Link>
  );
}
