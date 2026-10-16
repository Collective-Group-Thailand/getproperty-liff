# src/features/technician

External technicians' "my work orders" (R2, audience `technician`, `/v1/technician/*`), behind
`FEATURE_TECHNICIAN=1` until L4. L0: a placeholder list. Technicians never see resident screens and
residents never see these (separate `me` and BFF allow-list in L1).
