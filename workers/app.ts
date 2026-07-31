import { createRequestHandler } from "react-router";
import { createAppRouterContext } from "~/lib/.server/router-context";
import { CoachAgent } from "./coach-agent";
import { EDACoachAgent } from "./eda-coach/agent";
import { handleCoachApiRequest } from "./eda-coach/api";

export { CoachAgent, EDACoachAgent };

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

    return requestHandler(request, createAppRouterContext(env, ctx));
  },
} satisfies ExportedHandler<Env>;
