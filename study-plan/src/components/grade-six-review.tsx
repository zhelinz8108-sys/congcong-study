export function GradeSixReview({ subject }: { subject: "math" | "english" }) {
  const english = subject === "english";
  const title = english ? "六上英语期末复习图册" : "六上数学期末复习图册";
  const pdf = `/api/grade-six-reviews/${subject}`;
  const audio = "/api/grade-six-reviews/english-listening";
  const linkStyle = "inline-flex min-h-11 items-center rounded-lg px-3 font-semibold underline underline-offset-4 focus-visible:outline-2";

  return (
    <section aria-label={title} className="mb-5 rounded-xl border border-stone-200 bg-white p-5 text-stone-900">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-stone-600">
        {english
          ? "图解版 · 55 页 · Unit 1–8 看图对话、语法与读写。第 41–44 页可单独打印做期末自测。"
          : "图解增强版 · 51 页 · 7 个单元、4 个综合实践，配看图例题、随页自测和答案解析。"}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={pdf} target="_blank" rel="noopener" className={`inline-flex min-h-11 items-center rounded-lg px-4 font-semibold text-white focus-visible:outline-2 ${english ? "bg-emerald-700 hover:bg-emerald-800" : "bg-blue-700 hover:bg-blue-800"}`}>打开图册</a>
        <a href={`${pdf}?download=1`} download className={linkStyle}>下载 PDF</a>
      </div>
      {english && (
        <div className="mt-4 border-t border-stone-200 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <h3 className="text-base font-semibold">第 41 页自测听力</h3>
            <a href={`${audio}?download=1`} download className={`${linkStyle} text-sm`}>下载 MP3</a>
          </div>
          <audio aria-label="六上英语期末自测听力" controls preload="none" src={audio} className="mt-1 w-full max-w-md" />
        </div>
      )}
    </section>
  );
}
