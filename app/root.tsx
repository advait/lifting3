import {
  ActivityIcon,
  BotIcon,
  ChartColumnBigIcon,
  DumbbellIcon,
  HouseIcon,
  PanelLeftIcon,
  Settings2Icon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Form,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  type UIMatch,
  useLocation,
  useMatches,
} from "react-router";

import type { Route } from "./+types/root";
import { LocalDateTime } from "./components/local-date-time";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import { CoachSheet } from "./features/coach/coach-sheet";
import {
  defineAppEventRouteHandle,
  type AppEventRouteHandle,
  useAppEventRevalidation,
} from "./features/app-events/client";
import type { WorkoutAgentTarget, WorkoutListItem } from "./features/workouts/contracts";
import { workoutListSearchSchema } from "./features/workouts/contracts";
import { createWorkoutRouteService } from "./features/workouts/d1-service.server";
import { WorkoutStatusBadge } from "./features/workouts/workout-status-badge";
import { getAppDatabase } from "./lib/.server/router-context";
import { cn } from "./lib/utils";
import "./app.css";

type NavigationItem = {
  readonly end?: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly to: string;
};

interface RootSidebarLoaderData {
  readonly appOrigin: string;
  readonly recentWorkouts: ReadonlyArray<Pick<WorkoutListItem, "date" | "id" | "status" | "title">>;
}

const APP_DESCRIPTION =
  "Single-user workout coaching for planning, logging, and reviewing training.";
const APP_NAME = "lifting3";
const APP_SHORT_NAME = "L³";
const BRAND_COLOR = "#f97316";
const SOCIAL_IMAGE_ALT = "L cubed logo in orange on a deep charcoal tile.";

const NAV_ITEMS: ReadonlyArray<NavigationItem> = [
  {
    end: true,
    icon: HouseIcon,
    label: "Home",
    to: "/",
  },
  {
    icon: ActivityIcon,
    label: "Workouts",
    to: "/workouts",
  },
  {
    icon: DumbbellIcon,
    label: "Exercises",
    to: "/exercises",
  },
  {
    icon: ChartColumnBigIcon,
    label: "Analytics",
    to: "/analytics",
  },
  {
    icon: Settings2Icon,
    label: "Settings",
    to: "/settings",
  },
] as const;

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
  { href: "/manifest.webmanifest", rel: "manifest" },
];

export const meta: Route.MetaFunction = ({ loaderData }) => {
  const socialImageUrl = loaderData?.appOrigin ? `${loaderData.appOrigin}/logo.svg` : "/logo.svg";

  return [
    { title: APP_NAME },
    { content: APP_DESCRIPTION, name: "description" },
    { content: APP_NAME, name: "application-name" },
    { content: APP_SHORT_NAME, name: "apple-mobile-web-app-title" },
    { content: "yes", name: "apple-mobile-web-app-capable" },
    { content: "black-translucent", name: "apple-mobile-web-app-status-bar-style" },
    { content: "yes", name: "mobile-web-app-capable" },
    { content: "dark", name: "color-scheme" },
    { content: BRAND_COLOR, name: "theme-color" },
    { content: BRAND_COLOR, name: "msapplication-TileColor" },
    { content: APP_NAME, property: "og:site_name" },
    { content: "website", property: "og:type" },
    { content: socialImageUrl, property: "og:image" },
    { content: SOCIAL_IMAGE_ALT, property: "og:image:alt" },
    { content: "summary", name: "twitter:card" },
    { content: socialImageUrl, name: "twitter:image" },
    { content: SOCIAL_IMAGE_ALT, name: "twitter:image:alt" },
  ];
};

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

const isNavItemActive = (pathname: string, item: NavigationItem): boolean => {
  if (item.end) {
    return pathname === item.to;
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
};

function NavigationLink({ item }: { item: NavigationItem }) {
  const Icon = item.icon;

  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
          isActive
            ? "border-primary/40 bg-primary/12 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_18%,transparent)]"
            : "border-transparent bg-muted/20 hover:border-border/80 hover:bg-card/80",
        )
      }
      end={item.end}
      to={item.to}
    >
      {({ isActive }) => (
        <>
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
              isActive
                ? "border-primary/50 bg-primary text-primary-foreground"
                : "border-border/70 bg-background text-muted-foreground group-hover:border-border",
            )}
          >
            <Icon aria-hidden className="size-4" />
          </div>
          <div
            className={cn(
              "min-w-0 font-medium text-sm tracking-tight",
              isActive ? "text-foreground" : "text-foreground/90",
            )}
          >
            {item.label}
          </div>
        </>
      )}
    </NavLink>
  );
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

