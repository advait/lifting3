import type { ReactNode } from "react";
import { isRouteErrorResponse, Outlet, type UIMatch, useMatches } from "react-router";

import type { Route } from "./+types/root";
import { AppShell } from "./components/organisms/app-shell";
import {
  defineAppEventRouteHandle,
  type AppEventRouteHandle,
  useAppEventRevalidation,
} from "./features/app-events/client";
import { usePwaRegistration } from "./features/pwa/install";
import type { WorkoutAgentTarget, WorkoutListItem } from "./features/workouts/contracts";
import { workoutListSearchSchema } from "./features/workouts/contracts";
import { createWorkoutRouteService } from "./features/workouts/d1-service.server";
import { APP_DESCRIPTION, APP_NAME, createPageMeta } from "./lib/meta";
import { getAppDatabase } from "./lib/.server/router-context";
import "./app.css";

interface RootSidebarLoaderData {
  readonly appOrigin: string;
  readonly recentWorkouts: ReadonlyArray<Pick<WorkoutListItem, "date" | "id" | "status" | "title">>;
}

const DEFAULT_COACH_TARGET = {
  instanceName: "default",
  kind: "general",
} as const satisfies WorkoutAgentTarget;

export const handle = defineAppEventRouteHandle({
  invalidateKeys: () => ["workouts:list"],
});

export const links: Route.LinksFunction = () => [
  { href: "/logo.svg", rel: "icon", sizes: "any", type: "image/svg+xml" },
  { href: "/favicon.ico", rel: "icon", type: "image/x-icon" },
  { href: "/apple-touch-icon.png", rel: "apple-touch-icon", sizes: "180x180" },
  { crossOrigin: "use-credentials", href: "/manifest.webmanifest", rel: "manifest" },
];

export const meta: Route.MetaFunction = ({ location, matches }) =>
  createPageMeta({
    description: APP_DESCRIPTION,
    location,
    matches,
    title: APP_NAME,
  });

export async function loader({ context, request }: Route.LoaderArgs) {
  const search = workoutListSearchSchema.parse({});
  const loaderData = await createWorkoutRouteService(getAppDatabase(context)).loadWorkoutList(
    search,
  );

  return {
    appOrigin: new URL(request.url).origin,
    recentWorkouts: loaderData.items.slice(0, 4).map((item) => ({
      date: item.date,
      id: item.id,
      status: item.status,
      title: item.title,
    })),
  } satisfies RootSidebarLoaderData;
}

function getRootSidebarLoaderData(matches: readonly UIMatch<unknown, AppEventRouteHandle>[]) {
  const rootLoaderData = matches[0]?.loaderData;

  if (
    !rootLoaderData ||
    typeof rootLoaderData !== "object" ||
    !("recentWorkouts" in rootLoaderData)
  ) {
    return null;
  }

  return rootLoaderData as RootSidebarLoaderData;
}

function getPageTitle(
  matches: readonly UIMatch<unknown, AppEventRouteHandle>[],
  fallbackTitle: string,
) {
  for (const match of [...matches].reverse()) {
    const pageTitle = match.handle?.pageTitle?.({
      loaderData: match.loaderData,
      params: match.params,
    });

    if (pageTitle) {
      return pageTitle;
    }
  }

  return fallbackTitle;
}

function getTopBarAction(matches: readonly UIMatch<unknown, AppEventRouteHandle>[]) {
  for (const match of [...matches].reverse()) {
    const topBarAction = match.handle?.topBarAction?.({
      loaderData: match.loaderData,
      params: match.params,
    });

    if (topBarAction) {
      return topBarAction;
    }
  }

  return null;
}

function getCoachTarget(matches: readonly UIMatch<unknown, AppEventRouteHandle>[]) {
  for (const match of [...matches].reverse()) {
    const coachTarget = match.handle?.coachTarget?.({
      loaderData: match.loaderData,
      params: match.params,
    });

    if (coachTarget) {
      return coachTarget;
    }
  }

  return DEFAULT_COACH_TARGET;
}

export function Layout({ children }: { children: ReactNode }) {
  const matches = useMatches() as UIMatch<unknown, AppEventRouteHandle>[];
  const rootSidebarLoaderData = getRootSidebarLoaderData(matches);
  const coachTarget = getCoachTarget(matches);
  const pageTitle = getPageTitle(matches, APP_NAME);
  const topBarAction = getTopBarAction(matches);

  return (
    <AppShell
      coachTarget={coachTarget}
      pageTitle={pageTitle}
      recentWorkouts={rootSidebarLoaderData?.recentWorkouts ?? []}
      topBarAction={topBarAction}
    >
      {children}
    </AppShell>
  );
}

export default function App() {
  useAppEventRevalidation();
  usePwaRegistration();

  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  const errorContent = stack ? `${details}\n\n${stack}` : details;

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-semibold text-2xl tracking-tight">{message}</h1>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/80 bg-muted/35">
          <pre
            className="overflow-x-auto whitespace-pre-wrap break-words p-4 text-foreground/88 text-sm leading-relaxed"
            style={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            }}
          >
            {errorContent}
          </pre>
        </div>
      </div>
    </main>
  );
}
