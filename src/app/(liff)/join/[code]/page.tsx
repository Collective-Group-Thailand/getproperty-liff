import { redirect } from "next/navigation";

/** `/join/{code}` (the pack's short form) is the same invitation as `/link/unit?code=` (the API's link). */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/link/unit?code=${encodeURIComponent(code)}`);
}
