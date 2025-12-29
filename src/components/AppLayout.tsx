import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "./ThemeToggle";
import { CoPilot } from "./community/CoPilot";
import { Button } from "./ui/button";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function AppLayout({ children, title, description, actions }: AppLayoutProps) {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Erfolgreich abgemeldet");
    navigate("/login");
  };

  return (
    <div className="min-h-screen relative bg-background">
      {/* Aurora Background Effects - only in dark mode */}
      <div className="aurora-container dark:block hidden">
        <div className="aurora-blob aurora-blob-1 animate-aurora" />
        <div className="aurora-blob aurora-blob-2 animate-aurora" />
        <div className="aurora-blob aurora-blob-3 animate-aurora" />
      </div>

      <AppSidebar />
      
      <main className="pl-72 relative z-10">
        <div className="p-10">
          {/* Header */}
          <div className="mb-10 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground font-display tracking-tight">
                {title}
              </h1>
              {description && (
                <p className="mt-2 text-base text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              {actions}
              <ThemeToggle />
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-foreground"
                title="Abmelden"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
          
          {/* Content */}
          <div className="animate-fade-in">
            {children}
          </div>
        </div>
      </main>
      
      {/* Global Co-Pilot AI Agent */}
      <CoPilot />
    </div>
  );
}