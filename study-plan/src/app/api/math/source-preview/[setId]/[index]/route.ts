import AdmZip from "adm-zip";
import mammoth from "mammoth";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalQuestionSourceFile } from "@/lib/math-local-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMAGE_TYPES: Record<string, string> = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHtml(title: string, body: string) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        background: #fff;
        color: #111827;
        font-family: Arial, Helvetica, "Microsoft YaHei", "PingFang SC", sans-serif;
        line-height: 1.75;
      }
      main {
        max-width: 900px;
        margin: 0 auto;
        padding: 24px;
      }
      img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 12px auto;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 12px 0;
      }
      td, th {
        border: 1px solid #d4d4d4;
        padding: 6px 8px;
        vertical-align: top;
      }
      p { margin: 0 0 10px; }
      .notice {
        border: 1px solid #bfdbfe;
        border-radius: 10px;
        background: #eff6ff;
        color: #1d4ed8;
        padding: 10px 12px;
        font-size: 13px;
        margin-bottom: 18px;
      }
      .media-gallery {
        border-top: 1px solid #e5e5e5;
        margin-top: 28px;
        padding-top: 18px;
      }
      .media-gallery h2 {
        font-size: 16px;
        margin: 0 0 12px;
      }
      .media-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .media-grid figure {
        border: 1px solid #e5e5e5;
        border-radius: 10px;
        margin: 0;
        padding: 8px;
        background: #fafafa;
      }
      .media-grid figcaption {
        margin-top: 6px;
        color: #737373;
        font-size: 12px;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

function markAnswerSection(html: string) {
  const patterns = ["参考答案", "答案解析", "试题解析", "参考答案与解析"];
  for (const pattern of patterns) {
    const index = html.indexOf(pattern);
    if (index > -1) {
      return `${html.slice(0, index)}<div id="answer-start" style="scroll-margin-top:16px"></div>${html.slice(
        index
      )}<script>window.addEventListener("load",function(){var el=document.getElementById("answer-start");if(el)el.scrollIntoView();});</script>`;
    }
  }
  return html;
}

function getDocxMediaGallery(filename: string) {
  const zip = new AdmZip(filename);
  const figures = zip
    .getEntries()
    .filter((entry) => {
      const ext = path.extname(entry.entryName).toLowerCase();
      return entry.entryName.startsWith("word/media/") && IMAGE_TYPES[ext];
    })
    .map((entry) => {
      const ext = path.extname(entry.entryName).toLowerCase();
      const mime = IMAGE_TYPES[ext];
      const src = `data:${mime};base64,${entry.getData().toString("base64")}`;
      return `<figure><img src="${src}" alt="${escapeHtml(
        entry.entryName
      )}" /><figcaption>${escapeHtml(entry.entryName)}</figcaption></figure>`;
    });

  if (figures.length === 0) return "";

  return `<section class="media-gallery">
    <h2>图片素材（从原卷自动抽取）</h2>
    <div class="media-grid">${figures.join("")}</div>
  </section>`;
}

async function renderDocxPreview(filename: string, title: string, focusAnswer: boolean) {
  const result = await mammoth.convertToHtml(
    { path: filename },
    {
      convertImage: mammoth.images.imgElement(async (image) => ({
        src: `data:${image.contentType};base64,${await image.read("base64")}`,
      })),
    }
  );
  const hasUnsupportedOfficeImages =
    result.value.includes("data:image/x-wmf") || result.value.includes("data:image/x-emf");
  const messages =
    result.messages.length > 0
      ? `<div class="notice">部分 Word 元素可能无法完全还原，复杂图表请同时打开原文件核对。</div>`
      : `<div class="notice">这是从原 Word 生成的本地预览，图片会尽量保留。</div>`;
  const imageNotice = hasUnsupportedOfficeImages
    ? `<div class="notice">这份 Word 含有浏览器不支持的 WMF/EMF 公式图片；若看到小破图，请点击“打开文件”用 Word/WPS 查看原文件。</div>`
    : "";
  const content = focusAnswer ? markAnswerSection(result.value) : result.value;
  return wrapHtml(title, `${messages}${imageNotice}${content}${getDocxMediaGallery(filename)}`);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string; index: string }> }
) {
  const { setId, index } = await params;
  const kind = request.nextUrl.searchParams.get("kind") === "answer" ? "answer" : "source";
  const file = await getLocalQuestionSourceFile(setId, kind, Number(index));

  if (!file) {
    return NextResponse.json({ error: "原始文件不存在" }, { status: 404 });
  }

  const ext = path.extname(file.filename).toLowerCase();
  if (ext === ".docx") {
    const html = await renderDocxPreview(file.fullPath, file.filename, kind === "answer");
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (ext === ".pdf") {
    const sourceUrl = `/api/math/source-files/${encodeURIComponent(setId)}/${index}?kind=${kind}`;
    return new NextResponse(
      wrapHtml(
        file.filename,
        `<iframe src="${sourceUrl}" title="${escapeHtml(
          file.filename
        )}" style="width:100%;height:90vh;border:0"></iframe>`
      ),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return new NextResponse(
    wrapHtml(
      file.filename,
      `<div class="notice">这个文件格式暂不支持内嵌预览，请用上方“原卷”按钮下载打开。</div>`
    ),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}
