import { describe, expect, it } from "vitest";

import { buildUserProfilePrompt } from "../../workers/coach-agent-helpers";

describe("buildUserProfilePrompt", () => {
  it("describes the durable profile contract and wraps the saved profile in XML", () => {
    const prompt = buildUserProfilePrompt(
      "Goal: reach a 315 squat & stay pain-free\nConstraint: no overhead pressing <for now>",
    );

    expect(prompt).toContain("goals, constraints");
    expect(prompt).toContain("<UserProfile>");
    expect(prompt).toContain("</UserProfile>");
    expect(prompt).toContain("315 squat &amp; stay pain-free");
    expect(prompt).toContain("&lt;for now&gt;");
  });

  it("renders an explicit empty state when no profile has been saved", () => {
    expect(buildUserProfilePrompt(null)).toContain("No saved user profile.");
  });
});
