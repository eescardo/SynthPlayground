"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MacroPanel } from "@/components/MacroPanel";
import { TrackVolumePopover } from "@/components/TrackVolumePopover";
import { createId } from "@/lib/ids";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { midiToPitch, pitchToMidi } from "@/lib/pitch";
import { formatBeatName, snapToGrid } from "@/lib/musicTiming";
import { Project, Note, Track } from "@/types/music";

const HEADER_WIDTH = 170;
const RULER_HEIGHT = 28;
const TRACK_HEIGHT = 72;
const BEAT_WIDTH = 72;
const MUTE_ICON_SIZE = 16;
const NOTE_RESIZE_HANDLE_WIDTH = 8;
const SPEAKER_X = 126;
const SPEAKER_Y_OFFSET = 29;
const SPEAKER_ICON_SRC = "/icons/speaker.svg";
const SPEAKER_MUTED_ICON_SRC = "/icons/speaker-muted.svg";
const MOVE_CURSOR = "move";
const MOVE_CURSOR_ACTIVE = "grabbing";
const RESIZE_CURSOR = "ew-resize";
const TRACK_CANVAS_COLORS = {
  canvasBg: "#0a1118",
  headerBg: "#121b27",
  rulerBg: "#0d1620",
  barGrid: "#2f4f7f",
  beatGrid: "#1e3551",
  subGrid: "#142230",
  rulerText: "#8fb8e8",
  rowSeparator: "#1a2e42",
  selectedTrackOverlay: "rgba(33, 112, 210, 0.2)",
  trackName: "#d4e4ff",
  trackInvalidOverlay: "rgba(214, 76, 76, 0.18)",
  trackInvalidName: "#ffb1b1",
  note: "#2d8cff",
  noteMuted: "#405f83",
  noteOverlap: "#dc4a4a",
  noteOverlapMuted: "#7b4b4b",
  noteEdgeHighlight: "rgba(255, 255, 255, 0.2)",
  notePitchHover: "rgba(255, 219, 120, 0.26)",
  noteLabel: "#ecf5ff",
  overlapRange: "rgba(255, 35, 35, 0.52)",
  playhead: "#ff5a7b",
  ghostPlayhead: "rgba(121, 201, 255, 0.82)",
  countInBadge: "rgba(255, 208, 113, 0.18)",
  countInBadgeBorder: "rgba(255, 208, 113, 0.48)",
  countInText: "#ffe5a9",
  muteIconFallback: "#ff8092",
  unmuteIconFallback: "#a7c8eb"
} as const;

type CanvasCursor = "default" | "pointer" | "move" | "move-active" | "resize";

interface TrackCanvasProps {
  project: Project;
  invalidPatchIds?: Set<string>;
  selectedTrackId?: string;
  playheadBeat: number;
  activeRecordedNotes?: Array<{ trackId: string; noteId: string; startBeat: number }>;
  ghostPlayheadBeat?: number;
  countInLabel?: string;
  onSetPlayheadBeat: (beat: number) => void;
  onSelectTrack: (trackId: string) => void;
  onRenameTrack: (trackId: string, name: string) => void;
  onToggleTrackMute: (trackId: string) => void;
  onSetTrackVolume: (trackId: string, volume: number, options?: { commit?: boolean }) => void;
  onUpdateTrackPatch: (trackId: string, patchId: string) => void;
  onToggleTrackMacroPanel: (trackId: string) => void;
  onChangeTrackMacro: (trackId: string, macroId: string, normalized: number, options?: { commit?: boolean }) => void;
  onResetTrackMacros: (trackId: string) => void;
  onOpenPitchPicker: (trackId: string, noteId: string) => void;
  onUpsertNote: (trackId: string, note: Note, options?: { actionKey?: string; coalesce?: boolean }) => void;
  onUpdateNote: (trackId: string, noteId: string, patch: Partial<Note>, options?: { actionKey?: string; coalesce?: boolean }) => void;
  onDeleteNote: (trackId: string, noteId: string) => void;
}

