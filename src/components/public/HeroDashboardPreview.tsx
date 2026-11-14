import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MOTION_EASE } from '../../lib/motion.ts';

const SAMPLE_SCORES = [
  { metric: 'Problem', score: 8.4 },
  { metric: 'Customer', score: 7.8 },
  { metric: 'Moat', score: 6.5 },
  { metric: 'Model', score: 7.2 },
  { metric: 'Finance', score: 6.9 },
  { metric: 'Evidence', score: 7.5 },
];

export function HeroDashboardPreview() {
  const reducedMotion = useReducedMotion();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [4, -4]), {
    stiffness: 180,
    damping: 22,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-5, 5]), {
    stiffness: 180,
    damping: 22,
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div
      className="relative lg:perspective-[1100px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 18 }}
        animate={
          reducedMotion
            ? { opacity: 1 }
            : {
                opacity: 1,
                y: [0, -6, 0],
              }
        }
        transition={
          reducedMotion
            ? { duration: 0.2 }
            : {
                opacity: { duration: 0.55, ease: MOTION_EASE },
                y: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
              }
        }
        style={reducedMotion ? undefined : { rotateX, rotateY }}
        className="rounded-xl border border-border-hairline bg-surface-canvas p-5 shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border-hairline pb-3.5">
          <div>
            <p className="text-xs font-medium text-ink-muted">Sample data · Preview workspace</p>
            <h3 className="mt-0.5 text-sm font-semibold text-ink-primary">
              B2B Cold-Chain Logistics SaaS
            </h3>
          </div>
          <span className="text-xs font-medium text-brand-primary tabular-nums">
            Full Report (Sample)
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-surface-subtle p-3 border border-border-hairline">
            <p className="text-xs text-ink-muted">Clarity Score</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink-primary tabular-nums">
              7.4 / 10
            </p>
          </div>
          <div className="rounded-lg bg-surface-subtle p-3 border border-border-hairline">
            <p className="text-xs text-ink-muted">Verified Sources</p>
            <p className="mt-1 font-mono text-lg font-semibold text-brand-secondary tabular-nums">
              9 Cited
            </p>
          </div>
          <div className="rounded-lg bg-surface-subtle p-3 border border-border-hairline">
            <p className="text-xs text-ink-muted">Break-Even</p>
            <p className="mt-1 font-mono text-lg font-semibold text-brand-accent tabular-nums">
              14 mo
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-ink-secondary">
              Validation Dimensions (Sample data)
            </p>
            <span className="text-xs text-ink-muted">0–10 scale</span>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SAMPLE_SCORES} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="metric"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 10]}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar
                  dataKey="score"
                  fill="#5B21B6"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reducedMotion}
                  animationDuration={750}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-4 border-t border-border-hairline pt-3.5 space-y-2">
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="text-ink-primary font-medium">
              Indian cold-chain market growing 14.8% CAGR (2024–2029)
            </span>
            <span className="shrink-0 font-medium text-semantic-success">Verified research</span>
          </div>
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="text-ink-secondary">
              Initial target price ₹4,500 / warehouse / month
            </span>
            <span className="shrink-0 font-medium text-brand-accent">User assumption</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
