import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Sparkles,
  CalendarClock,
  Fingerprint,
  Hash,
  Settings,
  LogOut,
  Zap,
  ClipboardCheck,
  FolderOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const studioNav = [
  { name: "Cockpit", href: "/dashboard", icon: LayoutDashboard },
  { name: "Magic Create", href: "/generator", icon: Sparkles, highlight: true },
  { name: "Tinder Review", href: "/review", icon: ClipboardCheck },
  { name: "Planung", href: "/calendar", icon: CalendarClock },
];

const brandNav = [
  { name: "Meine DNA", href: "/brand", icon: Fingerprint },
  { name: "Themen", href: "/topics", icon: Hash },
  { name: "Content-Pool", href: "/library", icon: FolderOpen },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Erfolgreich abgemeldet");
    navigate("/login");
  };

  const NavItem = ({ item }: { item: typeof studioNav[0] }) => {
    const isActive = location.pathname === item.href;
    const isHighlight = 'highlight' in item && item.highlight;

    return (
      <Link
        to={item.href}
        className={cn(
          "flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group",
          isActive
            ? "bg-white/10 text-foreground shadow-glow-sm border border-white/10"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
          isHighlight && !isActive && "text-primary hover:text-primary"
        )}
      >
        <item.icon
          className={cn(
            "h-4.5 w-4.5 transition-colors",
            isActive ? "text-primary" : isHighlight ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )}
        />
        <span className="flex-1">{item.name}</span>
        {isHighlight && (
          <span className="flex items-center justify-center h-5 px-1.5 rounded-md bg-primary/20 border border-primary/30">
            <Zap className="h-3 w-3 text-primary" />
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-72 bg-sidebar/80 backdrop-blur-2xl border-r border-white/5">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-20 items-center gap-4 px-6 border-b border-white/5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-sm border border-white/10 shadow-glow-sm">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-semibold text-lg text-foreground tracking-tight">
              Creator Studio
            </h1>
            <p className="text-xs text-muted-foreground">AI Content Engine</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto scrollbar-thin">
          {/* STUDIO Section */}
          <div className="mb-6">
            <p className="px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">
              Studio
            </p>
            <div className="space-y-1">
              {studioNav.map((item) => (
                <NavItem key={item.name} item={item} />
              ))}
            </div>
          </div>

          {/* BRAND BRAIN Section */}
          <div className="mb-6">
            <p className="px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">
              Brand Brain
            </p>
            <div className="space-y-1">
              {brandNav.map((item) => (
                <NavItem key={item.name} item={item} />
              ))}
            </div>
          </div>
        </nav>

        {/* Footer - System */}
        <div className="border-t border-white/5 p-4 space-y-1">
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
              location.pathname === "/settings" || location.pathname.startsWith("/settings/")
                ? "bg-white/10 text-foreground shadow-glow-sm border border-white/10"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
          >
            <Settings className={cn(
              "h-4.5 w-4.5 transition-colors",
              location.pathname === "/settings" || location.pathname.startsWith("/settings/") ? "text-primary" : "text-muted-foreground"
            )} />
            Settings
          </Link>
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