interface DragState {
  trackId: string;
  noteId: string;
  mode: "move" | "resize";
  offsetBeats: number;
  noteStartBeats: number;
}

interface NoteRect {
  trackId: string;
  noteId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MuteRect {
  trackId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PitchRect {
  trackId: string;
  noteId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawGhostPlayhead(
  ctx: CanvasRenderingContext2D,
  ghostPlayheadBeat: number | undefined,
  countInLabel: string | undefined,
  height: number
) {
  if (typeof ghostPlayheadBeat !== "number" || !Number.isFinite(ghostPlayheadBeat)) {
    return;
  }

  const ghostX = HEADER_WIDTH + ghostPlayheadBeat * BEAT_WIDTH;
  ctx.strokeStyle = TRACK_CANVAS_COLORS.ghostPlayhead;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(ghostX, 0);
  ctx.lineTo(ghostX, height);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!countInLabel) {
    return;
  }

  const badgeWidth = 34;
  const badgeHeight = 24;
  const badgeX = ghostX - badgeWidth * 0.5;
  const badgeY = 6;
  ctx.fillStyle = TRACK_CANVAS_COLORS.countInBadge;
  ctx.strokeStyle = TRACK_CANVAS_COLORS.countInBadgeBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = TRACK_CANVAS_COLORS.countInText;
  ctx.font = "bold 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText(countInLabel, ghostX, badgeY + 16);
  ctx.textAlign = "start";
}

const findTrackOverlaps = (notes: Note[]): {
  overlapNoteIds: Set<string>;
  overlapRanges: Array<{ startBeat: number; endBeat: number }>;
} => {
  const overlapNoteIds = new Set<string>();
  const ranges: Array<{ startBeat: number; endBeat: number }> = [];
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  const epsilon = 1e-9;

  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    const aEnd = a.startBeat + a.durationBeats;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (b.startBeat >= aEnd - epsilon) {
        break;
      }
      const bEnd = b.startBeat + b.durationBeats;
      const overlapStart = Math.max(a.startBeat, b.startBeat);
      const overlapEnd = Math.min(aEnd, bEnd);
      if (overlapEnd > overlapStart + epsilon) {
        overlapNoteIds.add(a.id);
        overlapNoteIds.add(b.id);
        ranges.push({ startBeat: overlapStart, endBeat: overlapEnd });
      }
    }
  }

  if (ranges.length === 0) {
    return { overlapNoteIds, overlapRanges: [] };
  }

  ranges.sort((a, b) => a.startBeat - b.startBeat);
  const merged: Array<{ startBeat: number; endBeat: number }> = [ranges[0]];
  for (let i = 1; i < ranges.length; i += 1) {
    const current = ranges[i];
    const last = merged[merged.length - 1];
    if (current.startBeat <= last.endBeat + epsilon) {
      last.endBeat = Math.max(last.endBeat, current.endBeat);
    } else {
      merged.push({ ...current });
    }
  }

  return { overlapNoteIds, overlapRanges: merged };
};

