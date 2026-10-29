import { Icon } from "@/ui/icons";
import { IconStar } from "@/ui/icons/glyphs/star";
import { cn } from "@/ui/lib/cn";

/** One rating star: the curated `star` glyph (synced from getproperty-web), filled when it counts. */
export function StarShape({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <Icon icon={IconStar} size={24} className={cn(filled ? "text-primary fill-current" : "text-muted", className)} />
  );
}

/** A rating read only: five stars and the number for screen readers (`label`, from the caller's copy). */
export function Stars({ rating, label, size = "md" }: { rating: number; label: string; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label} data-rating={rating}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarShape key={n} filled={n <= rating} className={size === "sm" ? "size-4" : "size-5"} />
      ))}
    </span>
  );
}
