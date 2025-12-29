import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Sparkles } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Erfolgreich abgemeldet");
    navigate("/login");
  };

  const handleGoToDashboard = () => {
    navigate("/dashboard");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Laden...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 border border-primary/20">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
        </div>
        
        <div>
          <h1 className="mb-2 text-4xl font-bold text-foreground">InstagramGPT</h1>
          <p className="text-lg text-muted-foreground">AI Co-Pilot für deinen Instagram-Erfolg</p>
        </div>

        {user ? (
          <div className="flex flex-col gap-3">
            <Button onClick={handleGoToDashboard} size="lg" className="min-w-[200px]">
              Zum Dashboard
            </Button>
            <Button 
              variant="outline" 
              onClick={handleSignOut}
              className="min-w-[200px] gap-2"
            >
              <LogOut className="h-4 w-4" />
              Abmelden
            </Button>
          </div>
        ) : (
          <Button onClick={() => navigate("/login")} size="lg" className="min-w-[200px]">
            Anmelden
          </Button>
        )}
      </div>
    </div>
  );
};

export default Index;
