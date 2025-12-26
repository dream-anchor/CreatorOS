import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Palette,
  MessageSquare,
  Sparkles,
  ClipboardCheck,
  Calendar,
  Settings,
  ScrollText,
  Instagram,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Marke & Regeln", href: "/brand", icon: Palette },
  { name: "Themen", href: "/topics", icon: MessageSquare },
  { name: "Generator", href: "/generator", icon: Sparkles },
  { name: "Review", href: "/review", icon: ClipboardCheck },
  { name: "Kalender", href: "/calendar", icon: Calendar },
  { name: "Logs", href: "/logs", icon: ScrollText },
];

const settingsNav = [
  { name: "Meta Verbindung", href: "/settings/meta", icon: Instagram },
  { name: "Einstellungen", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Erfolgreich abgemeldet");
    navigate("/login");
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-72 bg-sidebar/80 backdrop-blur-2xl border-r border-white/5">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-20 items-center gap-4 px-6 border-b border-white/5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-sm border border-white/10 shadow-glow-sm">
            <Instagram className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-semibold text-lg text-foreground tracking-tight">
              IG Autopublisher
            </h1>
            <p className="text-xs text-muted-foreground">AI Content Studio</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 px-4 py-6 overflow-y-auto scrollbar-thin">
          <div className="mb-6">
            <p className="px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70 mb-3">
              Haupt
            </p>
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-white/10 text-foreground shadow-glow-sm border border-white/10"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <item.icon className={cn(
                    "h-4.5 w-4.5 transition-colors", 
                    isActive ? "text-primary" : "text-muted-foreground"
                  )} />
                  {item.name}
                </Link>
              );
            })}
          </div>

          <div>
            <p className="px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70 mb-3">
              Einstellungen
            </p>
            {settingsNav.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-white/10 text-foreground shadow-glow-sm border border-white/10"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <item.icon className={cn(
                    "h-4.5 w-4.5 transition-colors", 
                    isActive ? "text-primary" : "text-muted-foreground"
                  )} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-white/5 p-4">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all duration-200"
          >
            <LogOut className="h-4.5 w-4.5" />
            Abmelden
          </button>
        </div>
      </div>
    </aside>
  );
}