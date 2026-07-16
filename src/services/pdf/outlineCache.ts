import type { PDFDocumentProxy } from "pdfjs-dist";

export type OutlineItem = {
  id: string;
  title: string;
  children: OutlineItem[];
};

export type OutlineSnapshot = {
  status: "loading" | "ready" | "error";
  items: OutlineItem[];
  pages: ReadonlyMap<string, number | null>;
  error: unknown;
};

type RawOutlineItem = {
  title: string;
  dest: string | unknown[] | null;
  items: RawOutlineItem[];
};

type PendingNode = {
  id: string;
  destination: RawOutlineItem["dest"];
};

type OutlineEntry = {
  document: PDFDocumentProxy;
  snapshot: OutlineSnapshot;
  listeners: Set<() => void>;
  namedDestinations: Map<string, Promise<unknown[] | null>>;
  pageIndexes: Map<unknown, Promise<number | null>>;
  nodeResolutions: Map<string, Promise<number | null>>;
  nodes: Map<string, PendingNode>;
  ready: Promise<void>;
  publishQueued: boolean;
};

const cache = new WeakMap<PDFDocumentProxy, OutlineEntry>();

function buildItems(rawItems: RawOutlineItem[], parentId: string): { items: OutlineItem[]; nodes: PendingNode[] } {
  const nodes: PendingNode[] = [];
  const items = rawItems.map((rawItem, index) => {
    const id = `${parentId}-${index}`;
    const children = buildItems(rawItem.items ?? [], id);
    nodes.push({ id, destination: rawItem.dest }, ...children.nodes);
    return { id, title: rawItem.title, children: children.items };
  });
  return { items, nodes };
}

/** Runs every task while ensuring no more than `limit` tasks are active. */
export async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  if (tasks.length === 0) return [];
  const workerCount = Math.max(1, Math.min(Math.floor(limit), tasks.length));
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      const task = tasks[index];
      if (task) results[index] = await task();
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function publish(entry: OutlineEntry) {
  if (entry.publishQueued) return;
  entry.publishQueued = true;
  queueMicrotask(() => {
    entry.publishQueued = false;
    for (const listener of entry.listeners) listener();
  });
}

function setPage(entry: OutlineEntry, id: string, page: number | null) {
  const pages = new Map(entry.snapshot.pages);
  pages.set(id, page);
  entry.snapshot = { ...entry.snapshot, pages };
  publish(entry);
}

async function resolvePage(entry: OutlineEntry, node: PendingNode): Promise<number | null> {
  const existing = entry.nodeResolutions.get(node.id);
  if (existing) return existing;

  const resolution = (async () => {
    try {
      let destination: unknown[] | null = null;
      if (typeof node.destination === "string") {
        let destinationPromise = entry.namedDestinations.get(node.destination);
        if (!destinationPromise) {
          destinationPromise = entry.document.getDestination(node.destination) as Promise<unknown[] | null>;
          entry.namedDestinations.set(node.destination, destinationPromise);
        }
        destination = await destinationPromise;
      } else {
        destination = node.destination;
      }

      const reference = destination?.[0];
      if (!reference) return null;
      let pagePromise = entry.pageIndexes.get(reference);
      if (!pagePromise) {
        pagePromise = entry.document
          .getPageIndex(reference as Parameters<PDFDocumentProxy["getPageIndex"]>[0])
          .then((pageIndex) => pageIndex + 1)
          .catch(() => null);
        entry.pageIndexes.set(reference, pagePromise);
      }
      return await pagePromise;
    } catch {
      return null;
    }
  })();

  entry.nodeResolutions.set(node.id, resolution);
  const page = await resolution;
  setPage(entry, node.id, page);
  return page;
}

function createEntry(document: PDFDocumentProxy): OutlineEntry {
  const entry: OutlineEntry = {
    document,
    snapshot: { status: "loading", items: [], pages: new Map(), error: null },
    listeners: new Set<() => void>(),
    namedDestinations: new Map<string, Promise<unknown[] | null>>(),
    pageIndexes: new Map<unknown, Promise<number | null>>(),
    nodeResolutions: new Map<string, Promise<number | null>>(),
    nodes: new Map<string, PendingNode>(),
    ready: Promise.resolve(),
    publishQueued: false,
  };

  entry.ready = (async () => {
    try {
      const rawItems = (await document.getOutline() ?? []) as unknown as RawOutlineItem[];
      const built = buildItems(rawItems, "outline");
      entry.nodes = new Map(built.nodes.map((node) => [node.id, node]));
      entry.snapshot = { status: "ready", items: built.items, pages: new Map(), error: null };
      publish(entry);

      // Resolve page labels progressively in the background. A clicked entry can
      // bypass this queue through resolveOutlinePage without duplicating work.
      void runWithConcurrency(built.nodes.map((node) => () => resolvePage(entry, node)), 4).catch(() => undefined);
    } catch (error) {
      entry.snapshot = { status: "error", items: [], pages: new Map(), error };
      publish(entry);
    }
  })();

  return entry;
}

function getEntry(document: PDFDocumentProxy): OutlineEntry {
  const existing = cache.get(document);
  if (existing) return existing;
  const entry = createEntry(document);
  cache.set(document, entry);
  return entry;
}

export function getOutlineSnapshot(document: PDFDocumentProxy): OutlineSnapshot {
  return getEntry(document).snapshot;
}

export function subscribeOutline(document: PDFDocumentProxy, listener: () => void): () => void {
  const entry = getEntry(document);
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

export async function resolveOutlinePage(document: PDFDocumentProxy, id: string): Promise<number | null> {
  const entry = getEntry(document);
  await entry.ready;
  const node = entry.nodes.get(id);
  return node ? resolvePage(entry, node) : null;
}
