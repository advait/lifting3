export async function fireWeightPersonalRecordConfetti() {
  if (!("document" in globalThis)) {
    return;
  }

  const { default: confetti } = await import("canvas-confetti");
  const yellowPalette = [
    "hsl(43 96% 58%)",
    "hsl(46 100% 64%)",
    "hsl(49 100% 70%)",
    "hsl(52 100% 76%)",
    "hsl(55 100% 82%)",
  ] as const;
  const sharedOptions = {
    colors: yellowPalette,
    decay: 0.92,
    disableForReducedMotion: true,
    gravity: 1.08,
    scalar: 0.94,
    startVelocity: 48,
    ticks: 240,
    zIndex: 1200,
  } as const;

  await Promise.all([
    confetti({
      ...sharedOptions,
      angle: 118,
      drift: 0.12,
      origin: { x: 0.22, y: 0.78 },
      particleCount: 72,
      shapes: ["circle", "square"],
      spread: 64,
    }),
    confetti({
      ...sharedOptions,
      angle: 62,
      drift: -0.12,
      origin: { x: 0.78, y: 0.78 },
      particleCount: 64,
      shapes: ["circle", "square"],
      spread: 70,
    }),
  ]);
}
