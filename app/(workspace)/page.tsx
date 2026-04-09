"use client";

import { useAppRoot } from "@/components/app/AppRoot";
import { ComposerView } from "@/components/app/ComposerView";

export default function ComposerPage() {
  const { composerProps } = useAppRoot();
  return <ComposerView {...composerProps} />;
}
