import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("workouts", "routes/workouts.tsx"),
  route("coach", "routes/coach.tsx"),
  route("analytics", "routes/analytics.tsx"),
  route("settings", "routes/settings.tsx"),
] satisfies RouteConfig;
