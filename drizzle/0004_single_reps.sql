PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_exercise_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`designation` text NOT NULL,
	`reps` integer,
	`planned_weight_lbs` real,
	`planned_rpe` real,
	`actual_weight_lbs` real,
	`actual_rpe` real,
	`confirmed_at` text,
	FOREIGN KEY (`exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_exercise_sets` (
	`id`,
	`exercise_id`,
	`order_index`,
	`designation`,
	`reps`,
	`planned_weight_lbs`,
	`planned_rpe`,
	`actual_weight_lbs`,
	`actual_rpe`,
	`confirmed_at`
)
SELECT
	`id`,
	`exercise_id`,
	`order_index`,
	`designation`,
	COALESCE(`actual_reps`, `planned_reps`) AS `reps`,
	`planned_weight_lbs`,
	`planned_rpe`,
	`actual_weight_lbs`,
	`actual_rpe`,
	`confirmed_at`
FROM `exercise_sets`;
--> statement-breakpoint
DROP TABLE `exercise_sets`;--> statement-breakpoint
ALTER TABLE `__new_exercise_sets` RENAME TO `exercise_sets`;--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_sets_exercise_order_unique` ON `exercise_sets` (`exercise_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `exercise_sets_exercise_idx` ON `exercise_sets` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `exercise_sets_confirmed_at_idx` ON `exercise_sets` (`confirmed_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
