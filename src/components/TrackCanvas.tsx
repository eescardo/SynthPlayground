"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { createId } from "@/lib/ids";
import { snapToGrid } from "@/lib/time";
import { Project, Note, Track } from "@/types/music";

const HEADER_WIDTH = 170;
const RULER_HEIGHT = 28;
const TRACK_HEIGHT = 72;
const BEAT_WIDTH = 72;

interface TrackCanvasProps {
  project: Project;
  selectedTrackId?: string;
  playheadBeat: number;
  onSetPlayheadBeat: (beat: number) => void;
  onSelectTrack: (trackId: string) => void;
  onUpsertNote: (trackId: string, note: Note) => void;
  onUpdateNote: (trackId: string, noteId: string, patch: Partial<Note>) => void;
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

export function TrackCanvas(props: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const noteRectsRef = useRef<NoteRect[]>([]);

  const meterBeats = props.project.global.meter === "4/4" ? 4 : 3;

  const totalBeats = useMemo(() => {
    const maxEnd = props.project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0);
    return Math.max(16, Math.ceil(maxEnd + meterBeats));
  }, [meterBeats, props.project.tracks]);

  const width = HEADER_WIDTH + totalBeats * BEAT_WIDTH;
  const height = RULER_HEIGHT + props.project.tracks.length * TRACK_HEIGHT;

  const beatFromX = (x: number) => (x - HEADER_WIDTH) / BEAT_WIDTH;

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

    ctx.fillStyle = "#0a1118";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#121b27";
    ctx.fillRect(0, 0, HEADER_WIDTH, height);

    ctx.fillStyle = "#0d1620";
    ctx.fillRect(HEADER_WIDTH, 0, width - HEADER_WIDTH, RULER_HEIGHT);

    for (let beat = 0; beat <= totalBeats; beat += props.project.global.gridBeats) {
      const x = HEADER_WIDTH + beat * BEAT_WIDTH;
      const isBar = beat % meterBeats === 0;
      const isBeat = Number.isInteger(beat);

      ctx.strokeStyle = isBar ? "#2f4f7f" : isBeat ? "#1e3551" : "#142230";
      ctx.lineWidth = isBar ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      if (isBeat) {
        ctx.fillStyle = "#8fb8e8";
        ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(String(beat + 1), x + 4, 18);
      }
    }

    ctx.strokeStyle = "#1a2e42";
    ctx.lineWidth = 1;
    for (let i = 0; i <= props.project.tracks.length; i += 1) {
      const y = RULER_HEIGHT + i * TRACK_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    noteRectsRef.current = [];

    props.project.tracks.forEach((track, index) => {
      const y = RULER_HEIGHT + index * TRACK_HEIGHT;
      const isSelected = track.id === props.selectedTrackId;

      if (isSelected) {
        ctx.fillStyle = "rgba(33, 112, 210, 0.2)";
        ctx.fillRect(0, y, width, TRACK_HEIGHT);
      }

      ctx.fillStyle = "#d4e4ff";
      ctx.font = "13px 'Trebuchet MS', 'Segoe UI', sans-serif";
      ctx.fillText(track.name, 12, y + 24);
      ctx.fillStyle = "#85a6ce";
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(track.instrumentPatchId.replace("preset_", ""), 12, y + 42);

      for (const note of track.notes) {
        const noteX = HEADER_WIDTH + note.startBeat * BEAT_WIDTH;
        const noteW = Math.max(8, note.durationBeats * BEAT_WIDTH);
        const noteY = y + 14;
        const noteH = TRACK_HEIGHT - 28;

        ctx.fillStyle = "#2d8cff";
        ctx.fillRect(noteX, noteY, noteW, noteH);

        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.fillRect(noteX, noteY, noteW, 2);

        ctx.fillStyle = "#ecf5ff";
        ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(note.pitchStr, noteX + 6, noteY + 16);

        noteRectsRef.current.push({ trackId: track.id, noteId: note.id, x: noteX, y: noteY, w: noteW, h: noteH });
      }
    });

    const playheadX = HEADER_WIDTH + props.playheadBeat * BEAT_WIDTH;
    ctx.strokeStyle = "#ff5a7b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }, [height, meterBeats, props.playheadBeat, props.project.global.gridBeats, props.project.tracks, props.selectedTrackId, totalBeats, width]);

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

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (y <= RULER_HEIGHT && x >= HEADER_WIDTH) {
      const beat = Math.max(0, snapToGrid(beatFromX(x), props.project.global.gridBeats));
      props.onSetPlayheadBeat(beat);
      return;
    }

    const track = getTrackAtY(y);
    if (!track) return;

    props.onSelectTrack(track.id);

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
      const nearRightEdge = x > hitNote.x + hitNote.w - 8;
      dragRef.current = {
        trackId: hitNote.trackId,
        noteId: hitNote.noteId,
        mode: nearRightEdge ? "resize" : "move",
        offsetBeats: beat - note.startBeat,
        noteStartBeats: note.startBeat
      };
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
    props.onUpsertNote(track.id, newNote);

    dragRef.current = {
      trackId: track.id,
      noteId: newNote.id,
      mode: "move",
      offsetBeats: 0,
      noteStartBeats: snappedStart
    };
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const beat = snapToGrid(Math.max(0, beatFromX(x)), props.project.global.gridBeats);
    const track = props.project.tracks.find((entry) => entry.id === drag.trackId);
    const note = track?.notes.find((entry) => entry.id === drag.noteId);
    if (!note) {
      return;
    }

    if (drag.mode === "move") {
      const nextStart = Math.max(0, snapToGrid(beat - drag.offsetBeats, props.project.global.gridBeats));
      props.onUpdateNote(drag.trackId, drag.noteId, { startBeat: nextStart });
    } else {
      const end = Math.max(note.startBeat + props.project.global.gridBeats, beat);
      props.onUpdateNote(drag.trackId, drag.noteId, {
        durationBeats: snapToGrid(end - note.startBeat, props.project.global.gridBeats)
      });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (canvasRef.current && dragRef.current) {
      try {
        canvasRef.current.releasePointerCapture(event.pointerId);
      } catch {
        // ignore release failures
      }
    }
    dragRef.current = null;
  };

  return (
    <div className="track-canvas-shell" ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}
