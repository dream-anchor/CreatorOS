import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Instagram, Loader2 } from "lucide-react";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(6, "Passwort muss mindestens 6 Zeichen haben"),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Erfolgreich angemeldet!");
      navigate("/dashboard");
    } catch (error: any) {
      if (error.message === "Invalid login credentials") {
        toast.error("Ungültige Anmeldedaten");
      } else {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen relative flex-col lg:flex-row">
      {/* Aurora Background Effects */}
      <div className="aurora-container">
        <div className="aurora-blob aurora-blob-1 animate-aurora" />
        <div className="aurora-blob aurora-blob-2 animate-aurora" />
        <div className="aurora-blob aurora-blob-3 animate-aurora" />
      </div>

      {/* Mobile Header - only visible on small screens */}
      <div className="lg:hidden flex items-center justify-center pt-8 pb-4 px-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-sm border border-white/10 shadow-glow-sm">
            <Instagram className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground font-display tracking-tight">CreatorOS</h1>
            <p className="text-xs text-muted-foreground">v1.0</p>
          </div>
        </div>
      </div>

      {/* Left side - Form */}
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-4 sm:px-8 lg:px-16 py-8 lg:py-0 relative z-10">
        <div className="mx-auto w-full max-w-md">
          {/* Desktop Logo - hidden on mobile */}
          <div className="hidden lg:flex items-center gap-4 mb-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-sm border border-white/10 shadow-glow-sm">
              <Instagram className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground font-display tracking-tight">CreatorOS</h1>
              <p className="text-sm text-muted-foreground">v1.0</p>
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 sm:mb-3 font-display tracking-tight text-center lg:text-left">
            Willkommen zurück
          </h2>
          <p className="text-muted-foreground mb-6 sm:mb-10 text-sm sm:text-base text-center lg:text-left">
            Melde dich an, um fortzufahren
          </p>

          <form onSubmit={handleAuth} className="space-y-4 sm:space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">E-Mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@beispiel.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 sm:h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Passwort</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 sm:h-10"
              />
            </div>

            <Button type="submit" className="w-full h-11 sm:h-10 text-base sm:text-sm" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Anmelden
            </Button>
          </form>
        </div>
      </div>

      {/* Right side - Branding (hidden on mobile/tablet) */}
      <div className="hidden lg:flex w-1/2 flex-col items-center justify-center p-8 xl:p-16 relative z-10">
        <div className="max-w-md text-center">
          <div className="mb-8 xl:mb-10 flex justify-center">
            <div className="flex h-20 w-20 xl:h-28 xl:w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-xl border border-white/10 shadow-glow-md animate-glow">
              <Instagram className="h-10 w-10 xl:h-14 xl:w-14 text-primary" />
            </div>
          </div>
          <h2 className="text-2xl xl:text-4xl font-bold text-foreground mb-4 xl:mb-5 font-display tracking-tight">
            Automatisiere deinen Instagram Content
          </h2>
          <p className="text-base xl:text-lg text-muted-foreground leading-relaxed">
            KI-gestützte Caption-Generierung, Brand Guidelines, und geplantes Publishing – alles an einem Ort.
          </p>
        </div>
      </div>

      {/* Mobile Footer Branding */}
      <div className="lg:hidden flex flex-col items-center justify-center p-6 pb-8 relative z-10">
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          KI-gestützte Caption-Generierung und geplantes Publishing.
        </p>
      </div>
    </div>
  );
}