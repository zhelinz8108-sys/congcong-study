import { notFound } from "next/navigation";
import { getChineseReadingTopic } from "@/lib/chinese-reading";
import { readingPublicPassage } from "@/server/chinese-reading-progress";
import ChineseReadingWorkspace from "@/components/chinese-reading-workspace";

export const dynamic = "force-dynamic";

export default async function ChineseReadingSessionPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params;
  const passage = readingPublicPassage(sessionId);
  if (!passage) notFound();
  return <ChineseReadingWorkspace subjectId={id} passage={passage} topic={getChineseReadingTopic(passage.topicKey)} />;
}
