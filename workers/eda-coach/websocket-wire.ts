import { makeEDAWebSocketWireProtocol } from "effect-durable-agent/host/websocket-wire";

import { CoachDurableEvent } from "./events";

export const coachWebSocketWireProtocol = makeEDAWebSocketWireProtocol({
  appEvents: CoachDurableEvent,
});

export const CoachWebSocketServerFrame = coachWebSocketWireProtocol.serverFrame;
export type CoachWebSocketServerFrame = typeof CoachWebSocketServerFrame.Type;
