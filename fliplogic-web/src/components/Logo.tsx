import Image from 'next/image';

// Source file is 500x376 — keep renders proportional to that instead of
// letting each usage guess its own width/height and stretch the image.
const NATURAL_WIDTH = 500;
const NATURAL_HEIGHT = 376;

interface LogoProps {
  height?: number;
  className?: string;
  priority?: boolean;
}

export function Logo({ height = 40, className, priority }: LogoProps) {
  const width = Math.round((height * NATURAL_WIDTH) / NATURAL_HEIGHT);

  return (
    <Image
      src="/fliplogic_logo.png"
      alt="FlipLogic"
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
