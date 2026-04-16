import { ActivityIcon, ChartColumnBigIcon, Clock3Icon, DumbbellIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
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
    description:
      "Surface best sets, e1RM signals, and top-load progressions so each exercise shows whether strength is climbing, stalling, or ready for a push.",
    icon: DumbbellIcon,
    title: "Strength Progression",
  },
  {
    description:
      "Track session density, weekly volume, and training frequency so workload trends stay visible before they turn into missed lifts or flat weeks.",
    icon: ActivityIcon,
    title: "Workload Trends",
  },
  {
    description:
      "Roll every chart back into the original workout so spikes, PRs, and gaps can be explained by the exact session that created them.",
    icon: Clock3Icon,
    title: "Workout Drill-Down",
  },
] as const;

export default function Analytics() {
  return (
    <section className="grid gap-4">
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-lg shadow-black/10">
        <CardHeader className="gap-4 border-border/70 border-b bg-linear-to-br from-white/[0.035] via-transparent to-primary/8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className="border-primary/30 bg-primary/12 text-primary-foreground"
              variant="outline"
            >
              Coming Soon
            </Badge>
            <span className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Analytics
            </span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl space-y-2">
              <CardTitle className="text-2xl sm:text-3xl">
                Reports built for real training decisions.
              </CardTitle>
              <CardDescription className="max-w-xl text-base leading-relaxed text-foreground/72">
                Analytics will turn raw workout history into clear strength, workload, and recency
                reports so progress can be read in context instead of guessed from memory.
              </CardDescription>
            </div>

            <div className="hidden rounded-2xl border border-white/10 bg-black/10 p-3 text-primary md:flex">
              <ChartColumnBigIcon className="size-6" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          {ANALYTICS_REPORTS.map((report) => {
            const Icon = report.icon;

            return (
              <article
                className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.035]"
                key={report.title}
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-black/10 text-primary">
                  <Icon className="size-4" />
                </div>
                <h2 className="font-medium text-base tracking-tight">{report.title}</h2>
                <p className="mt-2 text-foreground/68 text-sm leading-relaxed">
                  {report.description}
                </p>
              </article>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
