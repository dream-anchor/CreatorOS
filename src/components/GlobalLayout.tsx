import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BottomChat } from "@/components/BottomChat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useGenerationContext } from "@/contexts/GenerationContext";
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
  Brain,
  X,
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

function GenerationIndicator({ onNavigate }: { onNavigate?: () => void }) {
  const { isGenerating, progress, cancelGeneration } = useGenerationContext();
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show on community page (it has its own indicator)
  if (!isGenerating || !progress || location.pathname === "/community") {
    return null;
  }

  const percentage = Math.round((progress.current / progress.total) * 100);

  return (
    <div 
      className="mt-3 p-3 rounded-2xl bg-primary/8 border border-primary/15 cursor-pointer hover:bg-primary/12 transition-all duration-200"
      onClick={() => {
        navigate("/community");
        onNavigate?.();
      }}
    >
      {/* Row 1: Icon + Label */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Brain className="h-3.5 w-3.5 text-primary animate-pulse" />
        </div>
        <span className="text-xs font-medium text-foreground">
          Generiere...
        </span>
      </div>
      
      {/* Row 2: Progress info + Cancel */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {progress.current} / {progress.total}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Mini progress ring */}
          <div className="relative w-6 h-6">
            <svg className="w-6 h-6 -rotate-90">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                className="text-muted"
              />
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeDasharray={56.5}
                strokeDashoffset={56.5 - (56.5 * percentage) / 100}
                className="text-primary transition-all duration-300"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-medium">
              {percentage}%
            </span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 hover:bg-primary/10"
            onClick={(e) => {
              e.stopPropagation();
              cancelGeneration();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

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
      <div className="h-18 sm:h-20 px-5 sm:px-6 flex items-center gap-3.5 border-b border-border/20">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center shadow-lg shadow-primary/15">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-base sm:text-lg text-foreground tracking-tight">CreatorOS</h1>
          <p className="text-[10px] sm:text-[11px] text-muted-foreground">Instagram Agent</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-5 px-3.5 space-y-1.5">
        {navItems.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
              isActive(item.href)
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.name}
          </Link>
        ))}
      </nav>
      
      {/* Generation Indicator - above footer */}
      <div className="px-3.5">
        <GenerationIndicator onNavigate={onNavigate} />
      </div>

      {/* Footer */}
      <div className="border-t border-border/20 p-4 pt-5 space-y-2">
        <div className="flex items-center justify-between px-2.5">
          <span className="text-xs text-muted-foreground/80">Theme</span>
          <ThemeToggle />
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground transition-all duration-200"
        >
          <LogOut className="h-[18px] w-[18px]" />
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
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-card/90 backdrop-blur-2xl border-b border-border/30 flex items-center justify-between px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center shadow-md shadow-primary/15">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <h1 className="font-bold text-foreground tracking-tight">CreatorOS</h1>
        </div>
        
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-muted/50">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-card/95 backdrop-blur-2xl">
            <div className="flex flex-col h-full">
              <NavContent onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar - Hidden on mobile */}
      <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-56 xl:w-60 bg-card/90 backdrop-blur-2xl border-r border-border/30 flex-col">
        <NavContent />
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 lg:ml-56 xl:ml-60 relative z-10 pt-14 lg:pt-0 ${hideBottomChat ? "" : "pb-32 lg:pb-40"}`}>
        {children}
      </main>

      {/* Gradient Fade - Visual fade effect at bottom for better chat readability */}
      {!hideBottomChat && (
        <div 
          className="fixed bottom-0 left-0 lg:left-56 xl:left-60 right-0 h-24 lg:h-32 z-40 pointer-events-none bg-gradient-to-t from-background via-background/90 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* Bottom Chat Bar - conditionally rendered */}
      {!hideBottomChat && <BottomChat />}
    </div>
  );
}