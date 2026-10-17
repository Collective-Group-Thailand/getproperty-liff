import type { ContractEnum } from "@/lib/api/types";

import { READING_SOURCE as COPIED_READING_SOURCE, type ReadingSource as CopiedReadingSource } from "./index";

/**
 * Meter reading sources (D-012): `ReadingSource` from the contract once B3 publishes readings, else the copied
 * union (`iot | ocr | manual | estimated`, schema-design v2 `smart.reading_source`). The map itself is the copy
 * from getproperty-web (`./index.ts`), re-exported typed to the contract.
 */
export type ReadingSource = ContractEnum<"ReadingSource", CopiedReadingSource>;

export const READING_SOURCE: Record<ReadingSource, (typeof COPIED_READING_SOURCE)[CopiedReadingSource]> =
  COPIED_READING_SOURCE;
