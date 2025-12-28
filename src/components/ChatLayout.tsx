import { ReactNode } from "react";
import { ChatSidebar } from "./chat/ChatSidebar";

interface ChatLayoutProps {
  children: ReactNode;
}

export function ChatLayout({ children }: ChatLayoutProps) {
  return (
    <div className="min-h-screen relative bg-background">
      {/* Aurora Background Effects - only in dark mode */}
      <div className="aurora-container dark:block hidden">
        <div className="aurora-blob aurora-blob-1 animate-aurora" />
        <div className="aurora-blob aurora-blob-2 animate-aurora" />
        <div className="aurora-blob aurora-blob-3 animate-aurora" />
      </div>

      <ChatSidebar />
      
      {/* Main content - adjusts based on sidebar state via CSS */}
      <main className="pl-16 lg:pl-64 relative z-10 h-screen transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
