import { z } from "zod";
import type { SelectionContext } from "../../types/selection";
import { termOccurrenceSchema, termSchema, type VocabularyEntry } from "../../types/vocabulary";
import { saveSelection } from "./annotationRepository";
import { getDatabase } from "./client";

const vocabularyRowSchema = z.object({
  term_id: z.string(), normalized_text: z.string(), display_text: z.string(), familiarity: z.string(), term_created_at: z.string(), term_updated_at: z.string(),
  occurrence_id: z.string().nullable(), paper_id: z.string().nullable(), page_number: z.number().nullable(), selection_id: z.string().nullable(),
  selected_text: z.string().nullable(), sentence: z.string().nullable(), paragraph: z.string().nullable(), section_title: z.string().nullable(),
  normalized_rects_json: z.string().nullable(), occurrence_created_at: z.string().nullable(),
});

export async function toggleTermOccurrence(selection: SelectionContext): Promise<boolean> {
  const database = await getDatabase();
  if (!database) return true;
  await saveSelection(selection);
  const normalized = selection.normalizedText.toLocaleLowerCase();
  const now = new Date().toISOString();
  const termId = crypto.randomUUID();
  await database.execute(
    "INSERT INTO terms(id,normalized_text,display_text,familiarity,created_at,updated_at) VALUES($1,$2,$3,'new',$4,$4) ON CONFLICT(normalized_text) DO UPDATE SET display_text=excluded.display_text,updated_at=excluded.updated_at",
    [termId, normalized, selection.selectedText, now],
  );
  const terms = await database.select<Array<{ id: string }>>("SELECT id FROM terms WHERE normalized_text=$1", [normalized]);
  const actualTermId = terms[0]?.id;
  if (!actualTermId) throw new Error("术语保存失败");
  const existing = await database.select<Array<{ id: string }>>("SELECT id FROM term_occurrences WHERE term_id=$1 AND paper_id=$2 AND selection_id=$3", [actualTermId, selection.paperId, selection.id]);
  if (existing[0]) { await database.execute("DELETE FROM term_occurrences WHERE id=$1", [existing[0].id]); return false; }
  await database.execute(
    "INSERT INTO term_occurrences(id,term_id,paper_id,page_number,selection_id,selected_text,sentence,paragraph,section_title,normalized_rects_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [crypto.randomUUID(), actualTermId, selection.paperId, selection.pageNumber, selection.id, selection.selectedText, selection.sentence, selection.paragraph, selection.sectionTitle, JSON.stringify(selection.boundingRects), now],
  );
  return true;
}

export async function listVocabulary(paperId?: string): Promise<VocabularyEntry[]> {
  const database = await getDatabase();
  if (!database) return [];
  const rows = await database.select<unknown[]>(
    `SELECT t.id term_id,t.normalized_text,t.display_text,t.familiarity,t.created_at term_created_at,t.updated_at term_updated_at,
       o.id occurrence_id,o.paper_id,o.page_number,o.selection_id,o.selected_text,o.sentence,o.paragraph,o.section_title,o.normalized_rects_json,o.created_at occurrence_created_at
     FROM terms t LEFT JOIN term_occurrences o ON o.term_id=t.id
     WHERE ($1 IS NULL OR o.paper_id=$1) ORDER BY t.updated_at DESC,o.created_at DESC`,
    [paperId ?? null],
  );
  const entries = new Map<string, VocabularyEntry>();
  for (const value of rows) {
    const row = vocabularyRowSchema.parse(value);
    let entry = entries.get(row.term_id);
    if (!entry) {
      const term = termSchema.parse({ id: row.term_id, normalizedText: row.normalized_text, displayText: row.display_text, familiarity: row.familiarity, createdAt: row.term_created_at, updatedAt: row.term_updated_at });
      entry = { ...term, occurrences: [] };
      entries.set(row.term_id, entry);
    }
    if (row.occurrence_id && row.paper_id && row.page_number && row.selected_text && row.occurrence_created_at) {
      const rects: unknown = (() => { try { return JSON.parse(row.normalized_rects_json ?? "[]") as unknown; } catch { return []; } })();
      entry.occurrences.push(termOccurrenceSchema.parse({
        id: row.occurrence_id, termId: row.term_id, paperId: row.paper_id, pageNumber: row.page_number, selectionId: row.selection_id,
        selectedText: row.selected_text, sentence: row.sentence, paragraph: row.paragraph, sectionTitle: row.section_title, normalizedRects: rects, createdAt: row.occurrence_created_at,
      }));
    }
  }
  return [...entries.values()].filter((entry) => entry.occurrences.length > 0);
}

export async function updateTermFamiliarity(id: string, familiarity: VocabularyEntry["familiarity"]): Promise<void> {
  const database = await getDatabase();
  if (database) await database.execute("UPDATE terms SET familiarity=$1,updated_at=$2 WHERE id=$3", [familiarity, new Date().toISOString(), id]);
}
