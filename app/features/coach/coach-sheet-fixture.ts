import type { UIMessage } from "ai";

type CoachSheetFixturePart = UIMessage["parts"][number];

export interface CoachSheetFixtureConfig {
  readonly toolCount: number;
  readonly updatesPerTool: number;
  readonly userText: string;
}

export const DEFAULT_FIXTURE_TOOL_COUNT = 4;
export const DEFAULT_FIXTURE_UPDATES_PER_TOOL = 20;
export const DEFAULT_FIXTURE_USER_TEXT = "Make a lot of coach sheet changes.";

function createPatchToolPart(
  index: number,
  state: "input-available" | "input-streaming" | "output-available",
): CoachSheetFixturePart {
  const toolCallId = `fixture-tool-${index + 1}`;
  const input = {
    ops: [
      {
        op: "replace",
        path: `/exercises/${index}/note`,
        value: `change-${index + 1}`,
      },
    ],
    reason: `Apply change ${index + 1}`,
  };

  if (state === "output-available") {
    return {
      input,
      output: {
        applied: [{ summary: `Applied change ${index + 1}` }],
        invalidate: ["workouts:list", "workout:fixture-workout"],
        ok: true,
        version: index + 1,
        workoutId: "fixture-workout",
      },
      state,
      toolCallId,
      type: "tool-patch_workout",
    };
  }

  return {
    input,
    state,
    toolCallId,
    type: "tool-patch_workout",
  };
}

function createStreamingText(
  completedTools: number,
  frameIndex: number,
  toolCount: number,
  toolIndex: number,
) {
  return [
    "Working through your workout changes.",
    "",
    `Emitted ${toolCount} tool calls in a single assistant turn.`,
    `Resolving tool ${toolIndex + 1} of ${toolCount}`,
    `${completedTools} completed`,
    `${"=".repeat(frameIndex + 1)}>`,
    "- validating history",
    "- applying edits",
  ].join("\n");
}

function createUserMessage(userText: string): UIMessage {
  return {
    id: "fixture-user-message",
    parts: [{ text: userText, type: "text" }],
    role: "user",
  };
}

export function getCoachSheetFixtureTotalSteps(config: CoachSheetFixtureConfig) {
  return config.toolCount * config.updatesPerTool;
}

export function createCoachSheetFixtureSnapshot(
  config: Partial<CoachSheetFixtureConfig> & { readonly step: number },
): UIMessage[] {
  const userText = config.userText?.trim() || DEFAULT_FIXTURE_USER_TEXT;
  const toolCount = Math.max(1, config.toolCount ?? DEFAULT_FIXTURE_TOOL_COUNT);
  const updatesPerTool = Math.max(1, config.updatesPerTool ?? DEFAULT_FIXTURE_UPDATES_PER_TOOL);
  const completedTools = Math.floor(config.step / updatesPerTool);
  const activeToolIndex = Math.min(completedTools, toolCount - 1);
  const frameIndex = config.step % updatesPerTool;
  const parts: CoachSheetFixturePart[] = [
    {
      text: createStreamingText(completedTools, frameIndex, toolCount, activeToolIndex),
      type: "text",
    },
  ];

  for (let toolIndex = 0; toolIndex < toolCount; toolIndex += 1) {
    const toolState =
      toolIndex < completedTools
        ? "output-available"
        : toolIndex === completedTools
          ? "input-streaming"
          : "input-available";

    parts.push(createPatchToolPart(toolIndex, toolState));
  }

  return [
    createUserMessage(userText),
    {
      id: "fixture-assistant-message",
      parts,
      role: "assistant",
    },
  ];
}

export function createCoachSheetFixtureCompletedSnapshot(
  config: Partial<Omit<CoachSheetFixtureConfig, "updatesPerTool">>,
): UIMessage[] {
  const userText = config.userText?.trim() || DEFAULT_FIXTURE_USER_TEXT;
  const toolCount = Math.max(1, config.toolCount ?? DEFAULT_FIXTURE_TOOL_COUNT);

  return [
    createUserMessage(userText),
    {
      id: "fixture-assistant-message",
      parts: [
        {
          text: "Finished applying the requested workout updates.",
          type: "text",
        },
        ...Array.from({ length: toolCount }, (_, index) =>
          createPatchToolPart(index, "output-available"),
        ),
      ],
      role: "assistant",
    },
  ];
}
