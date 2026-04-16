ALTER TABLE `exercise_sets` RENAME COLUMN "completed_at" TO "confirmed_at";--> statement-breakpoint
UPDATE `exercise_sets`
SET `confirmed_at` = COALESCE(
  `confirmed_at`,
  (
    SELECT COALESCE(
      `workouts`.`completed_at`,
      `workouts`.`updated_at`,
      STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
    FROM `workout_exercises`
    INNER JOIN `workouts` ON `workouts`.`id` = `workout_exercises`.`workout_id`
    WHERE `workout_exercises`.`id` = `exercise_sets`.`exercise_id`
  ),
  STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
)
WHERE `status` = 'done' AND `confirmed_at` IS NULL;--> statement-breakpoint
DROP INDEX `exercise_sets_status_idx`;--> statement-breakpoint
CREATE INDEX `exercise_sets_confirmed_at_idx` ON `exercise_sets` (`confirmed_at`);--> statement-breakpoint
ALTER TABLE `exercise_sets` DROP COLUMN `status`;
