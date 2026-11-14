export const MOTION_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const MOTION_DURATIONS = {
  uiFast: 0.16,
  uiNormal: 0.22,
  pageTransition: 0.15,
  reveal: 0.58,
  heroLine: 0.52,
} as const;

export const MOTION_STAGGER = {
  heroLine: 0.06,
  cards: 0.08,
} as const;

export const MOTION_DISTANCES = {
  revealY: 20,
  heroLineY: 16,
} as const;

export const VIEWPORT_ONCE = {
  once: true,
  margin: '-80px',
} as const;

export function getRevealProps(reducedMotion: boolean | null, delay = 0) {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      whileInView: { opacity: 1 },
      viewport: { once: true },
      transition: { duration: 0.2 },
    };
  }

  return {
    initial: { opacity: 0, y: MOTION_DISTANCES.revealY },
    whileInView: { opacity: 1, y: 0 },
    viewport: VIEWPORT_ONCE,
    transition: {
      duration: MOTION_DURATIONS.reveal,
      delay,
      ease: MOTION_EASE,
    },
  };
}