export function TrackCanvas(props: TrackCanvasProps) {
  const { onUpdateNote, project } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const noteRectsRef = useRef<NoteRect[]>([]);
  const muteRectsRef = useRef<MuteRect[]>([]);
  const pitchRectsRef = useRef<PitchRect[]>([]);
  const speakerIconsRef = useRef<{ normal: HTMLImageElement | null; muted: HTMLImageElement | null }>({
    normal: null,
    muted: null
  });
  const wheelPitchLockUntilRef = useRef(0);
  const wheelLockedScrollTopRef = useRef(0);
  const wheelLockedScrollLeftRef = useRef(0);
  const wheelLockTimerRef = useRef<number | null>(null);
  const volumeOpenTimerRef = useRef<number | null>(null);
  const volumeDismissTimerRef = useRef<number | null>(null);
  const [hoveredPitch, setHoveredPitch] = useState<{ trackId: string; noteId: string } | null>(null);
  const [speakerIconsReady, setSpeakerIconsReady] = useState(false);
  const [canvasCursor, setCanvasCursor] = useState<CanvasCursor>("default");
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrackName, setEditingTrackName] = useState("");
  const [volumePopoverTrackId, setVolumePopoverTrackId] = useState<string | null>(null);

  const meterBeats = props.project.global.meter === "4/4" ? 4 : 3;
  const selectedTrack = props.project.tracks.find((track) => track.id === props.selectedTrackId) ?? null;
  const selectedPatch = selectedTrack
    ? props.project.patches.find((patch) => patch.id === selectedTrack.instrumentPatchId) ?? null
    : null;

  const getPatchOptionLabel = useCallback((patch: Project["patches"][number]) => {
    const presetStatus = resolvePatchPresetStatus(patch);
    if (presetStatus === "legacy_preset") {
      return `${patch.name} (Legacy Preset)`;
    }
    if (presetStatus === "preset_update_available") {
      return `${patch.name} (Preset Update Available)`;
    }
    if (resolvePatchSource(patch) === "custom") {
      return `${patch.name} (Custom)`;
    }
    return `${patch.name} (Preset)`;
  }, []);

  const totalBeats = useMemo(() => {
    const maxEnd = props.project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0);
    return Math.max(16, Math.ceil(maxEnd + meterBeats));
  }, [meterBeats, props.project.tracks]);

  const width = HEADER_WIDTH + totalBeats * BEAT_WIDTH;
  const height = RULER_HEIGHT + props.project.tracks.length * TRACK_HEIGHT;

  const beatFromX = (x: number) => (x - HEADER_WIDTH) / BEAT_WIDTH;
  const isTrackSilenced = useCallback((track: Track) => track.mute || track.volume <= 0, []);

  const openVolumePopover = useCallback((trackId: string) => {
    if (volumeOpenTimerRef.current !== null) {
      window.clearTimeout(volumeOpenTimerRef.current);
      volumeOpenTimerRef.current = null;
    }
    if (volumeDismissTimerRef.current !== null) {
      window.clearTimeout(volumeDismissTimerRef.current);
      volumeDismissTimerRef.current = null;
    }
    setVolumePopoverTrackId(trackId);
  }, []);

  const scheduleVolumePopoverOpen = useCallback((trackId: string) => {
    if (volumeOpenTimerRef.current !== null) {
      window.clearTimeout(volumeOpenTimerRef.current);
    }
    volumeOpenTimerRef.current = window.setTimeout(() => {
      setVolumePopoverTrackId(trackId);
      volumeOpenTimerRef.current = null;
    }, 1000);
  }, []);

  const scheduleVolumePopoverDismiss = useCallback(() => {
    if (volumeDismissTimerRef.current !== null) {
      window.clearTimeout(volumeDismissTimerRef.current);
    }
    volumeDismissTimerRef.current = window.setTimeout(() => {
      setVolumePopoverTrackId(null);
      volumeDismissTimerRef.current = null;
    }, 2000);
  }, []);

  const cancelVolumePopoverTimers = useCallback(() => {
    if (volumeOpenTimerRef.current !== null) {
      window.clearTimeout(volumeOpenTimerRef.current);
      volumeOpenTimerRef.current = null;
    }
    if (volumeDismissTimerRef.current !== null) {
      window.clearTimeout(volumeDismissTimerRef.current);
      volumeDismissTimerRef.current = null;
    }
  }, []);

  const getCanvasPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const getTrackAtY = (y: number): Track | null => {
    if (y < RULER_HEIGHT) return null;
    const idx = Math.floor((y - RULER_HEIGHT) / TRACK_HEIGHT);
    return props.project.tracks[idx] ?? null;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = TRACK_CANVAS_COLORS.canvasBg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = TRACK_CANVAS_COLORS.headerBg;
    ctx.fillRect(0, 0, HEADER_WIDTH, height);

    ctx.fillStyle = TRACK_CANVAS_COLORS.rulerBg;
    ctx.fillRect(HEADER_WIDTH, 0, width - HEADER_WIDTH, RULER_HEIGHT);

    for (let beat = 0; beat <= totalBeats; beat += props.project.global.gridBeats) {
      const x = HEADER_WIDTH + beat * BEAT_WIDTH;
      const isBar = beat % meterBeats === 0;
      const isBeat = Number.isInteger(beat);

      ctx.strokeStyle = isBar
        ? TRACK_CANVAS_COLORS.barGrid
        : isBeat
          ? TRACK_CANVAS_COLORS.beatGrid
          : TRACK_CANVAS_COLORS.subGrid;
      ctx.lineWidth = isBar ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      if (isBeat) {
        ctx.fillStyle = TRACK_CANVAS_COLORS.rulerText;
        ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(formatBeatName(beat, props.project.global.gridBeats), x + 4, 18);
      }
    }

    ctx.strokeStyle = TRACK_CANVAS_COLORS.rowSeparator;
    ctx.lineWidth = 1;
    for (let i = 0; i <= props.project.tracks.length; i += 1) {
      const y = RULER_HEIGHT + i * TRACK_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    noteRectsRef.current = [];
    muteRectsRef.current = [];
    pitchRectsRef.current = [];
    const activeRecordedNoteById = new Map(
      (props.activeRecordedNotes ?? []).map((entry) => [`${entry.trackId}:${entry.noteId}`, entry] as const)
    );
    props.project.tracks.forEach((track, index) => {
      const y = RULER_HEIGHT + index * TRACK_HEIGHT;
      const isSelected = track.id === props.selectedTrackId;
      const trackPatchInvalid = props.invalidPatchIds?.has(track.instrumentPatchId) ?? false;
      const { overlapNoteIds, overlapRanges } = findTrackOverlaps(track.notes);

      if (isSelected) {
        ctx.fillStyle = TRACK_CANVAS_COLORS.selectedTrackOverlay;
        ctx.fillRect(0, y, width, TRACK_HEIGHT);
      }
      if (trackPatchInvalid) {
        ctx.fillStyle = TRACK_CANVAS_COLORS.trackInvalidOverlay;
        ctx.fillRect(0, y, HEADER_WIDTH, TRACK_HEIGHT);
      }

      ctx.fillStyle = trackPatchInvalid ? TRACK_CANVAS_COLORS.trackInvalidName : TRACK_CANVAS_COLORS.trackName;
      ctx.font = "13px 'Trebuchet MS', 'Segoe UI', sans-serif";
      ctx.fillText(track.name, 12, y + 24);
      const muteY = y + 29;
      const trackSilenced = isTrackSilenced(track);
      const speakerIcon = trackSilenced ? speakerIconsRef.current.muted : speakerIconsRef.current.normal;
      if (speakerIconsReady && speakerIcon) {
        ctx.drawImage(speakerIcon, SPEAKER_X, muteY, MUTE_ICON_SIZE, MUTE_ICON_SIZE);
      } else {
        ctx.fillStyle = trackSilenced ? TRACK_CANVAS_COLORS.muteIconFallback : TRACK_CANVAS_COLORS.unmuteIconFallback;
        ctx.fillRect(SPEAKER_X + 2, muteY + 2, 12, 12);
      }
      muteRectsRef.current.push({ trackId: track.id, x: SPEAKER_X, y: muteY, w: MUTE_ICON_SIZE, h: MUTE_ICON_SIZE });

      for (const note of track.notes) {
        const activeRecord = activeRecordedNoteById.get(`${track.id}:${note.id}`);
        const visualDurationBeats = activeRecord
          ? Math.max(note.durationBeats, props.playheadBeat - activeRecord.startBeat, props.project.global.gridBeats)
          : note.durationBeats;
        const noteX = HEADER_WIDTH + note.startBeat * BEAT_WIDTH;
        const noteW = Math.max(8, visualDurationBeats * BEAT_WIDTH);
        const noteY = y + 14;
        const noteH = TRACK_HEIGHT - 28;
        const overlaps = overlapNoteIds.has(note.id);

        ctx.fillStyle = overlaps
          ? trackSilenced
            ? TRACK_CANVAS_COLORS.noteOverlapMuted
            : TRACK_CANVAS_COLORS.noteOverlap
          : trackSilenced
            ? TRACK_CANVAS_COLORS.noteMuted
            : TRACK_CANVAS_COLORS.note;
        ctx.fillRect(noteX, noteY, noteW, noteH);

        ctx.fillStyle = TRACK_CANVAS_COLORS.noteEdgeHighlight;
        ctx.fillRect(noteX, noteY, noteW, 2);

        const labelX = noteX + 6;
        const labelY = noteY + 16;
        const labelWidth = Math.max(14, ctx.measureText(note.pitchStr).width);
        if (hoveredPitch?.trackId === track.id && hoveredPitch.noteId === note.id) {
          ctx.fillStyle = TRACK_CANVAS_COLORS.notePitchHover;
          ctx.fillRect(labelX - 3, labelY - 10, labelWidth + 6, 13);
        }

        ctx.fillStyle = TRACK_CANVAS_COLORS.noteLabel;
        ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(note.pitchStr, labelX, labelY);

        noteRectsRef.current.push({ trackId: track.id, noteId: note.id, x: noteX, y: noteY, w: noteW, h: noteH });
        pitchRectsRef.current.push({
          trackId: track.id,
          noteId: note.id,
          x: labelX - 3,
          y: labelY - 10,
          w: labelWidth + 6,
          h: 13
        });
      }

      for (const overlap of overlapRanges) {
        const overlapX = HEADER_WIDTH + overlap.startBeat * BEAT_WIDTH;
        const overlapW = Math.max(2, (overlap.endBeat - overlap.startBeat) * BEAT_WIDTH);
        ctx.fillStyle = TRACK_CANVAS_COLORS.overlapRange;
        ctx.fillRect(overlapX, y + 14, overlapW, TRACK_HEIGHT - 28);
      }
    });

    const playheadX = HEADER_WIDTH + props.playheadBeat * BEAT_WIDTH;
    ctx.strokeStyle = TRACK_CANVAS_COLORS.playhead;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    drawGhostPlayhead(ctx, props.ghostPlayheadBeat, props.countInLabel, height);
  }, [
    props.countInLabel,
    props.ghostPlayheadBeat,
    height,
    hoveredPitch,
    isTrackSilenced,
    meterBeats,
    props.activeRecordedNotes,
    props.invalidPatchIds,
    props.playheadBeat,
    props.project.global.gridBeats,
    props.project.tracks,
    props.selectedTrackId,
    speakerIconsReady,
    totalBeats,
    width
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
      });

    Promise.all([loadImage(SPEAKER_ICON_SRC), loadImage(SPEAKER_MUTED_ICON_SRC)])
      .then(([normal, muted]) => {
        if (cancelled) {
          return;
        }
        speakerIconsRef.current = { normal, muted };
        setSpeakerIconsReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSpeakerIconsReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);

  const findNoteRect = (x: number, y: number): NoteRect | null => {
    for (const rect of noteRectsRef.current) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        return rect;
      }
    }
    return null;
  };

  const findMuteRect = (x: number, y: number): MuteRect | null => {
    for (const rect of muteRectsRef.current) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        return rect;
      }
    }
    return null;
  };

  const findPitchRect = (x: number, y: number): PitchRect | null => {
    for (const rect of pitchRectsRef.current) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        return rect;
      }
    }
    return null;
  };

  const getCursorForPosition = (x: number, y: number): CanvasCursor => {
    if (findMuteRect(x, y) || findPitchRect(x, y)) {
      return "pointer";
    }

    const hitNote = findNoteRect(x, y);
    if (!hitNote) {
      return "default";
    }

    return x > hitNote.x + hitNote.w - NOTE_RESIZE_HANDLE_WIDTH ? "resize" : "move";
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);

    if (y <= RULER_HEIGHT && x >= HEADER_WIDTH) {
      const beat = Math.max(0, snapToGrid(beatFromX(x), props.project.global.gridBeats));
      props.onSetPlayheadBeat(beat);
      return;
    }

    const track = getTrackAtY(y);
    if (!track) return;

    props.onSelectTrack(track.id);

    const muteRect = findMuteRect(x, y);
    if (muteRect) {
      props.onToggleTrackMute(muteRect.trackId);
      setCanvasCursor("pointer");
      return;
    }

    const pitchRect = findPitchRect(x, y);
    if (pitchRect && event.button === 0) {
      props.onOpenPitchPicker(pitchRect.trackId, pitchRect.noteId);
      setCanvasCursor("pointer");
      return;
    }

    const hitNote = findNoteRect(x, y);
    if (event.button === 2) {
      if (hitNote) {
        props.onDeleteNote(hitNote.trackId, hitNote.noteId);
      }
      return;
    }

    if (hitNote) {
      const note = track.notes.find((entry) => entry.id === hitNote.noteId);
      if (!note) return;

      const beat = beatFromX(x);
      const nearRightEdge = x > hitNote.x + hitNote.w - NOTE_RESIZE_HANDLE_WIDTH;
      dragRef.current = {
        trackId: hitNote.trackId,
        noteId: hitNote.noteId,
        mode: nearRightEdge ? "resize" : "move",
        offsetBeats: beat - note.startBeat,
        noteStartBeats: note.startBeat
      };
      setCanvasCursor(nearRightEdge ? "resize" : "move-active");
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const snappedStart = Math.max(0, snapToGrid(beatFromX(x), props.project.global.gridBeats));
    const newNote: Note = {
      id: createId("note"),
      pitchStr: "C4",
      startBeat: snappedStart,
      durationBeats: Math.max(props.project.global.gridBeats, props.project.global.gridBeats * 2),
      velocity: 0.85
    };
    props.onUpsertNote(track.id, newNote, { actionKey: `track:${track.id}:note:${newNote.id}:create` });

    dragRef.current = {
      trackId: track.id,
      noteId: newNote.id,
      mode: "move",
      offsetBeats: 0,
      noteStartBeats: snappedStart
    };
    setCanvasCursor("move-active");
    canvas.setPointerCapture(event.pointerId);
  };

  useEffect(() => {
    if (!editingTrackId) {
      return;
    }
    const trackStillExists = props.project.tracks.some((track) => track.id === editingTrackId);
    if (!trackStillExists) {
      setEditingTrackId(null);
      setEditingTrackName("");
    }
  }, [editingTrackId, props.project.tracks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setVolumePopoverTrackId(null);
        cancelVolumePopoverTimers();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".track-volume-button, .track-volume-popover")) {
        return;
      }
      setVolumePopoverTrackId(null);
      cancelVolumePopoverTimers();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [cancelVolumePopoverTimers]);

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    const hitPitch = findPitchRect(x, y);
    setHoveredPitch((prev) => {
      const next = hitPitch ? { trackId: hitPitch.trackId, noteId: hitPitch.noteId } : null;
      if (prev?.trackId === next?.trackId && prev?.noteId === next?.noteId) {
        return prev;
      }
      return next;
    });

    const drag = dragRef.current;
    if (!drag) {
      setCanvasCursor(getCursorForPosition(x, y));
      return;
    }

    setCanvasCursor(drag.mode === "resize" ? "resize" : "move-active");
    const beat = snapToGrid(Math.max(0, beatFromX(x)), props.project.global.gridBeats);
    const track = props.project.tracks.find((entry) => entry.id === drag.trackId);
    const note = track?.notes.find((entry) => entry.id === drag.noteId);
    if (!note) {
      return;
    }

    if (drag.mode === "move") {
      const nextStart = Math.max(0, snapToGrid(beat - drag.offsetBeats, props.project.global.gridBeats));
      props.onUpdateNote(drag.trackId, drag.noteId, { startBeat: nextStart }, {
        actionKey: `track:${drag.trackId}:note:${drag.noteId}:move`,
        coalesce: true
      });
    } else {
      const end = Math.max(note.startBeat + props.project.global.gridBeats, beat);
      props.onUpdateNote(drag.trackId, drag.noteId, {
        durationBeats: snapToGrid(end - note.startBeat, props.project.global.gridBeats)
      }, {
        actionKey: `track:${drag.trackId}:note:${drag.noteId}:resize`,
        coalesce: true
      });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvasRef.current && dragRef.current) {
      try {
        canvasRef.current.releasePointerCapture(event.pointerId);
      } catch {
        // ignore release failures
      }
    }
    dragRef.current = null;
    if (!canvas) {
      setCanvasCursor("default");
      return;
    }
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    setCanvasCursor(getCursorForPosition(x, y));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const engageWheelLock = (now: number) => {
      const wasUnlocked = now >= wheelPitchLockUntilRef.current;
      wheelPitchLockUntilRef.current = now + 420;
      if (wasUnlocked) {
        wheelLockedScrollTopRef.current = wrapper.scrollTop;
        wheelLockedScrollLeftRef.current = wrapper.scrollLeft;
      }
      wrapper.style.overflow = "hidden";

      if (wheelLockTimerRef.current !== null) {
        window.clearTimeout(wheelLockTimerRef.current);
      }
      wheelLockTimerRef.current = window.setTimeout(() => {
        wrapper.style.overflow = "auto";
        wheelLockTimerRef.current = null;
      }, 440);
    };

    const onWheelNative = (event: WheelEvent) => {
      const now = performance.now();
      const { x, y } = getCanvasPoint(event.clientX, event.clientY);
      const hitPitch = findPitchRect(x, y);
      const shouldLockScroll = now < wheelPitchLockUntilRef.current;
      if (!hitPitch && !shouldLockScroll) return;

      event.stopPropagation();
      engageWheelLock(now);
      wrapper.scrollTop = wheelLockedScrollTopRef.current;
      wrapper.scrollLeft = wheelLockedScrollLeftRef.current;
      if (!hitPitch) return;

      const track = project.tracks.find((entry) => entry.id === hitPitch.trackId);
      const note = track?.notes.find((entry) => entry.id === hitPitch.noteId);
      if (!note) return;

      let midi = 60;
      try {
        midi = pitchToMidi(note.pitchStr);
      } catch {
        return;
      }
      const semitone = event.deltaY < 0 ? 1 : -1;
      const nextPitch = midiToPitch(Math.max(21, Math.min(108, midi + semitone)));
      onUpdateNote(hitPitch.trackId, hitPitch.noteId, { pitchStr: nextPitch }, {
        actionKey: `track:${hitPitch.trackId}:pitch:${hitPitch.noteId}`
      });
    };

    const onScrollNative = () => {
      if (performance.now() < wheelPitchLockUntilRef.current) {
        wrapper.scrollTop = wheelLockedScrollTopRef.current;
        wrapper.scrollLeft = wheelLockedScrollLeftRef.current;
      }
    };

    wrapper.addEventListener("wheel", onWheelNative, { passive: false, capture: true });
    wrapper.addEventListener("scroll", onScrollNative, { capture: true });
    return () => {
      wrapper.removeEventListener("wheel", onWheelNative, true);
      wrapper.removeEventListener("scroll", onScrollNative, true);
      if (wheelLockTimerRef.current !== null) {
        window.clearTimeout(wheelLockTimerRef.current);
        wheelLockTimerRef.current = null;
      }
      wrapper.style.overflow = "auto";
    };
  }, [onUpdateNote, project.tracks]);

  useEffect(() => {
    return () => {
      cancelVolumePopoverTimers();
    };
  }, [cancelVolumePopoverTimers]);

  return (
    <div className="track-canvas-shell" ref={wrapperRef}>
      <div className="track-header-overlays">
        {project.tracks.map((track, index) => {
          const effectiveVolume = track.mute ? 0 : track.volume;
          const rememberedVolume = track.volume;

          return (
          <div key={track.id}>
            <button
              type="button"
              className="track-name-button"
              aria-label={`Rename track ${track.name}`}
              style={{
                top: `${RULER_HEIGHT + index * TRACK_HEIGHT + 8}px`,
                cursor: props.selectedTrackId === track.id ? "text" : "default"
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (props.selectedTrackId === track.id) {
                  setEditingTrackId(track.id);
                  setEditingTrackName(track.name);
                } else {
                  props.onSelectTrack(track.id);
                }
              }}
            />
            <button
              type="button"
              className="track-volume-button"
              aria-label={`Track volume for ${track.name}`}
              aria-expanded={volumePopoverTrackId === track.id}
              style={{
                top: `${RULER_HEIGHT + index * TRACK_HEIGHT + SPEAKER_Y_OFFSET}px`
              }}
              onMouseEnter={() => scheduleVolumePopoverOpen(track.id)}
              onMouseLeave={() => scheduleVolumePopoverDismiss()}
              onClick={(event) => {
                event.stopPropagation();
                props.onToggleTrackMute(track.id);
                openVolumePopover(track.id);
              }}
            />
            {volumePopoverTrackId === track.id && (
              <TrackVolumePopover
                trackName={track.name}
                effectiveVolume={effectiveVolume}
                rememberedVolume={rememberedVolume}
                muted={Boolean(track.mute)}
                top={`${RULER_HEIGHT + index * TRACK_HEIGHT + 6}px`}
                onMouseEnter={() => {
                  if (volumeDismissTimerRef.current !== null) {
                    window.clearTimeout(volumeDismissTimerRef.current);
                    volumeDismissTimerRef.current = null;
                  }
                }}
                onMouseLeave={() => scheduleVolumePopoverDismiss()}
                onVolumeChange={(volume, options) => props.onSetTrackVolume(track.id, volume, options)}
              />
            )}
            {editingTrackId === track.id && (
              <input
                className="track-name-input"
                value={editingTrackName}
                style={{ top: `${RULER_HEIGHT + index * TRACK_HEIGHT + 8}px` }}
                autoFocus
                onChange={(event) => setEditingTrackName(event.target.value)}
                onBlur={() => {
                  const nextName = editingTrackName.trim();
                  if (nextName) {
                    props.onRenameTrack(track.id, nextName);
                  }
                  setEditingTrackId(null);
                  setEditingTrackName("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    setEditingTrackId(null);
                    setEditingTrackName("");
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
              />
            )}
            <select
              className={`track-patch-select${(props.invalidPatchIds?.has(track.instrumentPatchId) ?? false) ? " invalid" : ""}`}
              value={track.instrumentPatchId}
              style={{ top: `${RULER_HEIGHT + index * TRACK_HEIGHT + 44}px` }}
              onChange={(event) => props.onUpdateTrackPatch(track.id, event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {project.patches.map((patch) => (
                <option key={patch.id} value={patch.id}>
                  {getPatchOptionLabel(patch)}
                </option>
              ))}
            </select>
          </div>
          );
        })}
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          cursor:
            canvasCursor === "move"
              ? MOVE_CURSOR
              : canvasCursor === "move-active"
                ? MOVE_CURSOR_ACTIVE
                : canvasCursor === "resize"
                  ? RESIZE_CURSOR
                  : canvasCursor
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={(event) => {
          onPointerUp(event);
          setHoveredPitch(null);
          setCanvasCursor("default");
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
      {selectedTrack && selectedPatch && (
        <div className="track-macro-panel-shell">
          <div className="track-macro-panel-header">
            <div>
              <strong>Track Macros</strong>
              <span className="track-macro-panel-subtitle">
                {selectedTrack.name} · {selectedPatch.name}
              </span>
            </div>
            <div className="track-macro-panel-actions">
              <button type="button" onClick={() => props.onResetTrackMacros(selectedTrack.id)}>
                Reset
              </button>
              <button type="button" onClick={() => props.onToggleTrackMacroPanel(selectedTrack.id)}>
                {selectedTrack.macroPanelExpanded ? "Collapse" : "Expand"}
              </button>
            </div>
          </div>
          {selectedTrack.macroPanelExpanded && (
            <MacroPanel
              patch={selectedPatch}
              macroValues={selectedTrack.macroValues}
              onMacroChange={(macroId, normalized) => props.onChangeTrackMacro(selectedTrack.id, macroId, normalized)}
              onMacroCommit={(macroId, normalized) =>
                props.onChangeTrackMacro(selectedTrack.id, macroId, normalized, { commit: true })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