function WorkoutsSidebarSection({
  pathname,
  recentWorkouts,
}: {
  pathname: string;
  recentWorkouts: ReadonlyArray<Pick<WorkoutListItem, "date" | "id" | "status" | "title">>;
}) {
  const workoutsActive = pathname === "/workouts" || pathname.startsWith("/workouts/");

  return (
    <section
      className={cn(
        "rounded-2xl border p-2",
        workoutsActive
          ? "border-primary/40 bg-primary/12 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_18%,transparent)]"
          : "border-border/80 bg-card/70",
      )}
    >
      <NavLink
        className={({ isActive }) =>
          cn(
            "group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors",
            isActive ? "bg-background/70" : "hover:bg-background/60",
          )
        }
        to="/workouts"
      >
        {({ isActive }) => (
          <>
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                isActive
                  ? "border-primary/50 bg-primary text-primary-foreground"
                  : "border-border/70 bg-background text-muted-foreground group-hover:border-border",
              )}
            >
              <ActivityIcon aria-hidden className="size-4" />
            </div>
            <div className="min-w-0 font-medium text-sm tracking-tight">Workouts</div>
          </>
        )}
      </NavLink>

      {recentWorkouts.length > 0 ? (
        <div className="mt-2 border-border/70 border-t pt-2">
          <p className="px-2 text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
            Recent
          </p>
          <div className="mt-1 grid gap-1">
            {recentWorkouts.map((workout) => {
              const workoutPath = `/workouts/${workout.id}`;
              const isActive = pathname === workoutPath;

              return (
                <Link
                  className={cn(
                    "rounded-xl px-2 py-2 transition-colors",
                    isActive ? "bg-background/80" : "hover:bg-background/60",
                  )}
                  key={workout.id}
                  to={workoutPath}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate font-medium text-sm">{workout.title}</p>
                    <WorkoutStatusBadge className="shrink-0" size="sm" status={workout.status} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    <LocalDateTime
                      formatOptions={{ dateStyle: "medium" }}
                      value={workout.date}
                      valueKind="calendar-date"
                    />
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
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

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const matches = useMatches() as UIMatch<unknown, AppEventRouteHandle>[];
  const [coachOpen, setCoachOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const rootSidebarLoaderData = getRootSidebarLoaderData(matches);
  const activeItem =
    NAV_ITEMS.find((item) => isNavItemActive(location.pathname, item)) ?? NAV_ITEMS[0];
  const coachTarget = getCoachTarget(matches);
  const coachTargetKey = `${coachTarget.kind}:${coachTarget.instanceName}`;
  const pageTitle = getPageTitle(matches, activeItem.label);
  const topBarAction = getTopBarAction(matches);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!coachOpen && !sidebarOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        setCoachOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [coachOpen, sidebarOpen]);

  return (
    <html className="dark" lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="relative min-h-screen overflow-x-clip">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_var(--color-primary)_0,_transparent_28%),radial-gradient(circle_at_top_right,_var(--color-secondary)_0,_transparent_24%),linear-gradient(180deg,_transparent_0%,_color-mix(in_oklab,var(--color-background)_90%,white)_100%)] opacity-15" />
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/55 backdrop-blur-sm transition-opacity duration-200",
              sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            aria-label="Primary navigation"
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-80 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-y-contain border-r border-border/70 bg-card/92 px-4 py-4 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out",
              sidebarOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]",
            )}
            id="app-sidebar"
          >
            <div className="flex min-h-full flex-col pb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    alt=""
                    className="size-11 shrink-0 rounded-2xl shadow-[0_18px_32px_rgba(249,115,22,0.2)]"
                    height={44}
                    src="/logo.svg"
                    width={44}
                  />
                  <h1 className="truncate font-semibold text-lg tracking-tight">{APP_NAME}</h1>
                </div>
                <Button
                  aria-label="Close navigation"
                  onClick={() => setSidebarOpen(false)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </div>

              <Separator className="my-5" />

              <nav className="flex flex-1 flex-col gap-2 pr-1">
                <NavigationLink item={NAV_ITEMS[0]} />
                <WorkoutsSidebarSection
                  pathname={location.pathname}
                  recentWorkouts={rootSidebarLoaderData?.recentWorkouts ?? []}
                />
                {NAV_ITEMS.slice(2).map((item) => (
                  <NavigationLink item={item} key={item.to} />
                ))}
              </nav>
            </div>
          </aside>

          <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-8 sm:px-6 lg:px-8">
            <header className="sticky top-0 z-30 -mx-4 border-border/70 border-b bg-background/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
                <Button
                  aria-controls="app-sidebar"
                  aria-expanded={sidebarOpen}
                  aria-label="Open navigation"
                  onClick={() => setSidebarOpen(true)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <PanelLeftIcon />
                </Button>

                <h2 className="min-w-0 flex-1 truncate font-semibold text-lg tracking-tight">
                  {pageTitle}
                </h2>

                {topBarAction?.kind === "link" ? (
                  <Button asChild size="sm" variant={topBarAction.variant ?? "outline"}>
                    <Link to={topBarAction.to}>{topBarAction.label}</Link>
                  </Button>
                ) : null}

                {topBarAction?.kind === "form" ? (
                  <Form action={topBarAction.action} method="post">
                    {Object.entries(topBarAction.fields).map(([key, value]) => (
                      <input key={key} name={key} type="hidden" value={value} />
                    ))}
                    <Button size="sm" type="submit" variant={topBarAction.variant ?? "secondary"}>
                      {topBarAction.label}
                    </Button>
                  </Form>
                ) : null}
              </div>
            </header>

            <main className="flex-1 pb-28 pt-6 sm:pb-32">{children}</main>
          </div>

          <Button
            aria-expanded={coachOpen}
            aria-label="Open coach"
            className={cn(
              "fixed z-[35] size-14 rounded-full border border-orange-300/70 bg-orange-500 text-slate-950 shadow-[0_18px_40px_rgba(249,115,22,0.35)] transition-all hover:bg-orange-400 focus-visible:border-orange-200 focus-visible:ring-orange-300/40 sm:size-16",
              coachOpen ? "scale-95 opacity-80" : "scale-100 opacity-100",
            )}
            onClick={() => {
              setCoachOpen((open) => !open);
            }}
            size="icon-lg"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
              right: "calc(env(safe-area-inset-right, 0px) + 1rem)",
            }}
            type="button"
          >
            <BotIcon className="size-5 sm:size-6" />
          </Button>

          <CoachSheet
            isOpen={coachOpen}
            onClose={() => {
              setCoachOpen(false);
            }}
            key={coachTargetKey}
            target={coachTarget}
          />
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  useAppEventRevalidation();

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
