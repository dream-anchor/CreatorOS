import { Button } from "@/components/ui/button";
import { Calendar, RefreshCw } from "lucide-react";

interface DateRangeSelectorProps {
  selectedRange: "7" | "30" | "90";
  onRangeChange: (range: "7" | "30" | "90") => void;
  onSync: () => void;
  isSyncing: boolean;
  lastSyncDate?: string | null;
}

export function DateRangeSelector({ 
  selectedRange, 
  onRangeChange, 
  onSync,
  isSyncing,
  lastSyncDate 
}: DateRangeSelectorProps) {
  const ranges = [
    { value: "7" as const, label: "7 Tage" },
    { value: "30" as const, label: "30 Tage" },
    { value: "90" as const, label: "90 Tage" },
  ];

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          {ranges.map((range) => (
            <Button
              key={range.value}
              variant={selectedRange === range.value ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => onRangeChange(range.value)}
            >
              {range.label}
            </Button>
          ))}
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {lastSyncDate && (
          <span className="text-xs text-muted-foreground">
            Letzter Sync: {new Date(lastSyncDate).toLocaleString("de-DE", { 
              day: "2-digit", 
              month: "2-digit", 
              hour: "2-digit", 
              minute: "2-digit" 
            })}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Synchronisiere..." : "Jetzt synchronisieren"}
        </Button>
      </div>
    </div>
  );
}
