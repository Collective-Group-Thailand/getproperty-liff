"use client";

import { useFieldGroupProps } from "@/ui/components/Field";

/**
 * For a control inside `<Field>` that keeps an id of its own (an error summary's `#anchor`, a focus target): its id
 * replaces the Field's, so the Field's `<label for>` no longer reaches it. This names it by the same visible label
 * through `aria-labelledby` instead (axe `label`, WCAG 4.1.2). Render it as the Field's child.
 */
export function FieldNamed({ children }: { children: (named: { "aria-labelledby"?: string }) => React.ReactNode }) {
  const labelledBy = useFieldGroupProps()["aria-labelledby"];
  return <>{children(labelledBy ? { "aria-labelledby": labelledBy } : {})}</>;
}
