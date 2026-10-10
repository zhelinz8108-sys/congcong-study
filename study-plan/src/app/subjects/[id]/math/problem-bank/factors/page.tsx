import { redirect } from "next/navigation";

// The previous bank is retired. Existing progress is retained, not deleted.
export default async function RetiredBankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/subjects/${id}/math/problem-bank`);
}
