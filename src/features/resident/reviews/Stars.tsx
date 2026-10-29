import { cn } from "@/ui/lib/cn";

/** A five-point star drawn for the rating (getproperty's own shape; the curated icon set has none). */
export function StarShape({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
      className={cn(filled ? "text-primary" : "text-muted", className)}
    >
      <path
        d="M12 2.8l2.73 5.8 6.33.78-4.67 4.36 1.2 6.26L12 16.9l-5.59 3.1 1.2-6.26-4.67-4.36 6.33-.78z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
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
