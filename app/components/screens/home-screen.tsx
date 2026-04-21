import { Card, CardDescription, CardHeader, CardTitle } from "~/components/atoms/card";
import { WorkoutListCard } from "~/components/organisms/workout-list-card";
import type { WorkoutListItem } from "~/features/workouts/contracts";

interface HomeScreenProps {
  readonly items: ReadonlyArray<WorkoutListItem>;
}

export function HomeScreen({ items }: HomeScreenProps) {
  const recentWorkouts = items.slice(0, 6);

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Recent Workouts</h1>
      </div>

      {recentWorkouts.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {recentWorkouts.map((item) => (
            <WorkoutListCard item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle>No workouts yet</CardTitle>
            <CardDescription>
              Once workouts exist, the home route will surface the most recent sessions here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </section>
  );
}
