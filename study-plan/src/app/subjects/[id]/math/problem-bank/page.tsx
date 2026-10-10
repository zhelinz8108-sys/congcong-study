import { Grade6BankDirectory } from "@/components/grade6-bank";
import { getBankManifest } from "@/server/grade6-bank/bank";

export default async function MathProblemBankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Grade6BankDirectory subjectId={id} manifest={await getBankManifest()} />;
}
