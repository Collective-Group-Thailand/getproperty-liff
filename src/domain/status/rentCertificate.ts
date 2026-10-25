import type { Schemas } from "@/lib/api/types";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/** `RentCertificateState` of a rent payment certificate (B7.5, D-253) — liff-owned. */
export type RentCertificateState = Schemas["RentCertificateState"];

export const RENT_CERTIFICATE_STATE = defineStatuses<RentCertificateState>("rentCertificate", {
  requested: { tone: "warning", icon: IconClock },
  issued: { tone: "success", icon: IconCheckCircle },
  declined: { tone: "danger", icon: IconXCircle },
});
