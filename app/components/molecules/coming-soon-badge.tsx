import { Badge } from "~/components/atoms/badge";
import { cn } from "~/lib/utils";

interface ComingSoonBadgeProps {
  className?: string;
}

export function ComingSoonBadge({ className }: ComingSoonBadgeProps) {
  return (
    <Badge
      className={cn(
        "justify-center rounded-full border-primary/30 bg-primary/12 px-2.5 text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]",
        className,
      )}
      variant="outline"
    >
      Coming Soon
    </Badge>
  );
}
