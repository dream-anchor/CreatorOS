import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Instagram, ScrollText, Sliders, Fingerprint, Hash, Wrench } from "lucide-react";
import MetaConnectionTab from "@/components/settings/MetaConnectionTab";
import LogsTab from "@/components/settings/LogsTab";
import GeneralSettingsTab from "@/components/settings/GeneralSettingsTab";
import SystemStatusTab from "@/components/settings/SystemStatusTab";
import { Link } from "react-router-dom";

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
              value="brand" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-4 py-2.5"
            >
              <Fingerprint className="h-4 w-4" />
              Meine DNA
            </TabsTrigger>
            <TabsTrigger 
              value="topics" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-4 py-2.5"
            >
              <Hash className="h-4 w-4" />
              Themen
            </TabsTrigger>
            <TabsTrigger 
              value="instagram" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-4 py-2.5"
            >
              <Instagram className="h-4 w-4" />
              Instagram
            </TabsTrigger>
            <TabsTrigger 
              value="system" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-4 py-2.5"
            >
              <Wrench className="h-4 w-4" />
              System
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

          <TabsContent value="brand" className="mt-6">
            <div className="glass-card p-6 text-center">
              <Fingerprint className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Marken-DNA verwalten</h3>
              <p className="text-muted-foreground mb-4">
                Definiere deinen Schreibstil, Tone of Voice und Brand-Regeln.
              </p>
              <Link 
                to="/brand" 
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Zur Marken-DNA
              </Link>
            </div>
          </TabsContent>

          <TabsContent value="topics" className="mt-6">
            <div className="glass-card p-6 text-center">
              <Hash className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Themen verwalten</h3>
              <p className="text-muted-foreground mb-4">
                Verwalte deine Content-Themen und Keywords.
              </p>
              <Link 
                to="/topics" 
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Zu den Themen
              </Link>
            </div>
          </TabsContent>

          <TabsContent value="instagram" className="mt-6">
            <MetaConnectionTab />
          </TabsContent>

          <TabsContent value="system" className="mt-6">
            <SystemStatusTab />
          </TabsContent>

          <TabsContent value="logs" className="mt-6">
            <LogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
