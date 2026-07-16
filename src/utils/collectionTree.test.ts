import { describe, expect, it } from "vitest";
import type { Collection } from "../types/collection";
import { buildCollectionTree, getCollectionDescendantIds } from "./collectionTree";

const collection = (id: string, name: string, parentId: string | null, sortOrder = 0): Collection => ({
  id, name, parentId, sortOrder, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
});
describe("collection tree", () => {
  it("builds nested folders in stable order", () => {
    const tree = buildCollectionTree([
      collection("child", "Child", "root"),
      collection("second", "Second", null, 2),
      collection("root", "Root", null, 1),
    ]);
    expect(tree.map((item) => item.id)).toEqual(["root", "second"]);
    expect(tree[0]?.children[0]?.id).toBe("child");
  });

  it("collects all descendants for inclusive folder filtering", () => {
    expect([...getCollectionDescendantIds([
      collection("a", "A", null), collection("b", "B", "a"), collection("c", "C", "b"), collection("x", "X", null),
    ], "a")]).toEqual(["a", "b", "c"]);
  });
});
