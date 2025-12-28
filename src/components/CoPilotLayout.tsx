import { ReactNode, useState } from "react";
import { useLocation } from "react-router-dom";
import { CoPilotSidebar } from "./copilot/CoPilotSidebar";
import { cn } from "@/lib/utils";

interface CoPilotLayoutProps {
  children: ReactNode;
}

export function CoPilotLayout({ children }: CoPilotLayoutProps) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Get page title from route
  const getPageTitle = () => {
    switch (location.pathname) {
      case "/dashboard": return null; // No title for home
      case "/community": return "Community";
      case "/calendar": return "Planung";
      case "/media": return "Meine Bilder";
      case "/analytics": return "Analytics";
      case "/settings": return "Einstellungen";
      case "/generator": return "Content erstellen";
      case "/review": return "Review";
      default: return null;
    }
  };

  const pageTitle = getPageTitle();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Aurora Background Effects - only in dark mode */}
      <div className="aurora-container dark:block hidden fixed inset-0 pointer-events-none">
        <div className="aurora-blob aurora-blob-1 animate-aurora" />
        <div className="aurora-blob aurora-blob-2 animate-aurora" />
        <div className="aurora-blob aurora-blob-3 animate-aurora" />
      </div>

      {/* Main Stage Area (Left/Center - 70-75%) */}
      <main className={cn(
        "flex-1 relative z-10 transition-all duration-300",
        sidebarCollapsed ? "mr-16" : "mr-80 lg:mr-96"
      )}>
        {pageTitle && (
          <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border px-6 py-4">
            <h1 className="text-xl font-bold text-foreground">{pageTitle}</h1>
          </div>
        )}
        <div className={cn(
          "h-full",
          pageTitle ? "" : "pt-0"
        )}>
          {children}
        </div>
      </main>

      {/* Co-Pilot Sidebar (Right - 25-30%) */}
      <CoPilotSidebar 
        collapsed={sidebarCollapsed} 
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
    </div>
  );
}
