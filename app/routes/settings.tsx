import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

import type { Route } from "./+types/settings";

export const meta: Route.MetaFunction = () => [
  { title: "Settings | lifting3" },
  {
    name: "description",
    content: "Single-user profile and environment settings.",
  },
];

export default function Settings() {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          Profile, equipment, units, and environment-level preferences will live here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-muted-foreground text-sm md:grid-cols-2">
        <div className="rounded-xl border border-border/80 p-4">
          Cloudflare Access handles perimeter auth, so no login or account management is scaffolded
          in the app.
        </div>
        <div className="rounded-xl border border-border/80 p-4">
          Import/export remains a local command workflow, even if settings later exposes schema
          version or diagnostics.
        </div>
      </CardContent>
    </Card>
  );
}
