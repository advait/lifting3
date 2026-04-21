import { AnalyticsScreen } from "~/components/screens/analytics-screen";
import { createPageMeta } from "~/lib/meta";

import type { Route } from "./+types/analytics";

export const meta: Route.MetaFunction = ({ location, matches }) =>
  createPageMeta({
    description: "Strength trends, training volume, and workout drill-downs across your history.",
    location,
    matches,
    title: "Analytics | lifting3",
  });

export default function Analytics() {
  return <AnalyticsScreen />;
}
