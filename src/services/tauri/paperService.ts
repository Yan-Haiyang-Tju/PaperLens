import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { paperSchema, type Paper } from "../../types/paper";

const browserFiles = new Map<string, Uint8Array>();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function paperFromBrowserFile(file: File): Promise<Paper> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentHash = toHex(await crypto.subtle.digest("SHA-256", bytes));
  const now = new Date().toISOString();
  browserFiles.set(contentHash, bytes);
  return paperSchema.parse({
    id: contentHash,
    contentHash,
    filePath: `browser://${file.name}`,
    fileName: file.name,
    title: file.name.replace(/\.pdf$/i, ""),
    authors: [],
    abstractText: null,
    pageCount: 0,
    fileSize: file.size,
    createdAt: now,
    lastOpenedAt: now,
  });
}

function pickBrowserFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files?.item(0) ?? null;
      input.remove();
      resolve(file);
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function importPaper(path: string): Promise<Paper> {
  return paperSchema.parse(await invoke("import_pdf", { path }));
}

export async function chooseAndImportPaper(): Promise<Paper | null> {
  if (!isTauri()) {
    const file = await pickBrowserFile();
    return file ? paperFromBrowserFile(file) : null;
  }
  const path = await open({ multiple: false, directory: false, filters: [{ name: "PDF 文档", extensions: ["pdf"] }] });
  return typeof path === "string" ? importPaper(path) : null;
}

export async function readPaperBytes(paper: Pick<Paper, "id" | "filePath">): Promise<Uint8Array> {
  if (!isTauri()) {
    const bytes = browserFiles.get(paper.id);
    if (!bytes) throw new Error("浏览器预览无法在刷新后重新读取文件，请再次打开 PDF。");
    return bytes.slice();
  }
  const response = await invoke<ArrayBuffer>("read_pdf_bytes", { paperId: paper.id, path: paper.filePath });
  return new Uint8Array(response);
}

export async function updatePaperMetadata(paperId: string, metadata: { title: string; authors: string[]; abstractText: string | null; pageCount: number }): Promise<void> {
  if (!isTauri()) return;
  await invoke("update_paper_metadata", { paperId, ...metadata });
}

export async function listenForPdfDrops(onPaper: (paper: Paper) => void, onError: (error: Error) => void): Promise<() => void> {
  if (!isTauri()) {
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type === "application/pdf" || item.name.toLowerCase().endsWith(".pdf"));
      if (file) void paperFromBrowserFile(file).then(onPaper).catch((reason: unknown) => onError(reason instanceof Error ? reason : new Error(String(reason))));
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => { window.removeEventListener("dragover", onDragOver); window.removeEventListener("drop", onDrop); };
  }

  return getCurrentWindow().onDragDropEvent((event) => {
    if (event.payload.type !== "drop") return;
    const path = event.payload.paths.find((item) => item.toLowerCase().endsWith(".pdf"));
    if (path) void importPaper(path).then(onPaper).catch((reason: unknown) => onError(reason instanceof Error ? reason : new Error(String(reason))));
  });
}
