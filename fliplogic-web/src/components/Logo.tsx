// Inline SVG so it renders crisp at any size with no raster aspect-ratio
// math — the viewBox handles scaling natively.
const VIEWBOX_WIDTH = 400;
const VIEWBOX_HEIGHT = 100;

interface LogoProps {
  height?: number;
  className?: string;
  // No-op now (was a next/image LCP hint for the old PNG version) — kept
  // so existing call sites don't need to change.
  priority?: boolean;
}

export function Logo({ height = 40, className }: LogoProps) {
  const width = Math.round((height * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="FlipLogic"
    >
      <g transform="translate(10,10)">
        <path d="M 20,10 L 140,10 L 80,80 Z" fill="#0B3D2E" />
        <path d="M 20,150 L 140,150 L 80,80 Z" fill="#0B3D2E" transform="scale(1,0.53)" />
      </g>
      <text
        x="180"
        y="62"
        fontFamily="Sora, Helvetica, Arial, sans-serif"
        fontWeight={600}
        letterSpacing="-0.5"
        fontSize={34}
        fill="#1A1A1A"
      >
        fliplogic
      </text>
    </svg>
  );
}
