interface TriangleGlyphProps {
  direction: "up" | "down";
  className?: string;
}

export function TriangleGlyph({ direction, className }: TriangleGlyphProps) {
  const points = direction === "up" ? "6 3.5 10.5 8.5 1.5 8.5" : "1.5 3.5 10.5 3.5 6 8.5";

  return (
    <svg className={className} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <polygon points={points} fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
