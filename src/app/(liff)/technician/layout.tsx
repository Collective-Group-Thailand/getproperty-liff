import { notFound } from "next/navigation";

import { technicianEnabled } from "@/lib/flags";

/** The technician screens exist only where `FEATURE_TECHNICIAN=1` (per deployment, read at request time). */
export default function TechnicianLayout({ children }: { children: React.ReactNode }) {
  if (!technicianEnabled()) notFound();
  return children;
}
