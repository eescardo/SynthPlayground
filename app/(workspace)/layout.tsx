"use client";

import { usePathname } from "next/navigation";
import { AppRoot } from "@/components/app/AppRoot";

export default function WorkspaceLayout() {
  const pathname = usePathname();
  const mode = pathname === "/patch-workspace" ? "patch-workspace" : "composer";
  return <AppRoot mode={mode} />;
}
