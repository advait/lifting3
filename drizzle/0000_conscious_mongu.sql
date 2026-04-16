CREATE TABLE `exercise_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`designation` text NOT NULL,
	`status` text NOT NULL,
	`planned_weight_lbs` real,
	`planned_reps` integer,
	`planned_rpe` real,
	`actual_weight_lbs` real,
	`actual_reps` integer,
	`actual_rpe` real,
	`completed_at` text,
	FOREIGN KEY (`exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_sets_exercise_order_unique` ON `exercise_sets` (`exercise_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `exercise_sets_exercise_idx` ON `exercise_sets` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `exercise_sets_status_idx` ON `exercise_sets` (`status`);--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`exercise_schema_id` text NOT NULL,
	`status` text NOT NULL,
	`user_notes` text,
	`coach_notes` text,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_exercises_workout_order_unique` ON `workout_exercises` (`workout_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `workout_exercises_schema_idx` ON `workout_exercises` (`exercise_schema_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`user_notes` text,
	`coach_notes` text
);
--> statement-breakpoint
CREATE INDEX `workouts_date_idx` ON `workouts` (`date`);--> statement-breakpoint
CREATE INDEX `workouts_status_idx` ON `workouts` (`status`);--> statement-breakpoint
CREATE INDEX `workouts_source_idx` ON `workouts` (`source`);--> statement-breakpoint
CREATE INDEX `workouts_updated_at_idx` ON `workouts` (`updated_at`);