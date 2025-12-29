import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const SHORTCUT_URL = "https://www.icloud.com/shortcuts/8006547ced474e44a55338b3310609b0";

export default function MobileUploadTab() {
  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Smartphone className="h-5 w-5 text-primary" />
            Mobile Upload
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Lade den iOS Kurzbefehl, um Bilder direkt aus der Fotos-App zu teilen. 
            Posts werden automatisch erstellt und geplant.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* QR Code */}
            <div className="p-4 bg-white rounded-xl shadow-sm">
              <QRCodeSVG 
                value={SHORTCUT_URL} 
                size={140} 
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Instructions */}
            <div className="flex-1 space-y-4 text-center sm:text-left">
              <div className="space-y-2">
                <h4 className="font-medium">So funktioniert's:</h4>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Scanne den QR-Code oder klicke den Button</li>
                  <li>Installiere den Kurzbefehl auf deinem iPhone</li>
                  <li>Teile Fotos direkt aus der Fotos-App</li>
                </ol>
              </div>

              <Button 
                onClick={() => window.open(SHORTCUT_URL, "_blank")}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Kurzbefehl installieren
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
