"use client";

import { useAppRoot } from "@/components/app/AppRoot";
import { ComposerController } from "@/components/app/ComposerController";

export default function ComposerPage() {
  const { composerControllerProps } = useAppRoot();
  return <ComposerController {...composerControllerProps} />;
}
