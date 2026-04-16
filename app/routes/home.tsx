import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

import type { Route } from "./+types/home";

export const meta: Route.MetaFunction = () => [
  { title: "lifting3" },
  {
    name: "description",
    content: "Single-user workout coaching app scaffold.",
  },
];

const STACK = ["TypeScript", "React Router v7", "Tailwind v4", "shadcn/ui", "Ultracite"] as const;

const NOW_CARDS = [
  {
    title: "Spec-driven scaffold",
    body: "Routes and shared shell match the IA in docs/spec.md so implementation can branch from a coherent base.",
  },
  {
    title: "Cloudflare Access perimeter",
    body: "The app assumes perimeter auth. No in-app sign-in or account surface is scaffolded.",
  },
  {
    title: "Workout JSON boundary",
    body: "Historical import/export will run through a versioned Zod-backed JSON interchange format.",
  },
] as const;

export default function Home() {
  return (
    <section className="grid gap-4">
      <Card className="overflow-hidden border-border/70 bg-card/90 shadow-sm">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge>Scaffold in progress</Badge>
              <Badge variant="secondary">Single user</Badge>
            </div>
            <CardTitle className="text-3xl tracking-tight md:text-4xl">
              Workout state first. Agent second.
            </CardTitle>
            <CardDescription className="mt-3 max-w-2xl text-pretty text-base">
              `lifting3` starts from the durable workout model: structured sessions, event-sourced
              changes, local JSON interchange, and a coach embedded into the workflow instead of
              bolted on top.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="/workouts">Open workouts</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/coach">Open coach</a>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {STACK.map((item) => (
            <Badge key={item} variant="outline">
              {item}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {NOW_CARDS.map((card) => (
          <Card className="border-border/70 bg-card/90" key={card.title}>
            <CardHeader>
              <CardTitle className="text-base">{card.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">{card.body}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
