import { z } from "zod";
import { paperSchema, readingStateSchema, type Paper, type ReadingState } from "../../types/paper";
import { getDatabase } from "./client";

const paperRowSchema = z.object({
  id: z.string(), content_hash: z.string(), file_path: z.string(), file_name: z.string(), title: z.string(),
  authors_json: z.string(), abstract_text: z.string().nullable(), page_count: z.number(), file_size: z.number(), created_at: z.string(), last_opened_at: z.string(),
});

function mapPaper(value: unknown): Paper {
  const row = paperRowSchema.parse(value);
  const authors: unknown = (() => { try { return JSON.parse(row.authors_json) as unknown; } catch { return []; } })();
  return paperSchema.parse({
    id: row.id, contentHash: row.content_hash, filePath: row.file_path, fileName: row.file_name, title: row.title,
    authors, abstractText: row.abstract_text, pageCount: row.page_count, fileSize: row.file_size, createdAt: row.created_at, lastOpenedAt: row.last_opened_at,
  });
}

export async function listRecentPapers(limit = 10_000): Promise<Paper[]> {
  const database = await getDatabase();
  if (!database) return [];
  const rows = await database.select<unknown[]>("SELECT id,content_hash,file_path,file_name,COALESCE(title,file_name) title,authors_json,abstract_text,COALESCE(page_count,0) page_count,file_size,created_at,last_opened_at FROM papers ORDER BY last_opened_at DESC LIMIT $1", [limit]);
  return rows.map(mapPaper);
}

export async function getReadingState(paperId: string): Promise<ReadingState | null> {
  const database = await getDatabase();
  if (!database) return null;
  const rows = await database.select<Array<Record<string, unknown>>>("SELECT paper_id,page_number,scroll_offset,zoom,zoom_mode,rotation,reading_mode,updated_at FROM paper_reading_states WHERE paper_id=$1", [paperId]);
  const row = rows[0];
  if (!row) return null;
  return readingStateSchema.parse({
    paperId: row.paper_id, pageNumber: row.page_number, scrollOffset: row.scroll_offset, zoom: row.zoom, zoomMode: row.zoom_mode,
    rotation: row.rotation, viewMode: row.reading_mode === "single" ? "single" : "continuous", updatedAt: row.updated_at,
  });
}

export async function saveReadingState(state: ReadingState): Promise<void> {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(
    "INSERT INTO paper_reading_states(paper_id,page_number,zoom,zoom_mode,scroll_offset,rotation,reading_mode,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(paper_id) DO UPDATE SET page_number=excluded.page_number,zoom=excluded.zoom,zoom_mode=excluded.zoom_mode,scroll_offset=excluded.scroll_offset,rotation=excluded.rotation,reading_mode=excluded.reading_mode,updated_at=excluded.updated_at",
    [state.paperId, state.pageNumber, state.zoom, state.zoomMode, state.scrollOffset, state.rotation, state.viewMode, state.updatedAt],
  );
}
