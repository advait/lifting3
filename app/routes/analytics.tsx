import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

import type { Route } from "./+types/analytics";

export const meta: Route.MetaFunction = () => [
  { title: "Analytics | lifting3" },
  { name: "description", content: "Exercise progress and PR trends." },
];

const ANALYTICS_PANELS = [
  "Best historical sets per exercise",
  "e1RM and max-load trend views",
  "Frequency and recency drill-down back to workouts",
] as const;

export default function Analytics() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {ANALYTICS_PANELS.map((panel) => (
        <Card className="border-border/70 bg-card/90" key={panel}>
          <CardHeader>
            <CardTitle className="text-base">{panel}</CardTitle>
            <CardDescription>Placeholder scaffold from the product IA.</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            This route will later consume derived projections from the authoritative workout event
            log.
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
