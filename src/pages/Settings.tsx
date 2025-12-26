import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Instagram, ScrollText, Settings as SettingsIcon, Sliders } from "lucide-react";
import MetaConnectionTab from "@/components/settings/MetaConnectionTab";
import LogsTab from "@/components/settings/LogsTab";
import GeneralSettingsTab from "@/components/settings/GeneralSettingsTab";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <AppLayout title="Einstellungen" description="Verwalte deine App-Konfiguration">
      <div className="max-w-4xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="glass-card p-1 h-auto flex-wrap gap-1">
            <TabsTrigger 
              value="general" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-4 py-2.5"
            >
              <Sliders className="h-4 w-4" />
              Allgemein
            </TabsTrigger>
            <TabsTrigger 
              value="instagram" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-4 py-2.5"
            >
              <Instagram className="h-4 w-4" />
              Instagram
            </TabsTrigger>
            <TabsTrigger 
              value="logs" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-4 py-2.5"
            >
              <ScrollText className="h-4 w-4" />
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-6">
            <GeneralSettingsTab />
          </TabsContent>

          <TabsContent value="instagram" className="mt-6">
            <MetaConnectionTab />
          </TabsContent>

          <TabsContent value="logs" className="mt-6">
            <LogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
