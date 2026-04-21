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
      "Deterministic browser fixture for replaying high-frequency multi-tool coach-sheet updates.",
    location,
    matches,
    title: "Coach Fixture | lifting3",
  });

export default function CoachSheetFixture() {
  return <CoachSheetFixtureScreen />;
}
