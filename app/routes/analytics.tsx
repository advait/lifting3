import { ActivityIcon, Clock3Icon, DumbbellIcon } from "lucide-react";

import { ComingSoonBadge } from "~/components/coming-soon-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

import type { Route } from "./+types/analytics";

export const meta: Route.MetaFunction = () => [
  { title: "Analytics | lifting3" },
  {
    name: "description",
    content: "Strength trends, training volume, and workout drill-downs across your history.",
  },
];

const ANALYTICS_REPORTS = [
  {
    description: "Best sets, top load, and estimated strength trends for each lift.",
    icon: DumbbellIcon,
    title: "Strength progress",
  },
  {
    description: "Weekly volume, session density, and training frequency across your history.",
    icon: ActivityIcon,
    title: "Volume + frequency",
  },
  {
    description: "Direct links from every report back to the workouts that produced the numbers.",
    icon: Clock3Icon,
    title: "Workout drill-down",
  },
] as const;

export default function Analytics() {
  return (
    <section className="grid gap-4">
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-lg shadow-black/10">
        <CardHeader className="gap-3 border-border/70 border-b bg-white/[0.02]">
          <div>
            <ComingSoonBadge />
          </div>
          <CardTitle className="text-2xl tracking-tight sm:text-3xl">Exercise analytics</CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-relaxed text-foreground/72 sm:text-base">
            Track PRs, estimated strength, training volume, and frequency trends, then jump back to
            the workouts behind each change.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {ANALYTICS_REPORTS.map((report) => {
            const Icon = report.icon;

            return (
              <div
                className="grid gap-3 border-border/70 border-t px-4 py-4 first:border-t-0 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:px-5"
                key={report.title}
              >
                <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-primary">
                  <Icon className="size-4" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-medium text-base tracking-tight">{report.title}</h2>
                  <p className="text-foreground/68 text-sm leading-relaxed">{report.description}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
