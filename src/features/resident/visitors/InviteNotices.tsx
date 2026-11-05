"use client";

import { Callout } from "@/ui/components/Callout";

/**
 * The invite form's error summary — loaded only when a submit fails (the form page stays within the D-179 budget).
 */
export function InviteSummary({ title, items }: { title: string; items: { href: string; label: string }[] }) {
  return (
    <Callout tone="danger" title={title}>
      <ul className="list-disc ps-5">
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href} className="underline underline-offset-2">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </Callout>
  );
}
