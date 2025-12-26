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
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success("Konto erstellt! Du kannst dich jetzt anmelden.");
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Erfolgreich angemeldet!");
        navigate("/dashboard");
      }
    } catch (error: any) {
      if (error.message === "User already registered") {
        toast.error("Diese E-Mail ist bereits registriert");
      } else if (error.message === "Invalid login credentials") {
        toast.error("Ungültige Anmeldedaten");
      } else {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen relative">
      {/* Aurora Background Effects */}
      <div className="aurora-container">
        <div className="aurora-blob aurora-blob-1 animate-aurora" />
        <div className="aurora-blob aurora-blob-2 animate-aurora" />
        <div className="aurora-blob aurora-blob-3 animate-aurora" />
      </div>

      {/* Left side - Form */}
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-8 lg:px-16 relative z-10">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-4 mb-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-sm border border-white/10 shadow-glow-sm">
              <Instagram className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground font-display tracking-tight">IG Autopublisher</h1>
              <p className="text-sm text-muted-foreground">v1.0</p>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-foreground mb-3 font-display tracking-tight">
            {isSignUp ? "Konto erstellen" : "Willkommen zurück"}
          </h2>
          <p className="text-muted-foreground mb-10">
            {isSignUp
              ? "Erstelle dein Konto, um loszulegen"
              : "Melde dich an, um fortzufahren"}
          </p>

          <form onSubmit={handleAuth} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">E-Mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@beispiel.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignUp ? "Registrieren" : "Anmelden"}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {isSignUp ? "Schon ein Konto?" : "Noch kein Konto?"}{" "}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {isSignUp ? "Anmelden" : "Registrieren"}
            </button>
          </p>
        </div>
      </div>

      {/* Right side - Branding */}
      <div className="hidden lg:flex w-1/2 flex-col items-center justify-center p-16 relative z-10">
        <div className="max-w-md text-center">
          <div className="mb-10 flex justify-center">
            <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-xl border border-white/10 shadow-glow-md animate-glow">
              <Instagram className="h-14 w-14 text-primary" />
            </div>
          </div>
          <h2 className="text-4xl font-bold text-foreground mb-5 font-display tracking-tight">
            Automatisiere deinen Instagram Content
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            KI-gestützte Caption-Generierung, Brand Guidelines, und geplantes Publishing – alles an einem Ort.
          </p>
        </div>
      </div>
    </div>
  );
}