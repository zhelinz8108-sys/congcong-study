import { headers } from "next/headers";
import { consentParams } from "@/server/dot/oauth";

export default async function DotConnect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") query.set(key, value);
  const host = (await headers()).get("host");
  const origin = process.env.NODE_ENV === "production" ? "https://congcong-study.cn" : `http://${host}`;
  const valid = consentParams(query, origin);
  return <main className="mx-auto w-full max-w-lg px-5 py-12">
    <h1 className="text-2xl font-bold text-emerald-950">连接 GPT Dot 练习提醒</h1>
    {valid ? <form method="post" action="/dot/oauth/authorize" className="mt-5 space-y-6">
      <p>允许你的 Dot 在聪聪结束一轮练习时收到练习名称、完成时间和本轮实际答题数。</p>
      {Array.from(query).map(([name, value]) => <input key={name} name={name} value={value} type="hidden" />)}
      <button name="consent" value="allow" className="rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white">允许连接</button>
    </form> : <div className="mt-5 space-y-4">
      <p>在网页版 ChatGPT 的「插件」中选择「添加自定义 MCP 服务器」，填入下面的地址，身份验证选择 OAuth。</p>
      <code className="block break-all rounded border bg-white p-3">{origin}/dot/mcp</code>
      <p>完成家庭账号授权后，在你的 Dot 对话里说「订阅聪聪的练习完成提醒。每次用中文告诉我练习名称和本轮答了几题，每轮单独提醒。」</p>
      <a href="/practice-reports" className="block font-semibold text-emerald-800 underline">在云端聊天里接收每轮练习报告</a>
    </div>}
  </main>;
}
