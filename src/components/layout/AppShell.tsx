import type { ReactNode } from "react";
import { TitleBar } from "./TitleBar";
import { DocumentTabs } from "./DocumentTabs";
import { NavigationRail } from "./NavigationRail";
import { StatusBar } from "./StatusBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <TitleBar />
      <DocumentTabs />
      <div className="app-main">
        <NavigationRail />
        <main className="workspace">{children}</main>
      </div>
      <StatusBar />
    </div>
  );
}
