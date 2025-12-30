import { useMemo } from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Heart, MessageCircle, Bookmark, Share2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface DailyStats {
  date: string;
  likes_day: number;
  comments_day: number;
  saves_day: number;
  shares_day: number;
  total_interactions: number;
}

interface EngagementChartProps {
  data: DailyStats[];
}

const chartConfig = {
  interactions: {
    label: "Interaktionen",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

export function EngagementChart({ data }: EngagementChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      date: d.date,
      interactions: d.total_interactions || (d.likes_day + d.comments_day + d.saves_day + d.shares_day),
      likes: d.likes_day,
      comments: d.comments_day,
      saves: d.saves_day,
      shares: d.shares_day,
      label: format(parseISO(d.date), "dd. MMM", { locale: de }),
    }));
  }, [data]);

  const totals = useMemo(() => {
    return {
      likes: data.reduce((sum, d) => sum + (d.likes_day || 0), 0),
      comments: data.reduce((sum, d) => sum + (d.comments_day || 0), 0),
      saves: data.reduce((sum, d) => sum + (d.saves_day || 0), 0),
      shares: data.reduce((sum, d) => sum + (d.shares_day || 0), 0),
    };
  }, [data]);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm sm:text-base">Engagement</CardTitle>
        <div className="grid grid-cols-4 gap-2 mt-2">
          <div className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-rose-500" />
            <span className="text-sm font-medium">{totals.likes.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5 text-cyan-500" />
            <span className="text-sm font-medium">{totals.comments.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Bookmark className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-sm font-medium">{totals.saves.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Share2 className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-sm font-medium">{totals.shares.toLocaleString()}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
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
              width={45}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => (
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="font-medium">{Number(value).toLocaleString()} Interaktionen</span>
                      <div className="flex gap-3 text-muted-foreground">
                        <span>❤️ {item.payload.likes}</span>
                        <span>💬 {item.payload.comments}</span>
                        <span>🔖 {item.payload.saves}</span>
                      </div>
                    </div>
                  )}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="interactions"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
