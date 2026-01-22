import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { GenerationProvider } from "@/contexts/GenerationContext";
import { ImportProvider } from "@/contexts/ImportContext";
import { FloatingGenerationIndicator } from "@/components/FloatingGenerationIndicator";
import { FloatingImportIndicator } from "@/components/FloatingImportIndicator";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import Brand from "./pages/Brand";
import Topics from "./pages/Topics";
import Generator from "./pages/Generator";
import Review from "./pages/Review";
import Calendar from "./pages/Calendar";
import Settings from "./pages/Settings";
import ContentLibrary from "./pages/ContentLibrary";
import MediaArchive from "./pages/MediaArchive";
import Community from "./pages/Community";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark" storageKey="creator-studio-theme">
      <GenerationProvider>
        <ImportProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <FloatingGenerationIndicator />
              <FloatingImportIndicator />
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<ProtectedRoute><AuthCallback /></ProtectedRoute>} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/brand" element={<ProtectedRoute><Brand /></ProtectedRoute>} />
              <Route path="/topics" element={<ProtectedRoute><Topics /></ProtectedRoute>} />
              <Route path="/generator" element={<ProtectedRoute><Generator /></ProtectedRoute>} />
              <Route path="/review" element={<ProtectedRoute><Review /></ProtectedRoute>} />
              <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
              <Route path="/library" element={<ProtectedRoute><ContentLibrary /></ProtectedRoute>} />
              <Route path="/media" element={<ProtectedRoute><MediaArchive /></ProtectedRoute>} />
              <Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/settings/*" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
        </ImportProvider>
      </GenerationProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
