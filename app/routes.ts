import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("debug/coach-sheet-fixture", "routes/coach-sheet-fixture.tsx"),
  route("workouts", "routes/workouts.tsx", [
    index("routes/workouts-index.tsx"),
    route(":workoutId", "routes/workout-detail.tsx"),
  ]),
  route("exercises", "routes/exercises.tsx"),
  route("analytics", "routes/analytics.tsx"),
  route("settings", "routes/settings.tsx"),
] satisfies RouteConfig;
