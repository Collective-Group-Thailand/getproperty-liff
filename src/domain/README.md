# src/domain

`status/` — status presentation (tone + icon + label key), **copied from getproperty-web**
(`docs/shared-copies.md`). L1 types each map to the generated contract enums
(`Record<Schemas["InvoiceStatus"], StatusMeta>`, `ServiceRequestStatus`, `WorkOrderStatus`…), so a new
backend enum value fails the build until it has a label, tone and icon.
