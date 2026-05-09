interface PatchPanelIconProps {
  className?: string;
}

export function SearchIcon(props: PatchPanelIconProps) {
  return (
    <svg className={props.className} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.1" />
      <path d="m12.2 12.2 4.1 4.1" />
    </svg>
  );
}

export function ChatIcon(props: PatchPanelIconProps) {
  return (
    <svg className={props.className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4.1 5.2a3 3 0 0 1 3-3h5.8a3 3 0 0 1 3 3v4.6a3 3 0 0 1-3 3H9.2l-4.4 3.1v-3.4a3 3 0 0 1-.7-2V5.2Z" />
    </svg>
  );
}

export function PlusIcon(props: PatchPanelIconProps) {
  return (
    <svg className={props.className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3.8v12.4M3.8 10h12.4" />
    </svg>
  );
}
