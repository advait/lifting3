import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

import type { Route } from "./+types/workouts";

export const meta: Route.MetaFunction = () => [
  { title: "Workouts | lifting3" },
  {
    name: "description",
    content: "Historical workouts and active session entry points.",
  },
];

const WORKOUT_LIST_ITEMS = [
  "Browse historical workouts with fast exercise-level drill-down.",
  "Resume the active workout without losing state.",
  "Import and export versioned workout JSON files via local commands.",
] as const;

export default function Workouts() {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
      <Card className="border-border/70 bg-card/90">
        <CardHeader>
          <CardTitle>Workouts</CardTitle>
          <CardDescription>
            This screen will own the reverse-chronological workout list,
            filtering, and active session resume flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {WORKOUT_LIST_ITEMS.map((item) => (
            <div
              className="rounded-xl border border-border/80 border-dashed px-4 py-3 text-muted-foreground text-sm"
              key={item}
            >
              {item}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/90">
        <CardHeader>
          <CardTitle>Import / Export Boundary</CardTitle>
          <CardDescription>
            MVP supports local commands only. No HTTP import/export endpoints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-muted-foreground text-sm">
          <p>Per-workout JSON files validated by a shared Zod schema.</p>
          <p>
            `lifting2` migration will happen out of band through the same
            format.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
