import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BottomChat } from "@/components/BottomChat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Home,
  MessageCircle,
  CalendarClock,
  ImageIcon,
  BarChart3,
  Settings,
  Sparkles,
  Menu,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface GlobalLayoutProps {
  children: ReactNode;
  hideBottomChat?: boolean;
}

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Community", href: "/community", icon: MessageCircle },
  { name: "Planung", href: "/calendar", icon: CalendarClock },
  { name: "Bilder", href: "/media", icon: ImageIcon },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (href: string) => location.pathname === href;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Erfolgreich abgemeldet");
    navigate("/login");
  };

  return (
    <>
      {/* Logo */}
      <div className="h-16 sm:h-20 px-4 sm:px-5 flex items-center gap-3 border-b border-border/30">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center shadow-lg">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-base sm:text-lg text-foreground">CreatorOS</h1>
          <p className="text-[10px] sm:text-[11px] text-muted-foreground">Instagram Agent</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            onClick={onNavigate}
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
      <div className="border-t border-border/30 p-4 space-y-2">
        <div className="flex items-center justify-between px-2">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all"
        >
          <LogOut className="h-5 w-5" />
          Abmelden
        </button>
      </div>
    </>
  );
}

export function GlobalLayout({ children, hideBottomChat = false }: GlobalLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-card/95 backdrop-blur-xl border-b border-border/50 flex items-center justify-between px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center shadow-md">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <h1 className="font-bold text-foreground">CreatorOS</h1>
        </div>
        
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-card/95 backdrop-blur-xl">
            <div className="flex flex-col h-full">
              <NavContent onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar - Hidden on mobile */}
      <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-60 bg-card/80 backdrop-blur-2xl border-r border-border/50 flex-col">
        <NavContent />
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 lg:ml-60 relative z-10 pt-14 lg:pt-0 ${hideBottomChat ? "" : "pb-40"}`}>
        {children}
      </main>

      {/* Gradient Fade - Visual fade effect at bottom for better chat readability */}
      {!hideBottomChat && (
        <div 
          className="fixed bottom-0 left-0 lg:left-60 right-0 h-32 z-40 pointer-events-none bg-gradient-to-t from-background via-background/90 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* Bottom Chat Bar - conditionally rendered */}
      {!hideBottomChat && <BottomChat />}
    </div>
  );
}
