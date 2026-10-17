import { z } from "zod";

import { METRIC_NAMES, RATINGS } from "./rum";

/** What `/bff/rum` accepts (server only — zod stays out of the browser bundle). */
export const rumSchema = z.object({
  name: z.enum(METRIC_NAMES),
  value: z.number().finite().min(0).max(600_000),
  rating: z.enum(RATINGS).optional(),
  navigationType: z.string().max(32).optional(),
  route: z
    .string()
    .max(200)
    .regex(/^\/[\w\-/:.]*$/),
  inClient: z.boolean().nullable(),
  os: z.string().max(16).nullable(),
});
