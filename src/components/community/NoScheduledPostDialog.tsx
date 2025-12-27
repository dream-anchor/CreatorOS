import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Rocket, Clock } from "lucide-react";

interface NoScheduledPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replyCount: number;
  onSendNow: () => void;
  onWaitForPost: () => void;
}

export function NoScheduledPostDialog({
  open,
  onOpenChange,
  replyCount,
  onSendNow,
  onWaitForPost,
}: NoScheduledPostDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-amber-500/10">
              <Calendar className="h-5 w-5 text-amber-500" />
            </div>
            <DialogTitle>Kein geplanter Post gefunden</DialogTitle>
          </div>
          <DialogDescription className="text-left">
            Du hast <span className="font-semibold text-foreground">{replyCount} Antworten</span> ausgewählt.
            Ohne geplanten Post können wir das "Golden Window" nicht optimal nutzen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          <Button
            variant="default"
            className="w-full justify-start gap-3 h-auto py-4"
            onClick={() => {
              onSendNow();
              onOpenChange(false);
            }}
          >
            <Rocket className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Sofort starten (Natürlich)</div>
              <div className="text-xs text-muted-foreground font-normal">
                Antworten werden in 1-5 Minuten mit zufälligen Abständen gesendet
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-4"
            onClick={() => {
              onWaitForPost();
              onOpenChange(false);
            }}
          >
            <Clock className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Auf nächsten Post warten</div>
              <div className="text-xs text-muted-foreground font-normal">
                Antworten werden automatisch 30 Min vor deinem nächsten Post gesendet
              </div>
            </div>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Tipp: Plane einen Post im Kalender, um das Golden Window zu aktivieren.
        </p>
      </DialogContent>
    </Dialog>
  );
}
