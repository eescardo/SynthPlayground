import { describe, expect, it, vi } from "vitest";

import {
  createProbeDragPointerScheduler,
  resolveNextProbeDragPosition,
  resolveProbeDragPosition,
  type ProbeDragPointer
} from "@/hooks/patch/usePatchProbeDrag";

describe("usePatchProbeDrag helpers", () => {
  it("keeps repeated pointer moves in the same grid cell as a no-op", () => {
    const currentPosition = { probeId: "probe_scope", x: 4, y: 6 };
    const nextPosition = resolveProbeDragPosition(
      { clientX: 103, clientY: 151 },
      { probeId: "probe_scope", offsetX: 7, offsetY: 7 },
      { left: 0, top: 0, width: 400, height: 300, canvasWidth: 400, canvasHeight: 300 }
    );

    expect(nextPosition).toEqual(currentPosition);
    expect(resolveNextProbeDragPosition(currentPosition, nextPosition)).toBe(currentPosition);
  });

  it("coalesces multiple pointer moves into one animation-frame update with the latest event", () => {
    let scheduledFrame: (() => void) | null = null;
    const appliedEvents: ProbeDragPointer[] = [];
    const cancelFrame = vi.fn();
    const scheduler = createProbeDragPointerScheduler({
      applyPointerEvent: (event) => appliedEvents.push(event),
      requestFrame: (callback) => {
        scheduledFrame = callback;
        return 1;
      },
      cancelFrame
    });

    scheduler.handlePointerMove({ clientX: 10, clientY: 20 });
    scheduler.handlePointerMove({ clientX: 30, clientY: 40 });
    scheduler.handlePointerMove({ clientX: 50, clientY: 60 });

    expect(appliedEvents).toEqual([]);
    const flushFrame = scheduledFrame as (() => void) | null;
    expect(flushFrame).not.toBeNull();

    flushFrame?.();

    expect(appliedEvents).toEqual([{ clientX: 50, clientY: 60 }]);
    expect(cancelFrame).not.toHaveBeenCalled();
  });

  it("flushes the last pending pointer move before final commit", () => {
    const appliedEvents: ProbeDragPointer[] = [];
    const cancelFrame = vi.fn();
    const scheduler = createProbeDragPointerScheduler({
      applyPointerEvent: (event) => appliedEvents.push(event),
      requestFrame: () => 1,
      cancelFrame
    });

    scheduler.handlePointerMove({ clientX: 10, clientY: 20 });
    scheduler.handlePointerMove({ clientX: 30, clientY: 40 });

    expect(scheduler.flushNow()).toBe(true);
    expect(appliedEvents).toEqual([{ clientX: 30, clientY: 40 }]);
    expect(cancelFrame).toHaveBeenCalledWith(1);
  });
});
