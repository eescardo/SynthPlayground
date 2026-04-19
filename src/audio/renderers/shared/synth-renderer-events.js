import { EVENT_SORT_PRIORITY } from "../js/synth-worklet-constants.js";

export const compareScheduledEvents = (a, b) => {
  if (a.sampleTime !== b.sampleTime) {
    return a.sampleTime - b.sampleTime;
  }
  const priorityDelta = (EVENT_SORT_PRIORITY[a.type] ?? 99) - (EVENT_SORT_PRIORITY[b.type] ?? 99);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  return String(a.id).localeCompare(String(b.id));
};
