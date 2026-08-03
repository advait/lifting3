import * as Effect from "effect/Effect";

import { IdGenerator } from "effect-durable-agent/services/id-generator";

/** Mint a UUIDv7 compatible with EDA's durable event identity contract. */
export const makeEdaEventId = async (): Promise<string> =>
  String(
    await Effect.runPromise(
      Effect.gen(function* () {
        const ids = yield* IdGenerator;
        return yield* ids.makeEventId();
      }).pipe(Effect.provide(IdGenerator.Live)),
    ),
  );
