import { SettingsScreen } from "~/components/screens/settings-screen";
import { createPageMeta } from "~/lib/meta";

import type { Route } from "./+types/settings";

export const meta: Route.MetaFunction = ({ location, matches }) =>
  createPageMeta({
    description: "Training defaults, unit preferences, equipment rules, and environment controls.",
    location,
    matches,
    title: "Settings | lifting3",
  });

export default function Settings() {
  return <SettingsScreen />;
}
