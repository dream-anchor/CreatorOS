import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Sparkles,
  CalendarClock,
  Settings,
  LogOut,
  Zap,
  FolderOpen,
  ImageIcon,
  MessageCircle,
  BarChart3,
  FileText,
  ChevronDown,
  Video,
} from "lucide-react";
import { signOut } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ThemeToggle } from "./ThemeToggle";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}

interface NavSection {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  items?: NavItem[];
  href?: string;
  defaultOpen?: boolean;
}

const navigation: NavSection[] = [
  {
    name: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    name: "Content Studio",
    icon: Sparkles,
    defaultOpen: true,
    items: [
      { name: "Magic Create", href: "/generator", icon: Sparkles, highlight: true },
      { name: "Reel Studio", href: "/reels", icon: Video },
      { name: "Planung", href: "/calendar", icon: CalendarClock },
      { name: "Review", href: "/review", icon: FileText },
      { name: "Meine Bilder", href: "/media", icon: ImageIcon },
    ],
  },
  {
    name: "Community",
    icon: MessageCircle,
    defaultOpen: true,
    items: [
      { name: "Kommentare", href: "/community", icon: MessageCircle },
      { name: "Post-Historie", href: "/library", icon: FolderOpen },
    ],
  },
  {
    name: "Analytics",
    icon: BarChart3,
    href: "/analytics",
  },
  {
    name: "Einstellungen",
    icon: Settings,
    href: "/settings",
  },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navigation.forEach(section => {
      if (section.items && section.defaultOpen) {
        initial[section.name] = true;
      }
    });
    return initial;
  });

  const handleSignOut = async () => {
    await signOut();
    toast.success("Erfolgreich abgemeldet");
    navigate("/login");
  };

  const isActiveSection = (section: NavSection) => {
    if (section.href) {
      return location.pathname === section.href || location.pathname.startsWith(section.href + "/");
    }
    return section.items?.some(item => location.pathname === item.href) ?? false;
  };

  const isActiveItem = (href: string) => {
    return location.pathname === href;
  };

  const toggleSection = (name: string) => {
    setOpenSections(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const NavItemComponent = ({ item, nested = false }: { item: NavItem; nested?: boolean }) => {
    const isActive = isActiveItem(item.href);
    const isHighlight = item.highlight;

    return (
      <Link
        to={item.href}
        className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 group",
          nested && "ml-3",
          isActive
            ? "bg-primary/10 text-foreground shadow-sm border border-primary/20"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          isHighlight && !isActive && "text-primary hover:text-primary"
        )}
      >
        <item.icon
          className={cn(
            "h-4 w-4 transition-colors shrink-0",
            isActive ? "text-primary" : isHighlight ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )}
        />
        <span className="flex-1 truncate">{item.name}</span>
        {isHighlight && (
          <span className="flex items-center justify-center h-5 px-1.5 rounded-md bg-primary/20 border border-primary/30">
            <Zap className="h-3 w-3 text-primary" />
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-72 bg-card/80 backdrop-blur-xl border-r border-border">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-20 items-center justify-between px-6 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 border border-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-lg text-foreground tracking-tight">
                Creator Studio
              </h1>
              <p className="text-xs text-muted-foreground">AI Content Engine</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto scrollbar-thin">
          <div className="space-y-1">
            {navigation.map((section) => {
              // Simple link (no children)
              if (!section.items) {
                const isActive = isActiveSection(section);
                return (
                  <Link
                    key={section.name}
                    to={section.href!}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group",
                      isActive
                        ? "bg-primary/10 text-foreground shadow-sm border border-primary/20"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <section.icon
                      className={cn(
                        "h-4 w-4 transition-colors shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="flex-1">{section.name}</span>
                  </Link>
                );
              }

              // Collapsible section
              const isOpen = openSections[section.name] ?? false;
              const hasActiveChild = section.items.some(item => isActiveItem(item.href));

              return (
                <Collapsible
                  key={section.name}
                  open={isOpen || hasActiveChild}
                  onOpenChange={() => toggleSection(section.name)}
                >
                  <CollapsibleTrigger
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group",
                      hasActiveChild
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <section.icon
                      className={cn(
                        "h-4 w-4 transition-colors shrink-0",
                        hasActiveChild ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="flex-1 text-left">{section.name}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        (isOpen || hasActiveChild) && "rotate-180"
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 pt-1">
                    {section.items.map((item) => (
                      <NavItemComponent key={item.name} item={item} nested />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </nav>

        {/* Footer - User Actions */}
        <div className="border-t border-border p-4">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            Abmelden
          </button>
        </div>
      </div>
    </aside>
  );
}
