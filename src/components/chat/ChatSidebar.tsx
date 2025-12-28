import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  Settings,
  ImageIcon,
  LogOut,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ThemeToggle } from "../ThemeToggle";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navigation: NavItem[] = [
  { name: "Chat", href: "/dashboard", icon: MessageCircle },
  { name: "Meine Bilder", href: "/media", icon: ImageIcon },
  { name: "Planung", href: "/calendar", icon: CalendarClock },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Einstellungen", href: "/settings", icon: Settings },
];

export function ChatSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Erfolgreich abgemeldet");
    navigate("/login");
  };

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 h-screen bg-card/80 backdrop-blur-xl border-r border-border transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className={cn(
          "flex items-center border-b border-border",
          collapsed ? "h-16 justify-center px-2" : "h-16 justify-between px-4"
        )}>
          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 border border-primary/20">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="font-semibold text-foreground">InstagramGPT</h1>
                <p className="text-[10px] text-muted-foreground">AI Co-Pilot</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 border border-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="space-y-1">
            {navigation.map((item) => {
              const active = isActive(item.href);
              
              if (collapsed) {
                return (
                  <Tooltip key={item.name} delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Link
                        to={item.href}
                        className={cn(
                          "flex items-center justify-center h-10 w-10 mx-auto rounded-xl transition-all duration-200",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-primary/10 text-foreground border border-primary/20"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className={cn(
                    "h-5 w-5",
                    active ? "text-primary" : ""
                  )} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3 space-y-2">
          {/* Theme Toggle */}
          <div className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "justify-between px-2"
          )}>
            {!collapsed && <span className="text-xs text-muted-foreground">Theme</span>}
            <ThemeToggle />
          </div>

          {/* Collapse Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "w-full justify-center",
              collapsed ? "px-2" : ""
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span className="text-xs">Einklappen</span>
              </>
            )}
          </Button>

          {/* Sign Out */}
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className="flex items-center justify-center h-10 w-10 mx-auto rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Abmelden
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
            >
              <LogOut className="h-5 w-5" />
              Abmelden
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
