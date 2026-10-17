# src/domain

`status/index.ts` — the status presentation scaffold (tone + icon + label key, `defineStatuses`), **copied from
getproperty-web** (`docs/shared-copies.md`). L1 adds one file per domain owned here — `invoice`, `payment`,
`lease`, `deposit`, `serviceRequest`, `workOrder`, `parcel`, `reading` — typed `ContractEnum<"InvoiceStatus", …>`:
the schema-design v2 values until the contract publishes the enum (CONTRACT-REQUEST #6), the generated enum
afterwards, so a new backend value fails the build until it has a label (`status.*` in `messages/*/shared/status.json`),
a tone and an icon. Late bills are amber, never red (D-100).
