import { canReadEnglishSixKnowledge } from "@/server/english-six-knowledge-access";
import { getEnglishAtlasPages } from "@/server/grade-six-reviews";
import "@/components/english-atlas.css";

export const metadata = { title: "六上英语知识点图解 · 聪聪学习计划" };

export default async function EnglishAtlasPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await canReadEnglishSixKnowledge()) return null;
  const { id } = await params;
  const pages = await getEnglishAtlasPages();

  return (
    <main className="english-atlas">
      <nav className="ea-nav" aria-label="图册导航">
        <a href={`/subjects/${id}`}>← 英语首页</a>
        <a href="#contents">单元目录</a>
        <a href="/api/grade-six-reviews/english-atlas?download=1" download>下载本册 PDF</a>
      </nav>
      <article className="ea-article" dangerouslySetInnerHTML={{ __html: pages.join("") }} />
      <nav className="ea-nav" aria-label="配套资料">
        <a href="#contents">返回目录</a>
        <a href="/api/grade-six-reviews/english?download=1" download>原版期末复习图册 PDF</a>
        <a href="/api/grade-six-reviews/english-listening?download=1" download>自测听力 MP3</a>
      </nav>
    </main>
  );
}
