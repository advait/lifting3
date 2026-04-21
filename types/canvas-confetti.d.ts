declare module "canvas-confetti" {
  interface ConfettiOptions {
    angle?: number;
    colors?: readonly string[];
    decay?: number;
    disableForReducedMotion?: boolean;
    drift?: number;
    gravity?: number;
    origin?: {
      x?: number;
      y?: number;
    };
    particleCount?: number;
    scalar?: number;
    shapes?: readonly string[];
    spread?: number;
    startVelocity?: number;
    ticks?: number;
    zIndex?: number;
  }

  export default function confetti(options?: ConfettiOptions): Promise<null> | null;
}
