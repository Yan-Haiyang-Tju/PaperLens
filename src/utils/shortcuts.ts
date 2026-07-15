export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable === true);
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLocaleLowerCase().split("+").map((part) => part.trim()).filter(Boolean);
  const key = parts.at(-1);
  if (!key) return false;
  const mod = parts.includes("mod");
  if (mod !== (navigator.platform.toLocaleLowerCase().includes("mac") ? event.metaKey : event.ctrlKey)) return false;
  if (parts.includes("ctrl") !== event.ctrlKey && !mod) return false;
  if (parts.includes("meta") !== event.metaKey && !mod) return false;
  if (parts.includes("alt") !== event.altKey) return false;
  if (parts.includes("shift") !== event.shiftKey) return false;
  const eventKey = event.key.toLocaleLowerCase();
  return eventKey === key || (key === "+" && (eventKey === "+" || eventKey === "="));
}

export function dispatchReaderAction(action: string): void {
  window.dispatchEvent(new CustomEvent("paperlens:reader-action", { detail: action }));
}
