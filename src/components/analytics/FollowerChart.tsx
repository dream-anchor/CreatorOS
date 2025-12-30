import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface DailyStats {
  date: string;
  follower_count: number;
  follower_delta: number;
}

interface FollowerChartProps {
  data: DailyStats[];
}

const chartConfig = {
  followers: {
    label: "Follower",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

export function FollowerChart({ data }: FollowerChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      date: d.date,
      followers: d.follower_count,
      delta: d.follower_delta,
      label: format(parseISO(d.date), "dd. MMM", { locale: de }),
    }));
  }, [data]);

  const totalDelta = useMemo(() => {
    return data.reduce((sum, d) => sum + (d.follower_delta || 0), 0);
  }, [data]);

  const latestFollowers = data[data.length - 1]?.follower_count || 0;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm sm:text-base">Follower-Wachstum</CardTitle>
          <div className="flex items-center gap-2">
            {totalDelta > 0 ? (
              <div className="flex items-center gap-1 text-emerald-500 text-sm font-medium">
                <TrendingUp className="h-4 w-4" />
                +{totalDelta}
              </div>
            ) : totalDelta < 0 ? (
              <div className="flex items-center gap-1 text-rose-500 text-sm font-medium">
                <TrendingDown className="h-4 w-4" />
                {totalDelta}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-muted-foreground text-sm font-medium">
                <Minus className="h-4 w-4" />
                0
              </div>
            )}
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-bold">{latestFollowers.toLocaleString()}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="followerGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              tickFormatter={(value) => value.toLocaleString()}
              width={60}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{Number(value).toLocaleString()} Follower</span>
                      {item.payload.delta !== 0 && (
                        <span className={item.payload.delta > 0 ? "text-emerald-500" : "text-rose-500"}>
                          {item.payload.delta > 0 ? "+" : ""}{item.payload.delta} heute
                        </span>
                      )}
                    </div>
                  )}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="followers"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#followerGradient)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
