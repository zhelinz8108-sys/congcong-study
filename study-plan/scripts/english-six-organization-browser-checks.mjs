import assert from "node:assert/strict";
import path from "node:path";

export async function checkEnglishSixOrganization(page, base, output) {
  const checks = [];
  const wholeBook = 'a[href*="/resource/1f47774ac669"]';
  const singleUnit = 'a[href*="/resource/72229cc3e5d6"]';
  await page.goto(`${base}?unit=3&stage=all`);
  await page.getByRole("heading", { name: "Unit 3 · Great people", exact: true }).waitFor();
  const search = page.getByRole("searchbox", { name: "查找资料" });
  await search.fill("基础练习+夯实练习");
  await page.getByText("此分类暂无匹配资料", { exact: true }).waitFor();
  assert.equal(await page.locator(wholeBook).count(), 0);
  await search.fill("语法强基");
  await page.locator(singleUnit).waitFor();
  const links = await page.locator('a[href*="/resource/"]').getAttribute("href");
  assert.ok(links.includes("unit=3"));
  checks.push("whole-book PDF excluded from unit views; individual Unit 3 recovered from batch folder");

  await page.getByRole("button", { name: /^整册与综合/ }).click();
  await page.getByRole("heading", { name: "整册与跨单元资料" }).waitFor();
  assert.equal(await page.getByRole("navigation", { name: "单元", exact: true }).count(), 0);
  await search.fill("基础练习+夯实练习");
  await page.locator(wholeBook).waitFor();
  assert.ok((await page.locator(wholeBook).getAttribute("href")).includes("unit=all"));
  await page.locator(wholeBook).click();
  await page.getByRole("combobox", { name: "页码", exact: true }).waitFor();
  assert.equal(await page.getByRole("combobox", { name: "页码", exact: true }).inputValue(), "1");
  await page.getByRole("link", { name: "← 返回六上目录", exact: true }).click();
  await page.locator(wholeBook).waitFor();
  assert.ok(page.url().includes("view=books"));
  assert.equal(await search.inputValue(), "基础练习+夯实练习");
  await page.getByRole("button", { name: /^单元学习/ }).click();
  await page.getByRole("heading", { name: "Unit 3 · Great people", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Unit 3 · Great people", exact: true }).waitFor();
  checks.push("book opens from page 1; directory preserves collection/search; last unit and refresh restored");

  await page.getByRole("button", { name: /^期中期末/ }).click();
  await page.getByRole("heading", { name: "期中期末复习与测评" }).waitFor();
  assert.equal(await page.getByRole("navigation", { name: "单元", exact: true }).count(), 0);
  await page.getByRole("group", { name: "复习阶段" }).getByRole("button", { name: "期中", exact: true }).click();
  await page.getByRole("heading", { name: "期中复习与测评" }).waitFor();
  const examTitles = await page.locator('a[href*="/resource/"] strong').allTextContents();
  assert.ok(examTitles.length && examTitles.every(t => t.includes("期中") && !t.includes("期末")));
  checks.push("midterm/final audio is separate and period filtering matches titles");

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1000 : 844 });
    for (const [view, query] of [["units", "unit=3&stage=practice"], ["books", "unit=all&stage=targeted"], ["exams", "unit=all&stage=all"]]) {
      await page.goto(`${base}?view=${view}&${query}`);
      await page.getByRole("navigation", { name: "资料范围" }).waitFor();
      await page.locator('a[href*="/resource/"]').first().waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${view} ${width}: page overflow`);
      const buttons = await page.getByRole("navigation", { name: "资料范围" }).getByRole("button").evaluateAll(nodes => nodes.map(n => ({ w: n.clientWidth, scroll: n.scrollWidth })));
      assert.ok(buttons.every(b => b.scroll <= b.w + 1), `${view} ${width}: text overflow`);
      await page.screenshot({ path: path.join(output, `organization-${view}-${width}.png`), fullPage: false });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.getByRole("button", { name: "Unit 8 Then and now", exact: true }).waitFor();
  checks.push("three collection views fit desktop, 390px and 320px with no horizontal overflow");
  return checks;
}
