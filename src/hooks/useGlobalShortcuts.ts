import { useEffect } from "react";
import { useReaderStore } from "../stores/readerStore";
import { useUiStore } from "../stores/uiStore";
import { dispatchReaderAction, isEditableTarget, matchesShortcut } from "../utils/shortcuts";

export function useGlobalShortcuts(shortcuts: Record<string, string>, onOpen: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const match = Object.entries(shortcuts).find(([, shortcut]) => matchesShortcut(event, shortcut));
      if (match) {
        event.preventDefault();
        const [action] = match;
        if (action === "open") onOpen();
        else dispatchReaderAction(action);
        return;
      }
      const mod = navigator.platform.toLocaleLowerCase().includes("mac") ? event.metaKey : event.ctrlKey;
      if (mod && (event.key === "+" || event.key === "=")) { event.preventDefault(); useReaderStore.getState().setZoom(useReaderStore.getState().zoom + .1); }
      if (mod && event.key === "-") { event.preventDefault(); useReaderStore.getState().setZoom(useReaderStore.getState().zoom - .1); }
      if (mod && event.key === "0") { event.preventDefault(); useReaderStore.getState().setZoom(1, "actual"); }
      if (event.key === "Escape") { useUiStore.getState().setRightPanelMode("none"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen, shortcuts]);
}
