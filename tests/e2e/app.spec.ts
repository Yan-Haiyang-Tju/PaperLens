import { expect, test } from "@playwright/test";

function createDemoPdf(): Buffer {
  const text = [
    "BT",
    "/F1 24 Tf 72 704 Td (PaperLens Demo Research Paper) Tj",
    "/F1 12 Tf 0 -42 Td (A local-first workflow for close academic reading) Tj",
    "/F1 10 Tf 0 -24 Td (Haiyang Yan - PaperLens Project) Tj",
    "/F1 14 Tf 0 -58 Td (Abstract) Tj",
    "/F1 11 Tf 0 -24 Td (This reproducible document validates PDF rendering, searchable text, and selection.) Tj",
    "0 -18 Td (PaperLens keeps papers and annotations on the reader's own device.) Tj",
    "/F1 14 Tf 0 -52 Td (1. Context-aware reading) Tj",
    "/F1 11 Tf 0 -24 Td (Meaning depends on the sentence, section, and surrounding research argument.) Tj",
    "0 -18 Td (The reader can request a dictionary lookup or a structured AI explanation explicitly.) Tj",
    "/F1 14 Tf 0 -52 Td (2. Local-first data) Tj",
    "/F1 11 Tf 0 -24 Td (Highlights, notes, vocabulary, and reading position are stored in SQLite.) Tj",
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n%PaperLens\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

test("library and settings workflows render without runtime errors", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "全部论文" })).toBeVisible();
  await expect(page.getByText("PaperLens", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加 PDF" })).toBeVisible();

  await page.getByRole("button", { name: "新建根文件夹" }).click();
  await page.getByLabel("名称").fill("具身智能");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("button", { name: "具身智能 0" })).toBeVisible();

  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 解释" })).toBeVisible();
  await page.getByRole("button", { name: "Sepia" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");

  expect(pageErrors).toEqual([]);
});

test("opens and renders a real text-layer PDF", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "添加 PDF" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "paperlens-demo.pdf", mimeType: "application/pdf", buffer: createDemoPdf() });

  await expect(page.locator(".pdf-page canvas")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".textLayer")).toContainText("PaperLens Demo Research Paper", { timeout: 45_000 });
  await expect(page.getByLabel("页码")).toHaveValue("1");
  await expect(page.locator(".page-input span")).toHaveText("/ 1");

  const sentence = page.locator(".textLayer span").filter({ hasText: "Meaning depends on the sentence" }).first();
  const bounds = await sentence.boundingBox();
  if (!bounds) throw new Error("Expected the selected PDF sentence to have visible bounds.");
  await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - .1, bounds.y + bounds.height / 2, { steps: 12 });
  await page.mouse.up();
  const diagnostics = await page.evaluate(() => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const start = range?.startContainer instanceof Element ? range.startContainer : range?.startContainer.parentElement;
    return { text: selection?.toString() ?? "", rects: range?.getClientRects().length ?? 0, page: Boolean(start?.closest(".pdf-page")), shell: Boolean(start?.closest(".pdf-page-shell")) };
  });
  expect(diagnostics).toMatchObject({ rects: 1, page: true, shell: true });
  expect(diagnostics.text.trim()).toBe("Meaning depends on the sentence, section, and surrounding research argument.");
  await expect(page.getByRole("toolbar", { name: "选中文字操作" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "高亮" }).click();
  await page.getByRole("menuitemradio", { name: "黄色" }).click();
  await expect(page.locator(".highlight-rect--yellow")).toBeVisible();

  await sentence.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  });
  await expect(page.getByRole("toolbar", { name: "选中文字操作" })).toBeVisible();
  await page.getByRole("button", { name: "笔记", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "笔记" })).toBeVisible();
  await page.locator(".note-editor__textarea").fill("这是一条上下文笔记。");
  await expect(page.getByText("已保存")).toBeVisible({ timeout: 5_000 });

  await sentence.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  });
  await expect(page.getByRole("toolbar", { name: "选中文字操作" })).toBeVisible();
  await page.getByRole("button", { name: "AI 解释", exact: true }).last().click();
  await page.getByRole("button", { name: "同意并解释" }).click();
  await expect(page.getByRole("heading", { name: "基础释义" })).toBeVisible({ timeout: 10_000 });

  const zoomBefore = await page.locator(".zoom-value").textContent();
  await page.locator(".pdf-viewport").dispatchEvent("wheel", { ctrlKey: true, deltaY: -120, clientX: 500, clientY: 350 });
  await expect.poll(() => page.locator(".zoom-value").textContent()).not.toBe(zoomBefore);
  expect(pageErrors).toEqual([]);

});
