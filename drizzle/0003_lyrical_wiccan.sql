ALTER TABLE `workout_exercises` ADD `source_exercise_name` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `import_source_system` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `import_source_workout_id` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `import_source_metadata_json` text;