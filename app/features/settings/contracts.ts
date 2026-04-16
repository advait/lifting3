import { z } from "zod";

export const APP_SETTING_KEYS = ["user_profile"] as const;
export const USER_PROFILE_SETTING_KEY = "user_profile";
export const USER_PROFILE_MAX_LENGTH = 4000;

const isoDateTimeSchema = z.iso.datetime({ offset: true });
const nonEmptyTrimmedStringSchema = z.string().trim().min(1);

export const appSettingKeySchema = z.enum(APP_SETTING_KEYS);
export const userProfileValueSchema = nonEmptyTrimmedStringSchema.max(USER_PROFILE_MAX_LENGTH);

export const appSettingSchema = z.strictObject({
  createdAt: isoDateTimeSchema,
  key: appSettingKeySchema,
  updatedAt: isoDateTimeSchema,
  value: userProfileValueSchema,
});

export const setUserProfileToolInputSchema = z.strictObject({
  userProfile: userProfileValueSchema.nullable(),
});

export const setUserProfileToolResultSchema = z.strictObject({
  action: z.literal("set_user_profile"),
  cleared: z.boolean(),
  ok: z.literal(true),
  updatedAt: isoDateTimeSchema,
  userProfile: userProfileValueSchema.nullable(),
});

export type AppSetting = z.infer<typeof appSettingSchema>;
export type AppSettingKey = z.infer<typeof appSettingKeySchema>;
export type SetUserProfileToolInput = z.infer<typeof setUserProfileToolInputSchema>;
export type SetUserProfileToolResult = z.infer<typeof setUserProfileToolResultSchema>;
