import { CoachSheetFixtureScreen } from "~/components/screens/coach-sheet-fixture-screen";
import { defineAppEventRouteHandle } from "~/features/app-events/client";
import { createGeneralCoachTarget } from "~/features/coach/contracts";
import { createPageMeta } from "~/lib/meta";

import type { Route } from "./+types/coach-sheet-fixture";

export const handle = defineAppEventRouteHandle({
  coachTarget: () => createGeneralCoachTarget(),
  pageTitle: () => "Coach Fixture",
});

export const meta: Route.MetaFunction = ({ location, matches }) =>
  createPageMeta({
    description:
      "Live browser fixture that replays the captured trace8 multi-tool coach stream through a real AIChatAgent.",
    location,
    matches,
    title: "Coach Fixture | lifting3",
  });

export default function CoachSheetFixture() {
  return <CoachSheetFixtureScreen />;
}
