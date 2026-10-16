import ToeflListeningPlayer from '@/components/toefl-listening-player';
import data from '@/data/toefl-listening-6-6.json';
import type { ToeflListeningSet } from '@/lib/toefl-listening';

export const metadata = { title: '托福听力 | 聪聪学习计划' };

export default async function ToeflListeningPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ module?: string; question?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const initial = data.questions.find(q => q.module === Number(query.module) && q.number === Number(query.question));
  return <ToeflListeningPlayer subjectId={id} set={data as ToeflListeningSet} initialQuestion={initial?.id} />;
}
