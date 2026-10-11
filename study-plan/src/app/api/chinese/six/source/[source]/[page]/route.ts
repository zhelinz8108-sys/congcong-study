import { NextResponse } from "next/server";
import { sixBank, sixSourceImage } from "@/server/chinese-six-bank";

export async function GET(_request: Request, context: RouteContext<"/api/chinese/six/source/[source]/[page]">) {
  const { source, page } = await context.params;
  const document = sixBank().sources.find(s => s.id === source);
  const number = Number(page);
  if (!document || !/^\d+$/.test(page) || !Number.isInteger(number) || number < 1 || number > document.pageCount) return new NextResponse("Not found", { status: 404 });
  try {
    const image = sixSourceImage(source, number);
    return new NextResponse(new Uint8Array(image), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
