import { useState } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Instagram, ScrollText, Sliders, Wrench, Smartphone, Database, Globe, ShieldCheck } from "lucide-react";
import MetaConnectionTab from "@/components/settings/MetaConnectionTab";
import LogsTab from "@/components/settings/LogsTab";
import GeneralSettingsTab from "@/components/settings/GeneralSettingsTab";
import SystemStatusTab from "@/components/settings/SystemStatusTab";
import MobileUploadTab from "@/components/settings/MobileUploadTab";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <GlobalLayout>
      <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Einstellungen</h1>
          <p className="text-muted-foreground mt-1">Verwalte deine App-Konfiguration und Verbindungen</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full justify-start h-auto p-1 bg-muted/50 backdrop-blur-sm border border-border/50 rounded-xl flex-wrap">
            <TabsTrigger 
              value="general" 
              className="flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
            >
              <Sliders className="h-4 w-4" />
              <span>Allgemein</span>
            </TabsTrigger>
            
            <TabsTrigger 
              value="instagram" 
              className="flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
            >
              <Instagram className="h-4 w-4" />
              <span>Verbindungen</span>
            </TabsTrigger>

            <TabsTrigger 
              value="mobile" 
              className="flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
            >
              <Smartphone className="h-4 w-4" />
              <span>Mobile App</span>
            </TabsTrigger>

            <TabsTrigger 
              value="system" 
              className="flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
            >
              <Wrench className="h-4 w-4" />
              <span>System</span>
            </TabsTrigger>

            <TabsTrigger 
              value="logs" 
              className="flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
            >
              <ScrollText className="h-4 w-4" />
              <span>Protokolle</span>
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="general" className="m-0 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
              <GeneralSettingsTab />
            </TabsContent>

            <TabsContent value="instagram" className="m-0 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
              <MetaConnectionTab />
            </TabsContent>

            <TabsContent value="mobile" className="m-0 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
              <MobileUploadTab />
            </TabsContent>

            <TabsContent value="system" className="m-0 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
              <SystemStatusTab />
            </TabsContent>

            <TabsContent value="logs" className="m-0 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
              <LogsTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
      </div>
    </GlobalLayout>
  );
}
