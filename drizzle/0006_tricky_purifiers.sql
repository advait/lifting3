CREATE TABLE `workout_event_outbox` (
	`event_id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`workout_version` integer NOT NULL,
	`event_json` text NOT NULL,
	`created_at` text NOT NULL,
	`delivered_at` text,
	`delivery_attempts` integer DEFAULT 0 NOT NULL,
	`last_delivery_error` text
);
--> statement-breakpoint
CREATE INDEX `workout_event_outbox_pending_idx` ON `workout_event_outbox` (`delivered_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `workout_event_outbox_workout_idx` ON `workout_event_outbox` (`workout_id`,`workout_version`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`exercise_schema_id` text NOT NULL,
	`status` text NOT NULL,
	`rest_seconds` integer DEFAULT 90 NOT NULL,
	`source_exercise_name` text,
	`user_notes` text,
	`coach_notes` text,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workout_exercises`("id", "workout_id", "order_index", "exercise_schema_id", "status", "rest_seconds", "source_exercise_name", "user_notes", "coach_notes") SELECT "id", "workout_id", "order_index", "exercise_schema_id", "status", "rest_seconds", "source_exercise_name", "user_notes", "coach_notes" FROM `workout_exercises`;--> statement-breakpoint
DROP TABLE `workout_exercises`;--> statement-breakpoint
ALTER TABLE `__new_workout_exercises` RENAME TO `workout_exercises`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `workout_exercises_workout_order_unique` ON `workout_exercises` (`workout_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `workout_exercises_schema_idx` ON `workout_exercises` (`exercise_schema_id`);