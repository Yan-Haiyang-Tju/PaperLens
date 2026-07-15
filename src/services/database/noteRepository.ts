import { z } from "zod";
import { noteSchema, type Note } from "../../types/annotation";
import { getDatabase } from "./client";

const rowSchema = z.object({
  id: z.string(), paper_id: z.string(), page_number: z.number(), selection_id: z.string().nullable(), highlight_id: z.string().nullable(),
  selected_text: z.string().nullable(), content_markdown: z.string(), tags_json: z.string(), created_at: z.string(), updated_at: z.string(),
});

function mapNote(value: unknown): Note {
  const row = rowSchema.parse(value);
  const tags: unknown = (() => { try { return JSON.parse(row.tags_json) as unknown; } catch { return []; } })();
  return noteSchema.parse({
    id: row.id, paperId: row.paper_id, pageNumber: row.page_number, selectionId: row.selection_id, highlightId: row.highlight_id,
    selectedText: row.selected_text, contentMarkdown: row.content_markdown, tags, createdAt: row.created_at, updatedAt: row.updated_at,
  });
}

export async function listNotes(paperId: string, search = ""): Promise<Note[]> {
  const database = await getDatabase();
  if (!database) return [];
  const term = `%${search.trim()}%`;
  const rows = await database.select<unknown[]>(
    "SELECT id,paper_id,page_number,selection_id,highlight_id,selected_text,content_markdown,tags_json,created_at,updated_at FROM notes WHERE paper_id=$1 AND ($2='%%' OR content_markdown LIKE $2 OR selected_text LIKE $2) ORDER BY updated_at DESC",
    [paperId, term],
  );
  return rows.map(mapNote);
}

export async function saveNote(note: Note, sourceSentence: string | null): Promise<void> {
  if (!note.contentMarkdown.trim()) return;
  const database = await getDatabase();
  if (!database) return;
  await database.execute(
    "INSERT INTO notes(id,paper_id,page_number,selection_id,highlight_id,selected_text,source_sentence,content_markdown,tags_json,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET content_markdown=excluded.content_markdown,tags_json=excluded.tags_json,updated_at=excluded.updated_at",
    [note.id, note.paperId, note.pageNumber, note.selectionId, note.highlightId, note.selectedText, sourceSentence, note.contentMarkdown, JSON.stringify(note.tags), note.createdAt, note.updatedAt],
  );
}

export async function deleteNote(id: string): Promise<void> {
  const database = await getDatabase();
  if (database) await database.execute("DELETE FROM notes WHERE id=$1", [id]);
}
