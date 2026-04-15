# Hevy UX Teardown

Scope: public Hevy product pages and help articles, focused on solo workout logging, in-workout editing, history browsing, notes, and PR feedback.

## What Hevy Optimizes For

Hevy is built around a fast live logging loop, with a clear split between a workout you are currently doing and the historical record you can inspect later. The app makes it easy to start from a routine or an empty workout, log sets as you go, then save the session into a history model that can be revisited exercise-by-exercise or workout-by-workout.

## Strengths

- The live workout screen is action-oriented. You can add exercises, mark sets complete, adjust load/reps/RPE, and keep moving without leaving the session.
- Exercise-level notes are first-class. Hevy distinguishes reusable routine notes from one-off workout notes, which is the right model for form cues versus session-specific observations.
- Exercise ordering is explicit and editable. Hevy supports reorder, replace, remove, supersets, and warm-up sets from an in-workout overflow menu, which keeps mid-session changes in one place.
- Historical browsing is strong. You can inspect an exercise history tab, tap into a specific completed workout, and see the actual sets, reps, weights, and RPE that were logged.
- PR feedback is immediate. Hevy surfaces live PR banners when a set completes and a new record is detected, which gives the session a satisfying payoff loop.
- The IA is simple enough to remember. Workout-related actions live in the Workout area, while exercise detail, performance graphs, and history live under Profile/Exercises.

## Weaknesses

- The density of controls can feel hidden behind menus. Many important actions live in overflow menus rather than being directly visible when you need them.
- Hevy appears to optimize for routine reuse more than retrospective editing of old workouts. Historical workouts are viewable and editable, but the flow is not as clearly centered on “treat every old workout as a living object.”
- Notes are split by context, which is conceptually correct, but the UI pattern can be easy to miss if you do not already know the difference between routine notes and workout notes.
- The app leans social and community-oriented outside the core logging loop. That is a product strength for Hevy, but it is extra surface area for a solo app.

## Transferable Ideas For `l3`

- Keep a hard separation between planned template state and logged workout facts.
- Make set completion the primary gesture, and let RPE be the “confirm” action when possible.
- Show stable previous-values context inline during logging so the next set is easy to reason about.
- Support direct in-workout edits for add/remove/reorder/replace without forcing a full workout rewrite.
- Treat workout and exercise notes as different scopes:
  - workout notes for session-level reflections
  - exercise notes for lift-specific coaching cues
- Make the workout detail view the canonical historical record, with a clear path from exercise history to the parent workout and back.
- Reward PRs immediately with lightweight celebration, then preserve the PR in workout history and exercise history views.

## Things To Avoid Copying

- Do not bury the most common workout actions under overflow menus if they can be one tap away.
- Do not conflate routine/template notes with live coaching notes in a way that makes editing ambiguous.
- Do not make historical workouts feel immutable. For `l3`, older sessions should be easy to revise while preserving an audit trail.
- Do not build social/feed features into the first version. Hevy’s broader community layer is useful for them, but it is not required for a solo coaching product.
- Do not let the IA fragment into separate islands for logging, history, analytics, and coaching. The user should be able to move from a workout to its history, notes, and coaching thread without losing context.

## Source Links

- Hevy feature index: https://www.hevyapp.com/features/
- Hevy workout logging and editing overview: https://www.hevyapp.com/features/track-workouts/
- Hevy exercise notes: https://help.hevyapp.com/hc/en-us/articles/34463684392983-How-do-the-exercise-notes-routine-and-workout-notes-work
- Hevy sets, reps, and RPE: https://www.hevyapp.com/features/how-to-write-sets-and-reps/
- Hevy workout set types: https://www.hevyapp.com/features/workout-set-types/
- Hevy workout settings, previous values, and live PR notifications: https://www.hevyapp.com/features/workout-settings/
- Hevy live PR notifications: https://www.hevyapp.com/features/live-pr/
- Hevy exercise performance and history: https://help.hevyapp.com/hc/en-us/articles/35382889578135-Exercise-Performance-Tracking-in-Library-Weight-Bodyweight-Cardio-and-Duration-Based-Exercises
- Hevy exercise library and custom exercises: https://help.hevyapp.com/hc/en-us/articles/35688251991575-Hevy-Exercise-Library-400-Exercises-and-Custom-Exercises
