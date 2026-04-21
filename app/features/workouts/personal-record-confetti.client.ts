export async function fireWeightPersonalRecordConfetti() {
  if (!("document" in globalThis)) {
    return;
  }

  const { default: confetti } = await import("canvas-confetti");
  const orangePalette = ["#b85a18", "#cf6a1c", "#e57b1f", "#f08f24", "#f59e0b"] as const;
  const sharedOptions = {
    colors: orangePalette,
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
