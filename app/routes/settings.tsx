import { DatabaseZapIcon, RulerIcon, SlidersHorizontalIcon } from "lucide-react";

import { ComingSoonBadge } from "~/components/coming-soon-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

import type { Route } from "./+types/settings";

export const meta: Route.MetaFunction = () => [
  { title: "Settings | lifting3" },
  {
    name: "description",
    content: "Training defaults, unit preferences, equipment rules, and environment controls.",
  },
];

const SETTINGS_AREAS = [
  {
    description: "Unit preferences, bar math, and default rest or RPE behavior for new workouts.",
    icon: RulerIcon,
    title: "Training defaults",
  },
  {
    description: "Available equipment, substitution rules, and exercise constraints for planning.",
    icon: SlidersHorizontalIcon,
    title: "Equipment rules",
  },
  {
    description: "Import status, schema diagnostics, and local environment controls.",
    icon: DatabaseZapIcon,
    title: "Data + diagnostics",
  },
] as const;

export default function Settings() {
  return (
    <section className="grid gap-4">
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-lg shadow-black/10">
        <CardHeader className="gap-3 border-border/70 border-b bg-white/[0.02]">
          <div>
            <ComingSoonBadge />
          </div>
          <CardTitle className="text-2xl tracking-tight sm:text-3xl">Workout settings</CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-relaxed text-foreground/72 sm:text-base">
            Set the defaults and constraints that shape planning, logging, and data handling across
            the app.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {SETTINGS_AREAS.map((area) => {
            const Icon = area.icon;

            return (
              <div
                className="grid gap-3 border-border/70 border-t px-4 py-4 first:border-t-0 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:px-5"
                key={area.title}
              >
                <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-secondary-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-medium text-base tracking-tight">{area.title}</h2>
                  <p className="text-foreground/68 text-sm leading-relaxed">{area.description}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
