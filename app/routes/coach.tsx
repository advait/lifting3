import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

import type { Route } from "./+types/coach";

export const meta: Route.MetaFunction = () => [
  { title: "Coach | lifting3" },
  {
    name: "description",
    content: "General coaching session and planning surface.",
  },
];

export default function Coach() {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Coach</CardTitle>
          <Badge variant="secondary">General Session</Badge>
        </div>
        <CardDescription>
          The general coaching thread will handle planning, historical analysis, and next-workout
          generation.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border/80 p-4">
          <h2 className="font-medium">Planning</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Generate draft workouts from recent history and current constraints.
          </p>
        </div>
        <div className="rounded-xl border border-border/80 p-4">
          <h2 className="font-medium">Analysis</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Ask for progress trends, best sets, and block-level observations.
          </p>
        </div>
        <div className="rounded-xl border border-border/80 p-4">
          <h2 className="font-medium">Guardrails</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Tool surface stays small: create drafts, patch workouts, query history.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
