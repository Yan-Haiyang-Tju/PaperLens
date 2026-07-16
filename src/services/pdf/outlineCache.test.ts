import { describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  getOutlineSnapshot,
  resolveOutlinePage,
  runWithConcurrency,
  subscribeOutline,
} from "./outlineCache";

async function nextTurn() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("outline cache", () => {
  it("publishes titles before destination page lookups finish and caches one load per document", async () => {
    let finishPageIndex: ((value: number) => void) | undefined;
    const getOutline = vi.fn().mockResolvedValue([
      { title: "Introduction", dest: [{ num: 10, gen: 0 }], items: [] },
    ]);
    const getPageIndex = vi.fn(() => new Promise<number>((resolve) => { finishPageIndex = resolve; }));
    const document = { getOutline, getPageIndex, getDestination: vi.fn() } as unknown as PDFDocumentProxy;
    const listener = vi.fn();
    const unsubscribe = subscribeOutline(document, listener);

    await nextTurn();
    const titlesSnapshot = getOutlineSnapshot(document);
    expect(titlesSnapshot.status).toBe("ready");
    expect(titlesSnapshot.items[0]?.title).toBe("Introduction");
    expect(titlesSnapshot.pages.has("outline-0")).toBe(false);
    expect(getOutline).toHaveBeenCalledTimes(1);

    finishPageIndex?.(3);
    await nextTurn();
    expect(getOutlineSnapshot(document).pages.get("outline-0")).toBe(4);
    expect(getOutlineSnapshot(document)).toBe(getOutlineSnapshot(document));
    expect(getOutline).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("deduplicates named destinations and page references", async () => {
    const reference = { num: 7, gen: 0 };
    const getDestination = vi.fn().mockResolvedValue([reference]);
    const getPageIndex = vi.fn().mockResolvedValue(6);
    const document = {
      getOutline: vi.fn().mockResolvedValue([
        { title: "A", dest: "shared", items: [] },
        { title: "B", dest: "shared", items: [] },
      ]),
      getDestination,
      getPageIndex,
    } as unknown as PDFDocumentProxy;

    expect(await resolveOutlinePage(document, "outline-1")).toBe(7);
    await nextTurn();
    expect(getDestination).toHaveBeenCalledTimes(1);
    expect(getPageIndex).toHaveBeenCalledTimes(1);
  });

  it("limits background page-resolution concurrency", async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 12 }, (_, index) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await nextTurn();
      active -= 1;
      return index;
    });

    expect(await runWithConcurrency(tasks, 3)).toEqual(Array.from({ length: 12 }, (_, index) => index));
    expect(peak).toBe(3);
  });

  it("turns destination failures into a resolved empty page", async () => {
    const document = {
      getOutline: vi.fn().mockResolvedValue([{ title: "Broken", dest: "missing", items: [] }]),
      getDestination: vi.fn().mockRejectedValue(new Error("missing destination")),
      getPageIndex: vi.fn(),
    } as unknown as PDFDocumentProxy;

    expect(await resolveOutlinePage(document, "outline-0")).toBeNull();
    expect(getOutlineSnapshot(document).pages.get("outline-0")).toBeNull();
  });

  it("reports outline load failures without notifying an unsubscribed view", async () => {
    const document = {
      getOutline: vi.fn().mockRejectedValue(new Error("damaged outline")),
    } as unknown as PDFDocumentProxy;
    const listener = vi.fn();
    const unsubscribe = subscribeOutline(document, listener);
    unsubscribe();

    await nextTurn();
    expect(getOutlineSnapshot(document).status).toBe("error");
    expect(listener).not.toHaveBeenCalled();
  });
});
