"use client";

import Image from "next/image";
import { ChangeEvent, RefObject } from "react";
import { ProjectNameControl } from "@/components/composer/ProjectNameControl";
import { ProjectsMenu } from "@/components/composer/ProjectsMenu";
import { RecentProjectSnapshot } from "@/lib/persistence";
import { formatBeatName } from "@/lib/musicTiming";
import { clamp } from "@/lib/numeric";
import { patchWorkspaceIconSrc } from "@/resources/images";

interface TransportBarProps {
  projectName: string;
  tempo: number;
  meter: "4/4" | "3/4";
  gridBeats: number;
  playheadBeat: number;
  importInputRef: RefObject<HTMLInputElement | null>;
  recentProjects: RecentProjectSnapshot[];
  onRenameProject: (name: string) => void;
  onNewProject: () => void;
  onOpenPatchWorkspace: () => void;
  onExportAudio: () => void;
  exportAudioDisabled?: boolean;
  onTempoChange: (value: number) => void;
  onMeterChange: (value: "4/4" | "3/4") => void;
  onGridChange: (value: number) => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onOpenRecentProject: (projectId: string) => void;
  onResetToDefaultProject: () => void;
  onImportFile: (file: File) => void;
  onOpenHelp: () => void;
}

export function TransportBar(props: TransportBarProps) {
  const onTempoInput = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    props.onTempoChange(clamp(next, 40, 220));
  };

  const onGridInput = (event: ChangeEvent<HTMLSelectElement>) => {
    props.onGridChange(Number(event.target.value));
  };

  return (
    <div className="transport">
      <div className="transport-left">
        <ProjectsMenu
          className="transport-projects-menu"
          iconOnly
          triggerLabel="Projects"
          importInputRef={props.importInputRef}
          recentProjects={props.recentProjects}
          onNewProject={props.onNewProject}
          onExportJson={props.onExportJson}
          onImportJson={props.onImportJson}
          onOpenRecentProject={props.onOpenRecentProject}
          onResetToDefaultProject={props.onResetToDefaultProject}
          onImportFile={props.onImportFile}
        />

        <button
          type="button"
          className="transport-nav-button"
          title="open patch workspace"
          aria-label="Open Patch Workspace"
          onClick={props.onOpenPatchWorkspace}
        >
          <Image
            className="transport-nav-button-icon transport-nav-button-icon-patch"
            src={patchWorkspaceIconSrc}
            alt=""
            aria-hidden="true"
            width={20}
            height={20}
            unoptimized
          />
          <span>Workspace</span>
        </button>

        <ProjectNameControl name={props.projectName} onRename={props.onRenameProject} />
        <span className="transport-project-divider" aria-hidden="true" />
        <span className="playhead">Beat {formatBeatName(props.playheadBeat, props.gridBeats)}</span>
      </div>

      <div className="transport-right">
        <button onClick={props.onOpenHelp}>Help (?)</button>

        <label>
          Tempo
          <input type="number" min={40} max={220} value={props.tempo} onChange={onTempoInput} />
        </label>

        <label>
          Meter
          <select value={props.meter} onChange={(e) => props.onMeterChange(e.target.value as "4/4" | "3/4")}>
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
          </select>
        </label>

        <label>
          Grid
          <select value={props.gridBeats} onChange={onGridInput}>
            <option value={1}>1/4</option>
            <option value={0.5}>1/8</option>
            <option value={0.25}>1/16</option>
            <option value={0.125}>1/32</option>
          </select>
        </label>

        <button className="transport-export-button" onClick={props.onExportAudio} disabled={props.exportAudioDisabled}>
          Export audio...
        </button>
      </div>
    </div>
  );
}
