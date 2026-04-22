import { createRequestHandler } from "react-router";
import { createAppRouterContext } from "~/lib/.server/router-context";
import { CoachAgent } from "./coach-agent";
import { CoachSheetFixtureAgent } from "./coach-sheet-fixture-agent";

export { CoachAgent };
export { CoachSheetFixtureAgent };

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const { routeAgentRequest } = await import("agents");
    const agentResponse = await routeAgentRequest(request, env);

    if (agentResponse) {
      return agentResponse;
    }

    return requestHandler(request, createAppRouterContext(env, ctx));
  },
} satisfies ExportedHandler<Env>;
