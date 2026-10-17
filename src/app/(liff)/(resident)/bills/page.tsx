import { redirect } from "next/navigation";

/** `/bills` (L0's menu path, rich menus that kept it) → the invoice list. */
export default function BillsPage(): never {
  redirect("/invoices");
}
