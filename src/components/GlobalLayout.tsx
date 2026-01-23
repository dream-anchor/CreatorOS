import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BottomChat } from "@/components/BottomChat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useGenerationContext } from "@/contexts/GenerationContext";
import { useChatConversations } from "@/hooks/useChatConversations";
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
  MessageSquare,
  MessageSquarePlus,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import creatorOSLogo from "@/assets/CreatorOS-Logo.webp";

interface GlobalLayoutProps {
  children: ReactNode;
  hideBottomChat?: boolean;
}

const navGroups = [
  {
    title: "Übersicht",
    items: [{ name: "Dashboard", href: "/dashboard", icon: Home }]
  },
  {
    title: "Strategie",
    items: [
      { name: "Brand DNA", href: "/brand", icon: Brain },
      { name: "Themen", href: "/topics", icon: Sparkles }
    ]
  },
  {
    title: "Kreation",
    items: [{ name: "Generator", href: "/generator", icon: Zap }]
  },
  {
    title: "Management",
    items: [
      { name: "Planung", href: "/calendar", icon: CalendarClock },
      { name: "Community", href: "/community", icon: MessageCircle }
    ]
  },
  {
    title: "Analyse & Assets",
    items: [
      { name: "Medien", href: "/media", icon: ImageIcon },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Settings", href: "/settings", icon: Settings }
    ]
  }
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
  const [searchParams] = useSearchParams();
  const userData = useUserData();
  const { conversations, createConversation, deleteConversation, loading: chatsLoading } = useChatConversations();
  const [chatsOpen, setChatsOpen] = useState(false);
  const isActive = (href: string) => location.pathname === href;

  const activeConversationId = searchParams.get("chat");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Erfolgreich abgemeldet");
    navigate("/login");
  };

  const handleNewChat = async () => {
    const id = await createConversation("Neuer Chat");
    if (id) {
      navigate(`/dashboard?chat=${id}`);
      onNavigate?.();
    }
  };

  const handleSelectChat = (id: string) => {
    navigate(`/dashboard?chat=${id}`);
    onNavigate?.();
  };

  const handleDeleteChat = async (id: string) => {
    await deleteConversation(id);
    // If we deleted the active chat, clear the param
    if (activeConversationId === id) {
      navigate("/dashboard");
    }
  };

  return (
    <>
      {/* Logo Header */}
      <LogoHeader />

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-6 overflow-y-auto">
        {navGroups.map((group, i) => (
          <div key={i} className="space-y-1">
            {group.title !== "Übersicht" && (
              <h4 className="px-4 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 mb-2">
                {group.title}
              </h4>
            )}
            {group.items.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <item.icon className={cn(
                  "h-[18px] w-[18px] transition-colors",
                  isActive(item.href) ? "text-primary" : "text-muted-foreground"
                )} />
                {item.name}
              </Link>
            ))}
          </div>
        ))}

        {/* Chat History Section */}
        <div className="pt-2 border-t border-border/20">
          <Collapsible open={chatsOpen} onOpenChange={setChatsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
            <span className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" />
              Chats
            </span>
            {chatsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 mt-1">
            {/* New Chat Button */}
            <button
              onClick={handleNewChat}
              className="flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all duration-200 w-full"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Neuer Chat
            </button>

            {/* Recent Chats */}
            {chatsLoading ? (
              <div className="px-4 py-2 text-xs text-muted-foreground">Lade...</div>
            ) : conversations.length === 0 ? (
              <div className="px-4 py-2 text-xs text-muted-foreground">Noch keine Chats</div>
            ) : (
              conversations.slice(0, 8).map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "group flex items-center gap-2 px-4 py-2 rounded-xl text-sm cursor-pointer transition-all duration-200",
                    activeConversationId === conv.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                  onClick={() => handleSelectChat(conv.id)}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate flex-1 text-left">
                    {conv.title || "Neuer Chat"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteChat(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </CollapsibleContent>
        </Collapsible>
        </div>
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