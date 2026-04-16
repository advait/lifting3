import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { Badge } from "./components/ui/badge";
import { Separator } from "./components/ui/separator";
import { useAppEventRevalidation } from "./features/app-events/client";
import { cn } from "./lib/utils";
import "./app.css";

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "Home", end: true },
  { to: "/workouts", label: "Workouts" },
  { to: "/coach", label: "Coach" },
  { to: "/analytics", label: "Analytics" },
  { to: "/settings", label: "Settings" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="relative min-h-screen overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_var(--color-primary)_0,_transparent_28%),radial-gradient(circle_at_top_right,_var(--color-secondary)_0,_transparent_24%),linear-gradient(180deg,_transparent_0%,_color-mix(in_oklab,var(--color-background)_90%,white)_100%)] opacity-15" />
          <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pt-5 pb-8 sm:px-6 lg:px-8">
            <header className="mb-6 rounded-2xl border border-border/70 bg-card/80 px-4 py-4 shadow-sm backdrop-blur md:px-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground text-sm shadow-sm">
                    L3
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="font-semibold text-lg tracking-tight">
                        lifting3
                      </h1>
                      <Badge variant="secondary">Scaffold</Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      Single-user workout coaching app behind Cloudflare Access.
                    </p>
                  </div>
                </div>
                <nav className="flex flex-wrap items-center gap-2">
                  {NAV_ITEMS.map((item) => (
                    <NavLink
                      className={({ isActive }) =>
                        cn(
                          "rounded-full px-3 py-2 font-medium text-sm transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )
                      }
                      end={item.end}
                      key={item.to}
                      to={item.to}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
              <Separator className="my-4" />
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <span>RR7</span>
                <span>Tailwind v4</span>
                <span>shadcn/ui</span>
                <span>Ultracite</span>
              </div>
            </header>

            <main className="flex-1">{children}</main>
          </div>
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
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-semibold text-2xl tracking-tight">{message}</h1>
        <p className="mt-2 text-muted-foreground">{details}</p>
      </div>
      {stack ? (
        <pre className="mt-4 overflow-x-auto rounded-2xl border border-border bg-muted p-4">
          <code>{stack}</code>
        </pre>
      ) : null}
    </main>
  );
}
