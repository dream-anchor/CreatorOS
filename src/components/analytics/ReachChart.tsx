import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface DailyStats {
  date: string;
  reach_day: number;
  impressions_day: number;
}

interface ReachChartProps {
  data: DailyStats[];
}

const chartConfig = {
  reach: {
    label: "Reichweite",
    color: "hsl(var(--primary))",
  },
  impressions: {
    label: "Impressionen",
    color: "hsl(var(--secondary))",
  },
} satisfies ChartConfig;

export function ReachChart({ data }: ReachChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      date: d.date,
      reach: d.reach_day,
      impressions: d.impressions_day,
      label: format(parseISO(d.date), "dd. MMM", { locale: de }),
    }));
  }, [data]);

  const totalReach = useMemo(() => {
    return data.reduce((sum, d) => sum + (d.reach_day || 0), 0);
  }, [data]);

  const totalImpressions = useMemo(() => {
    return data.reduce((sum, d) => sum + (d.impressions_day || 0), 0);
  }, [data]);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm sm:text-base">Reichweite & Impressionen</CardTitle>
        <div className="flex gap-6 mt-2">
          <div>
            <p className="text-xs text-muted-foreground">Reichweite</p>
            <p className="text-xl font-bold text-primary">{totalReach.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Impressionen</p>
            <p className="text-xl font-bold text-secondary-foreground">{totalImpressions.toLocaleString()}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
            <XAxis 
              dataKey="label" 
              tickLine={false} 
              axisLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <YAxis 
              tickLine={false} 
              axisLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              tickFormatter={(value) => {
                if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                return value.toString();
              }}
              width={45}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <span>
                      {name === "reach" ? "Reichweite" : "Impressionen"}: {Number(value).toLocaleString()}
                    </span>
                  )}
                />
              }
            />
            <Bar dataKey="reach" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="impressions" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
