import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { createSettingsService } from "../../app/features/settings/d1-service.server";
import * as dbSchema from "../../app/lib/.server/db/schema";

const db = drizzle(env.DB, { schema: dbSchema });
const settingsService = createSettingsService(db);

beforeEach(async () => {
  await db.delete(dbSchema.appSettings);
});

describe("createSettingsService user profile persistence", () => {
  it("stores and reloads the saved user profile", async () => {
    expect(await settingsService.loadUserProfile()).toBeNull();

    const result = await settingsService.setUserProfile(
      "Goal: build strength\nConstraint: train 3 days per week",
    );

    expect(result).toMatchObject({
      action: "set_user_profile",
      cleared: false,
      ok: true,
      userProfile: "Goal: build strength\nConstraint: train 3 days per week",
    });
    expect(await settingsService.loadUserProfile()).toBe(
      "Goal: build strength\nConstraint: train 3 days per week",
    );
  });

  it("clears the saved user profile when set to null", async () => {
    await settingsService.setUserProfile("Goal: cut weight while keeping squat strength");

    const result = await settingsService.setUserProfile(null);

    expect(result).toMatchObject({
      action: "set_user_profile",
      cleared: true,
      ok: true,
      userProfile: null,
    });
    expect(await settingsService.loadUserProfile()).toBeNull();
  });
});
