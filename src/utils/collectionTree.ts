import type { Collection } from "../types/collection";

export type CollectionNode = Collection & { children: CollectionNode[] };

export function buildCollectionTree(collections: Collection[]): CollectionNode[] {
  const nodes = new Map(collections.map((collection) => [collection.id, { ...collection, children: [] as CollectionNode[] }]));
  const roots: CollectionNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: CollectionNode[]) => {
    items.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}
export function getCollectionDescendantIds(collections: Collection[], id: string): Set<string> {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const collection of collections) {
      if (collection.parentId && result.has(collection.parentId) && !result.has(collection.id)) {
        result.add(collection.id);
        changed = true;
      }
    }
  }
  return result;
}
