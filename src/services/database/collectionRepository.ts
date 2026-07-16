import { z } from "zod";
import { collectionSchema, type Collection, type PaperCollectionLink } from "../../types/collection";
import { getDatabase } from "./client";

const collectionRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  parent_id: z.string().nullable(),
  sort_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

function mapCollection(value: unknown): Collection {
  const row = collectionRowSchema.parse(value);
  return collectionSchema.parse({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
export async function listCollections(): Promise<Collection[]> {
  const database = await getDatabase();
  if (!database) return [];
  const rows = await database.select<unknown[]>(
    "SELECT id,name,parent_id,sort_order,created_at,updated_at FROM collections ORDER BY sort_order,name COLLATE NOCASE",
  );
  return rows.map(mapCollection);
}

export async function listPaperCollectionLinks(): Promise<PaperCollectionLink[]> {
  const database = await getDatabase();
  if (!database) return [];
  return database.select<PaperCollectionLink[]>(
    "SELECT paper_id paperId,collection_id collectionId FROM paper_collections",
  );
}

export async function createCollection(name: string, parentId: string | null): Promise<Collection> {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 120) throw new Error("文件夹名称应为 1–120 个字符。");
  const database = await getDatabase();
  const now = new Date().toISOString();
  const collection = collectionSchema.parse({
    id: crypto.randomUUID(),
    name: normalizedName,
    parentId,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  });
  if (database) {
    await database.execute(
      "INSERT INTO collections(id,name,parent_id,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6)",
      [collection.id, collection.name, collection.parentId, collection.sortOrder, collection.createdAt, collection.updatedAt],
    );
  }
  return collection;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 120) throw new Error("文件夹名称应为 1–120 个字符。");
  const database = await getDatabase();
  if (!database) return;
  await database.execute(
    "UPDATE collections SET name=$2,updated_at=$3 WHERE id=$1",
    [id, normalizedName, new Date().toISOString()],
  );
}

export async function deleteCollection(id: string): Promise<void> {
  const database = await getDatabase();
  if (database) await database.execute("DELETE FROM collections WHERE id=$1", [id]);
}

export async function setPaperInCollection(paperId: string, collectionId: string, included: boolean): Promise<void> {
  const database = await getDatabase();
  if (!database) return;
  if (included) {
    await database.execute(
      "INSERT OR IGNORE INTO paper_collections(paper_id,collection_id) VALUES($1,$2)",
      [paperId, collectionId],
    );
  } else {
    await database.execute(
      "DELETE FROM paper_collections WHERE paper_id=$1 AND collection_id=$2",
      [paperId, collectionId],
    );
  }
}
