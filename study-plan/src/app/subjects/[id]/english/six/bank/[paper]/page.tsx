import EnglishSixBankPractice from "@/components/english-six-bank-practice";
export default async function Page({ params }: { params: Promise<{ id: string; paper: string }> }) {
  const { id, paper } = await params;
  return <EnglishSixBankPractice key={`${id}:${paper}`} subjectId={id} paperId={paper} />;
}
