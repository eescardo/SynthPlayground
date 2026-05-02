"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

const APPLE_PLATFORM_PATTERN = /mac|iphone|ipad|ipod/i;

const detectApplePlatform = (navigatorObject?: NavigatorWithUserAgentData) => {
  if (!navigatorObject) {
    return false;
  }

  const reportedPlatform = navigatorObject.userAgentData?.platform ?? navigatorObject.platform ?? "";
  if (APPLE_PLATFORM_PATTERN.test(reportedPlatform)) {
    return true;
  }

  return APPLE_PLATFORM_PATTERN.test(navigatorObject.userAgent);
};

export function usePlatformShortcuts() {
  const [isMacPlatform, setIsMacPlatform] = useState(false);

  useEffect(() => {
    setIsMacPlatform(
      detectApplePlatform(typeof navigator === "undefined" ? undefined : (navigator as NavigatorWithUserAgentData))
    );
  }, []);

  const primaryModifierLabel = useMemo(() => (isMacPlatform ? "Cmd" : "Ctrl"), [isMacPlatform]);
  const deleteKeyLabel = useMemo(() => (isMacPlatform ? "Backspace" : "Delete"), [isMacPlatform]);
  const allTracksModifierLabel = useMemo(() => (isMacPlatform ? "Cmd+Opt" : "Ctrl+Alt"), [isMacPlatform]);
  const isDeleteShortcutKey = useCallback(
    (key: string) => key === "Delete" || (isMacPlatform && key === "Backspace"),
    [isMacPlatform]
  );

  return {
    allTracksModifierLabel,
    deleteKeyLabel,
    isDeleteShortcutKey,
    isMacPlatform,
    primaryModifierLabel
  };
}
