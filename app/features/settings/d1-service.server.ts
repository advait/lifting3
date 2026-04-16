import { eq } from "drizzle-orm";

import type { AppDatabase } from "../../lib/.server/db/index.ts";
import { appSettings } from "../../lib/.server/db/schema.ts";

import {
  appSettingSchema,
  setUserProfileToolResultSchema,
  USER_PROFILE_SETTING_KEY,
  type SetUserProfileToolResult,
} from "./contracts";

export interface SettingsService {
  loadUserProfile(): Promise<string | null>;
  setUserProfile(userProfile: string | null): Promise<SetUserProfileToolResult>;
}

export function createSettingsService(db: AppDatabase): SettingsService {
  return {
    async loadUserProfile() {
      const row = await db.query.appSettings.findFirst({
        where: eq(appSettings.key, USER_PROFILE_SETTING_KEY),
      });

      if (!row) {
        return null;
      }

      return appSettingSchema.parse(row).value;
    },

    async setUserProfile(userProfile) {
      const updatedAt = new Date().toISOString();

      if (userProfile === null) {
        await db.delete(appSettings).where(eq(appSettings.key, USER_PROFILE_SETTING_KEY));

        return setUserProfileToolResultSchema.parse({
          action: "set_user_profile",
          cleared: true,
          ok: true,
          updatedAt,
          userProfile: null,
        });
      }

      await db
        .insert(appSettings)
        .values({
          createdAt: updatedAt,
          key: USER_PROFILE_SETTING_KEY,
          updatedAt,
          value: userProfile,
        })
        .onConflictDoUpdate({
          set: {
            updatedAt,
            value: userProfile,
          },
          target: appSettings.key,
        });

      return setUserProfileToolResultSchema.parse({
        action: "set_user_profile",
        cleared: false,
        ok: true,
        updatedAt,
        userProfile,
      });
    },
  };
}
