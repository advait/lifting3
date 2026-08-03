import {
  EDASessionDurableObject,
  edaRuntimeConfig,
} from "effect-durable-agent/host/durable-object";
import { makeEDADurableObjectOpenAiModelLayer } from "effect-durable-agent/host/durable-object-runtime";
import { createAppDatabase } from "~/lib/.server/db";
import { coachTargetSchema, type CoachTarget } from "~/features/coach/contracts";

import { DEFAULT_COACH_SYSTEM_PROMPT } from "../coach/prompt";
import { makeCoachPromptProjectorLayer } from "./prompt-projector";
import { coachThreadReducer } from "./reducer";
import { COACH_THREAD_STORAGE_KEY, makeCoachToolRegistry } from "./tools";
import { coachWebSocketWireProtocol } from "./websocket-wire";
import { workoutActivityReducer } from "./workout-activity-reducer";

const DEFAULT_AI_GATEWAY_ID = "default";
const DEFAULT_COACH_MODEL_ID = "gpt-5.4";
const MAX_TOOL_CALLS_PER_RUN = 5;

export class EDACoachAgent extends EDASessionDurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    const db = createAppDatabase(env);

    super(ctx, env, {
      config: edaRuntimeConfig({
        maxToolCallsPerRun: MAX_TOOL_CALLS_PER_RUN,
        modelId: DEFAULT_COACH_MODEL_ID,
        provider: "openai",
        systemPrompt: DEFAULT_COACH_SYSTEM_PROMPT,
      }),
      modelLayer: makeEDADurableObjectOpenAiModelLayer({
        aiGateway: env.AI.gateway(DEFAULT_AI_GATEWAY_ID),
        modelId: DEFAULT_COACH_MODEL_ID,
      }),
      promptProjectorLayer: makeCoachPromptProjectorLayer(db),
      reducers: [coachThreadReducer, workoutActivityReducer],
      toolRegistry: makeCoachToolRegistry({ db, env, storage: ctx.storage }),
      webSocketProtocol: coachWebSocketWireProtocol,
    });
  }

  /** Keeps tool scope available without making it a second source of durable product state. */
  async bindThread(targetInput: unknown): Promise<void> {
    const target = coachTargetSchema.parse(targetInput);
    const stored = await this.ctx.storage.get<unknown>(COACH_THREAD_STORAGE_KEY);

    if (stored !== undefined) {
      const parsedStored = coachTargetSchema.parse(stored);
      if (JSON.stringify(parsedStored) !== JSON.stringify(target)) {
        throw new Error("An EDA coach session cannot be rebound to a different thread.");
      }
      return;
    }

    await this.ctx.storage.put(COACH_THREAD_STORAGE_KEY, target satisfies CoachTarget);
  }
}
