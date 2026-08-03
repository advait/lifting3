import { createRequestHandler } from "react-router";
import { createAppDatabase } from "~/lib/.server/db";
import { createAppRouterContext } from "~/lib/.server/router-context";
import { CoachAgent } from "./eda-coach/agent";
import { handleCoachApiRequest } from "./eda-coach/api";
import { drainWorkoutEventOutbox } from "./eda-coach/workout-outbox";

export { CoachAgent };

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const coachResponse = await handleCoachApiRequest(request, env);

    if (coachResponse) {
      return coachResponse;
    }

    const response = await requestHandler(request, createAppRouterContext(env, ctx));
    ctx.waitUntil(drainWorkoutEventOutbox(createAppDatabase(env), env, { limit: 25 }));
    return response;
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(drainWorkoutEventOutbox(createAppDatabase(env), env, { limit: 100 }));
  },
} satisfies ExportedHandler<Env>;
