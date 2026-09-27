import Link from "next/link";
import finalReviewContent from "@/data/english-final-review-content.json";
import FinalReviewViewer from "./final-review-viewer";
import type { ReviewDocument } from "./final-review-viewer";

type PageProps = {
  params: Promise<{ id: string }>;
};

const SECTION_ORDER = [
  "知识整理",
  "过关+语法",
  "专项练习",
  "其他资料",
] as const;

const SECTION_RANK = new Map(
  SECTION_ORDER.map((section, index) => [section, index])
);

const CHINESE_NUMERAL_RANK: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function parseDocumentOrder(document: ReviewDocument) {
  const text = `${document.title} ${document.sourceFile}`;
  const unitMatch = text.match(/(?:unit|u)\s*(\d+)/i);
  if (unitMatch) return Number(unitMatch[1]);

  const specialMatch = text.match(/专项\s*([一二三四五六七八九十]|\d+)/);
  if (!specialMatch) return 999;

  return CHINESE_NUMERAL_RANK[specialMatch[1]] ?? Number(specialMatch[1]);
}

function compareReviewDocuments(left: ReviewDocument, right: ReviewDocument) {
  const categoryDiff =
    (SECTION_RANK.get(left.category) ?? 999) -
    (SECTION_RANK.get(right.category) ?? 999);
  if (categoryDiff !== 0) return categoryDiff;

  const orderDiff = parseDocumentOrder(left) - parseDocumentOrder(right);
  if (orderDiff !== 0) return orderDiff;

  return left.title.localeCompare(right.title, "zh-Hans-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

export default async function FinalReviewPage({ params }: PageProps) {
  const { id } = await params;
  const documents = [
    ...(finalReviewContent.documents as ReviewDocument[]),
  ].sort(compareReviewDocuments);

  return (
    <main className="min-h-screen bg-stone-50 px-5 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href={`/subjects/${id}`}
            className="text-xl text-stone-400 hover:text-stone-600"
          >
            ←
          </Link>
          <div className="h-3 w-3 rounded-full bg-emerald-500" />
          <div>
            <p className="text-xs font-semibold text-stone-400">英语</p>
            <h1 className="text-2xl font-black text-stone-950">期末复习</h1>
          </div>
          <div className="ml-auto rounded-xl border border-emerald-200 bg-white px-3 py-2 text-right shadow-sm">
            <p className="text-sm font-bold text-emerald-800">
              {finalReviewContent.documentCount} 份资料
            </p>
            <p className="text-xs text-stone-400">
              {finalReviewContent.sectionCount} 个小节
            </p>
          </div>
        </div>

        <FinalReviewViewer documents={documents} sectionOrder={SECTION_ORDER} />
      </div>
    </main>
  );
}
