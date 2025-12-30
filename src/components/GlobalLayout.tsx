import { ReactNode, useState, useEffect } from "react";
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
  Menu,
  LogOut,
  Brain,
  X,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import creatorOSLogo from "@/assets/CreatorOS-Logo.webp";

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
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Brain className="h-3.5 w-3.5 text-primary animate-pulse" />
        </div>
        <span className="text-xs font-medium text-foreground">
          Generiere...
        </span>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {progress.current} / {progress.total}
        </span>
        <div className="flex items-center gap-1.5">
          <div className="relative w-6 h-6">
            <svg className="w-6 h-6 -rotate-90">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" className="text-muted" />
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none"
                strokeDasharray={56.5} strokeDashoffset={56.5 - (56.5 * percentage) / 100}
                className="text-primary transition-all duration-300" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-medium">
              {percentage}%
            </span>
          </div>
          <Button size="icon" variant="ghost" className="h-5 w-5 hover:bg-primary/10"
            onClick={(e) => { e.stopPropagation(); cancelGeneration(); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface UserData {
  email: string | null;
  displayName: string | null;
  igUsername: string | null;
  igProfilePicUrl: string | null;
}

function useUserData() {
  const [userData, setUserData] = useState<UserData>({
    email: null,
    displayName: null,
    igUsername: null,
    igProfilePicUrl: null,
  });

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, metaRes] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        supabase.from("meta_connections").select("ig_username, profile_picture_url").eq("user_id", user.id).maybeSingle(),
      ]);

      setUserData({
        email: user.email || null,
        displayName: profileRes.data?.display_name || null,
        igUsername: metaRes.data?.ig_username || null,
        igProfilePicUrl: metaRes.data?.profile_picture_url || null,
      });
    };
    fetchUserData();
  }, []);

  return userData;
}

function LogoHeader() {
  return (
    <div className="px-5 py-4 border-b border-border/15">
      <div className="flex items-center gap-3">
        <img src={creatorOSLogo} alt="CreatorOS" className="w-10 h-10 rounded-xl" />
        <span className="font-bold text-foreground tracking-tight">CreatorOS</span>
      </div>
    </div>
  );
}

function UserProfileFooter({ userData }: { userData: UserData }) {
  const name = userData.displayName || userData.igUsername || userData.email?.split("@")[0] || "User";
  const handle = userData.igUsername ? `@${userData.igUsername}` : userData.email ? `@${userData.email.split("@")[0]}` : "";

  return (
    <div className="px-4 py-3 flex items-center gap-3 border-b border-border/15">
      <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 ring-2 ring-border/20">
        {userData.igProfilePicUrl ? (
          <img 
            src={userData.igProfilePicUrl} 
            alt="Profile" 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{handle}</p>
      </div>
    </div>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const userData = useUserData();
  const isActive = (href: string) => location.pathname === href;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Erfolgreich abgemeldet");
    navigate("/login");
  };

  return (
    <>
      {/* Logo Header */}
      <LogoHeader />

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {navItems.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200",
              isActive(item.href)
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            )}
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.name}
          </Link>
        ))}
      </nav>
      
      {/* Generation Indicator */}
      <div className="px-3">
        <GenerationIndicator onNavigate={onNavigate} />
      </div>

      {/* Footer: User Profile, Theme & Sign Out */}
      <div className="border-t border-border mt-auto bg-card/50">
        <UserProfileFooter userData={userData} />
        <div className="p-3 space-y-1.5">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
            <span className="text-sm font-medium text-foreground">Theme</span>
            <ThemeToggle />
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground bg-muted/40 hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            Abmelden
          </button>
        </div>
      </div>
    </>
  );
}

export function GlobalLayout({ children, hideBottomChat = false }: GlobalLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-card/90 backdrop-blur-2xl border-b border-border/15 flex items-center justify-between px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <img src={creatorOSLogo} alt="CreatorOS" className="w-9 h-9 rounded-xl" />
          <h1 className="font-bold text-foreground tracking-tight">CreatorOS</h1>
        </div>
        
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-muted/40">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-card/98 backdrop-blur-2xl">
            <div className="flex flex-col h-full">
              <NavContent onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-60 xl:w-64 bg-card/95 backdrop-blur-2xl border-r border-border/15 flex-col">
        <NavContent />
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 lg:ml-60 xl:ml-64 relative z-10 pt-14 lg:pt-0 ${hideBottomChat ? "" : "pb-32 lg:pb-40"}`}>
        {children}
      </main>

      {/* Gradient Fade */}
      {!hideBottomChat && (
        <div 
          className="fixed bottom-0 left-0 lg:left-60 xl:left-64 right-0 h-24 lg:h-32 z-40 pointer-events-none bg-gradient-to-t from-background via-background/90 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* Bottom Chat Bar */}
      {!hideBottomChat && <BottomChat />}
    </div>
  );
}