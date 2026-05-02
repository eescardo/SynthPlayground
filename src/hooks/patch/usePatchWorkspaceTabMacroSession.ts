"use client";

import { useEffect, useState } from "react";
import {
  PATCH_WORKSPACE_TAB_MACRO_VALUES_SESSION_KEY,
  pruneTabMacroValues,
  parseTabMacroValues
} from "@/hooks/patch/patchWorkspaceStateUtils";

export function usePatchWorkspaceTabMacroSession(tabIds: string[]) {
  const [tabMacroValuesById, setTabMacroValuesById] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    setTabMacroValuesById(
      parseTabMacroValues(window.sessionStorage.getItem(PATCH_WORKSPACE_TAB_MACRO_VALUES_SESSION_KEY))
    );
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(PATCH_WORKSPACE_TAB_MACRO_VALUES_SESSION_KEY, JSON.stringify(tabMacroValuesById));
  }, [tabMacroValuesById]);

  useEffect(() => {
    setTabMacroValuesById((current) => {
      const next = pruneTabMacroValues(current, tabIds);
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [tabIds]);

  return {
    tabMacroValuesById,
    setTabMacroValuesById
  };
}
