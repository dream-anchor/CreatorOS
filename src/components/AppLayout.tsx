import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function AppLayout({ children, title, description, actions }: AppLayoutProps) {
  return (
    <div className="min-h-screen relative">
      {/* Aurora Background Effects */}
      <div className="aurora-container">
        <div className="aurora-blob aurora-blob-1 animate-aurora" />
        <div className="aurora-blob aurora-blob-2 animate-aurora" />
        <div className="aurora-blob aurora-blob-3 animate-aurora" />
      </div>

      <AppSidebar />
      
      <main className="pl-72 relative z-10">
        <div className="p-10">
          {/* Header */}
          <div className="mb-10 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground font-display tracking-tight">
                {title}
              </h1>
              {description && (
                <p className="mt-2 text-base text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-4">{actions}</div>
            )}
          </div>
          
          {/* Content */}
          <div className="animate-fade-in">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}