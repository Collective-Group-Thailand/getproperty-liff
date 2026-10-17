import { redirect } from "next/navigation";

/** The API's LINE deposit-statement message links `/deposits/{id}` (billing-notifications); the page is `/deposit/{id}`. */
export default async function DepositsLinkPage({ params }: { params: Promise<{ depositId: string }> }): Promise<never> {
  const { depositId } = await params;
  redirect(`/deposit/${encodeURIComponent(depositId)}`);
}
