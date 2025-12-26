import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

interface GreetingHeaderProps {
  userName?: string;
}

const TIPS = [
  "Konsistenz schlägt Perfektion. Poste regelmäßig, auch wenn nicht jeder Post perfekt ist.",
  "Authentizität gewinnt. Deine Follower wollen den echten dich sehen.",
  "Die erste Zeile entscheidet. Investiere Zeit in deinen Hook.",
  "Interaktion ist alles. Antworte auf jeden Kommentar.",
  "Qualität vor Quantität. Lieber weniger, dafür bessere Posts.",
  "Storytelling verbindet. Erzähle Geschichten, nicht nur Fakten.",
  "Timing matters. Poste, wenn deine Audience aktiv ist.",
  "Behind the scenes funktioniert immer. Zeig deinen Prozess.",
];

export function GreetingHeader({ userName }: GreetingHeaderProps) {
  const [tip, setTip] = useState("");

  useEffect(() => {
    const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)];
    setTip(randomTip);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Guten Morgen";
    if (hour < 18) return "Guten Tag";
    return "Guten Abend";
  };

  const displayName = userName || "Creator";

  return (
    <div className="space-y-3">
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
        {getGreeting()},{" "}
        <span className="bg-gradient-to-r from-primary via-cyan-400 to-violet-400 bg-clip-text text-transparent">
          {displayName}
        </span>
      </h1>
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-cyan-500/10 to-violet-500/10 border border-white/10 backdrop-blur-sm max-w-2xl">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">Tipp des Tages:</span> {tip}
        </p>
      </div>
    </div>
  );
}
