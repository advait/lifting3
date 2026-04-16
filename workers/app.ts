import { createRequestHandler } from "react-router";
import { createAppRouterContext } from "~/lib/.server/router-context";

export { GeneralCoachAgent } from "./general-coach-agent";
export { WorkoutCoachAgent } from "./workout-coach-agent";

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
