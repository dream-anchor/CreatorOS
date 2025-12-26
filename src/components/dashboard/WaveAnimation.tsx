import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface WaveAnimationProps {
  className?: string;
  color?: string;
}

export function WaveAnimation({ className, color = "primary" }: WaveAnimationProps) {
  const [isAnimating, setIsAnimating] = useState(true);

  // Stop animation after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={cn("flex items-end gap-1 h-8", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 rounded-full bg-gradient-to-t transition-all duration-500",
            color === "primary" && "from-primary/40 to-primary",
            color === "cyan" && "from-cyan-500/40 to-cyan-400",
            color === "violet" && "from-violet-500/40 to-violet-400",
            color === "emerald" && "from-emerald-500/40 to-emerald-400"
          )}
          style={{
            height: isAnimating ? undefined : `${40 + i * 10}%`,
            animation: isAnimating 
              ? `wave 1.2s ease-in-out ${i * 0.1}s infinite alternate`
              : 'none',
          }}
        />
      ))}
      <style>{`
        @keyframes wave {
          0% { height: 20%; }
          100% { height: 100%; }
        }
      `}</style>
    </div>
  );
}
