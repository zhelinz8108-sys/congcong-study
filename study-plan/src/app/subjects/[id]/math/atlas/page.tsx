import { cookies } from "next/headers";
import { MathAtlasArticle } from "@/components/math-atlas";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken } from "@/lib/family-access";
import { getMathAtlasPages } from "@/server/grade-six-reviews";
import "@/components/math-atlas.css";

export const metadata = { title: "六上数学全知识点图解 · 聪聪学习计划" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

function articleSection(html: string, number: number) {
  // The server verifies the authored HTML against the edition digest before it reaches this route.
  const heading = number === 1 ? "h1" : "h2";
  let item = 0;
  return html.replace(/<(\/?)h3>/g, `<$1${heading}>`).replace(/<(\/?)h4>/g, "<$1h3>")
    .replace(/<span class="seq"><\/span><span>([^<]+)<\/span>/g, (_, label: string) => {
      const id = `review-${number}-${++item}`;
      return `<input id="${id}" class="seq" type="checkbox"><label for="${id}">${label}</label>`;
    });
}

export default async function MathAtlasPage({ params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get(FAMILY_ACCESS_COOKIE)?.value;
  if (!verifyFamilyAccessToken(token).allowed) return null;
  const { id } = await params;
  const sections = await getMathAtlasPages();

  return (
    <main className="math-atlas-web">
      <nav className="atlas-site-nav" aria-label="图册导航">
        <a href={`/subjects/${id}`}>← 数学首页</a>
        <a href="#atlas-2">单元目录</a>
        <a href="#atlas-55">知识点索引</a>
        <a href="/api/grade-six-reviews/math?download=1" download>下载 PDF</a>
      </nav>
      <MathAtlasArticle>
        {sections.map((html, i) => (
          <div id={`atlas-${i + 1}`} className="atlas-topic" key={i}>
            <span id={`page=${i + 1}`} className="atlas-bookmark" aria-hidden="true" />
            <div dangerouslySetInnerHTML={{ __html: articleSection(html, i + 1) }} />
          </div>
        ))}
      </MathAtlasArticle>
    </main>
  );
}
