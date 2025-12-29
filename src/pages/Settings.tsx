import { useState } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Instagram, ScrollText, Sliders, Fingerprint, Hash, Wrench, Smartphone } from "lucide-react";
import MetaConnectionTab from "@/components/settings/MetaConnectionTab";
import LogsTab from "@/components/settings/LogsTab";
import GeneralSettingsTab from "@/components/settings/GeneralSettingsTab";
import SystemStatusTab from "@/components/settings/SystemStatusTab";
import MobileUploadTab from "@/components/settings/MobileUploadTab";
import { Link } from "react-router-dom";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <GlobalLayout>
      <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
          <TabsList className="glass-card p-1 h-auto flex flex-wrap gap-1">
            <TabsTrigger 
              value="general" 
              className="flex items-center gap-1.5 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm"
            >
              <Sliders className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Allgemein</span>
            </TabsTrigger>
            <TabsTrigger 
              value="brand" 
              className="flex items-center gap-1.5 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm"
            >
              <Fingerprint className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">DNA</span>
            </TabsTrigger>
            <TabsTrigger 
              value="topics" 
              className="flex items-center gap-1.5 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm"
            >
              <Hash className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Themen</span>
            </TabsTrigger>
            <TabsTrigger 
              value="instagram" 
              className="flex items-center gap-1.5 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm"
            >
              <Instagram className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Instagram</span>
            </TabsTrigger>
            <TabsTrigger 
              value="mobile" 
              className="flex items-center gap-1.5 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm"
            >
              <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Mobile</span>
            </TabsTrigger>
            <TabsTrigger 
              value="system" 
              className="flex items-center gap-1.5 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm"
            >
              <Wrench className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">System</span>
            </TabsTrigger>
            <TabsTrigger 
              value="logs" 
              className="flex items-center gap-1.5 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm"
            >
              <ScrollText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 sm:mt-6">
            <GeneralSettingsTab />
          </TabsContent>

          <TabsContent value="brand" className="mt-4 sm:mt-6">
            <div className="glass-card p-4 sm:p-6 text-center">
              <Fingerprint className="h-10 w-10 sm:h-12 sm:w-12 text-primary mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">Marken-DNA verwalten</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                Definiere deinen Schreibstil und Brand-Regeln.
              </p>
              <Link 
                to="/brand" 
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                Zur Marken-DNA
              </Link>
            </div>
          </TabsContent>

          <TabsContent value="topics" className="mt-4 sm:mt-6">
            <div className="glass-card p-4 sm:p-6 text-center">
              <Hash className="h-10 w-10 sm:h-12 sm:w-12 text-primary mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">Themen verwalten</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                Verwalte deine Content-Themen und Keywords.
              </p>
              <Link 
                to="/topics" 
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                Zu den Themen
              </Link>
            </div>
          </TabsContent>

          <TabsContent value="instagram" className="mt-4 sm:mt-6">
            <MetaConnectionTab />
          </TabsContent>

          <TabsContent value="mobile" className="mt-4 sm:mt-6">
            <MobileUploadTab />
          </TabsContent>

          <TabsContent value="system" className="mt-4 sm:mt-6">
            <SystemStatusTab />
          </TabsContent>

          <TabsContent value="logs" className="mt-4 sm:mt-6">
            <LogsTab />
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </GlobalLayout>
  );
}
