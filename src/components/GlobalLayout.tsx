import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BottomChat } from "@/components/BottomChat";
import {
  Home,
  MessageCircle,
  CalendarClock,
  ImageIcon,
  BarChart3,
  Settings,
  Sparkles,
} from "lucide-react";

interface GlobalLayoutProps {
  children: ReactNode;
}

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Community", href: "/community", icon: MessageCircle },
  { name: "Planung", href: "/calendar", icon: CalendarClock },
  { name: "Bilder", href: "/media", icon: ImageIcon },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function GlobalLayout({ children }: GlobalLayoutProps) {
  const location = useLocation();
  const isActive = (href: string) => location.pathname === href;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Sidebar - Always visible */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-60 bg-card/80 backdrop-blur-2xl border-r border-border/50 flex flex-col">
        {/* Logo */}
        <div className="h-20 px-5 flex items-center gap-3 border-b border-border/30">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center shadow-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-foreground">CreatorOS</h1>
            <p className="text-[11px] text-muted-foreground">Instagram Agent</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                isActive(item.href)
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-border/30 p-4">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-60 relative z-10 pb-28">
        {children}
      </main>

      {/* Bottom Chat Bar */}
      <BottomChat />
    </div>
  );
}
