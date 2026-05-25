import { AnyDirection } from "@/types/direction";

interface TriangleGlyphProps {
  direction: AnyDirection;
  className?: string;
}

export function TriangleGlyph({ direction, className }: TriangleGlyphProps) {
  const points =
    direction === "up"
      ? "6 3.5 10.5 8.5 1.5 8.5"
      : direction === "right"
        ? "3.5 1.5 8.5 6 3.5 10.5"
        : direction === "left"
          ? "8.5 1.5 3.5 6 8.5 10.5"
          : "1.5 3.5 10.5 3.5 6 8.5";

  return (
    <svg className={className} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <polygon points={points} fill="currentColor" fillOpacity="0.8" />
    </svg>
  );
}
