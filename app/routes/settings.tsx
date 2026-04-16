import { DatabaseZapIcon, RulerIcon, Settings2Icon, SlidersHorizontalIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
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
    description:
      "Set unit preferences, bar math conventions, and default rest or RPE behavior so every workout starts with the right assumptions already in place.",
    icon: RulerIcon,
    title: "Training Defaults",
  },
  {
    description:
      "Define the equipment you actually have access to so planning, substitutions, and exercise suggestions stay grounded in the room you train in.",
    icon: SlidersHorizontalIcon,
    title: "Equipment Rules",
  },
  {
    description:
      "Expose import state, schema diagnostics, and local environment controls so data movement and operational checks stay visible without leaving the app.",
    icon: DatabaseZapIcon,
    title: "Data + Diagnostics",
  },
] as const;

export default function Settings() {
  return (
    <section className="grid gap-4">
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-lg shadow-black/10">
        <CardHeader className="gap-4 border-border/70 border-b bg-linear-to-br from-white/[0.035] via-transparent to-secondary/10">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className="border-secondary/35 bg-secondary/22 text-secondary-foreground"
              variant="outline"
            >
              Coming Soon
            </Badge>
            <span className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Settings
            </span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl space-y-2">
              <CardTitle className="text-2xl sm:text-3xl">
                Configuration that shapes every session.
              </CardTitle>
              <CardDescription className="max-w-xl text-base leading-relaxed text-foreground/72">
                Settings will centralize the defaults, constraints, and environment controls that
                make planning, logging, and analysis behave consistently across the app.
              </CardDescription>
            </div>

            <div className="hidden rounded-2xl border border-white/10 bg-black/10 p-3 text-secondary-foreground md:flex">
              <Settings2Icon className="size-6" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          {SETTINGS_AREAS.map((area) => {
            const Icon = area.icon;

            return (
              <article
                className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.035]"
                key={area.title}
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-black/10 text-secondary-foreground">
                  <Icon className="size-4" />
                </div>
                <h2 className="font-medium text-base tracking-tight">{area.title}</h2>
                <p className="mt-2 text-foreground/68 text-sm leading-relaxed">
                  {area.description}
                </p>
              </article>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
