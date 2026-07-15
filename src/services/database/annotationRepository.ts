import { z } from "zod";
import { highlightSchema, type Highlight } from "../../types/annotation";
import type { SelectionContext } from "../../types/selection";
import { getDatabase } from "./client";

const highlightRowSchema = z.object({
  id: z.string(), paper_id: z.string(), page_number: z.number(), selection_id: z.string().nullable(), selected_text: z.string(),
  normalized_rects_json: z.string(), color: z.string(), created_at: z.string(), updated_at: z.string(),
});

export async function saveSelection(selection: SelectionContext): Promise<void> {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(
    "INSERT INTO selections(id,paper_id,page_number,selected_text,normalized_text,sentence,previous_sentence,next_sentence,paragraph,section_title,normalized_rects_json,extraction_confidence,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO NOTHING",
    [selection.id, selection.paperId, selection.pageNumber, selection.selectedText, selection.normalizedText, selection.sentence, selection.previousSentence, selection.nextSentence, selection.paragraph, selection.sectionTitle, JSON.stringify(selection.boundingRects), selection.extractionConfidence, new Date().toISOString()],
  );
}

export async function saveHighlight(highlight: Highlight): Promise<void> {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(
    "INSERT INTO highlights(id,paper_id,page_number,selection_id,selected_text,normalized_rects_json,color,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [highlight.id, highlight.paperId, highlight.pageNumber, highlight.selectionId, highlight.selectedText, JSON.stringify(highlight.normalizedRects), highlight.color, highlight.createdAt, highlight.updatedAt],
  );
}

export async function listHighlights(paperId: string): Promise<Highlight[]> {
  const database = await getDatabase();
  if (!database) return [];
  const rows = await database.select<unknown[]>("SELECT id,paper_id,page_number,selection_id,selected_text,normalized_rects_json,color,created_at,updated_at FROM highlights WHERE paper_id=$1 ORDER BY page_number,created_at", [paperId]);
  return rows.map((value) => {
    const row = highlightRowSchema.parse(value);
    return highlightSchema.parse({
      id: row.id, paperId: row.paper_id, pageNumber: row.page_number, selectionId: row.selection_id, selectedText: row.selected_text,
      normalizedRects: JSON.parse(row.normalized_rects_json) as unknown, color: row.color, createdAt: row.created_at, updatedAt: row.updated_at,
    });
  });
}

export async function updateHighlightColor(id: string, color: Highlight["color"]): Promise<void> {
  const database = await getDatabase();
  if (database) await database.execute("UPDATE highlights SET color=$1,updated_at=$2 WHERE id=$3", [color, new Date().toISOString(), id]);
}

export async function deleteHighlight(id: string): Promise<void> {
  const database = await getDatabase();
  if (database) await database.execute("DELETE FROM highlights WHERE id=$1", [id]);
}
