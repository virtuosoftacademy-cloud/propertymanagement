"use client";

// components/testimonials/TestimonialsSection.tsx

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { testimonials } from "../_constant";
import TestimonialCard from "./TestimonialCard";

const AUTOPLAY_MS = 5000;
const TOTAL = testimonials.length; // e.g. 6

const slideVariants = {
  enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
};

export default function TestimonialsSection() {
  const [activeIdx, setActiveIdx] = useState(0); // 0 → TOTAL-1
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isPaused, setIsPaused] = useState(false);

  const goTo = useCallback(
    (next: number, dir: 1 | -1) => {
      setDirection(dir);
      setActiveIdx(next);
    },
    []
  );

  const next = useCallback(
    () => goTo((activeIdx + 1) % TOTAL, 1),
    [activeIdx, goTo]
  );

  const prev = useCallback(
    () => goTo((activeIdx - 1 + TOTAL) % TOTAL, -1),
    [activeIdx, goTo]
  );

  // Autoplay
  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [isPaused, next]);

  // Build 3 cards: active first, then next 2 (purely visual, non-interactive)
  const visibleCards = [0, 1, 2].map((offset) =>
    testimonials[(activeIdx + offset) % TOTAL]
  );

  const counterCurrent = String(activeIdx + 1).padStart(2, "0");
  const counterTotal = String(TOTAL).padStart(2, "0");

  return (
    <section
      className="bg-background py-20 px-6 sm:px-12"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="mx-auto max-w-[212.5rem]">

        {/* ── Heading ── */}
        <h2 className="text-3xl md:text-[42px] font-bold text-foreground mb-10">
          What Our{" "}
          <span style={{ color: "var(--primary)" }}>Clients Say</span>
        </h2>

        {/* ── Sliding cards ── */}
        <div className="overflow-hidden">
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={activeIdx}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              {visibleCards.map((t, i) => (
                <TestimonialCard
                  key={`${activeIdx}-${i}`}
                  testimonial={t}
                  isActive={i === 0}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Footer: counter + dots ── */}
        <div className="mt-8 flex items-center justify-between">

          {/* Counter: 01 / 06 */}
          <p className="text-sm text-foreground/50 tabular-nums">
            <span className="text-foreground font-semibold">{counterCurrent}</span>
            {" / "}
            {counterTotal}
          </p>

          {/* 3 square dots — each maps to activeIdx % 3 so they cycle 0→1→2→0 */}
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((dotIdx) => {
              // which dot should be highlighted: cycle through 0,1,2 as activeIdx advances
              const isActive = activeIdx % 3 === dotIdx;

              return (
                <motion.button
                  key={dotIdx}
                  onClick={() => {
                    // jump to the card that corresponds to this dot position
                    const base = Math.floor(activeIdx / 3) * 1;
                    const target = base + dotIdx;
                    // guard against going out of bounds on last group
                    const safeTarget = target < TOTAL ? target : dotIdx;
                    const dir = safeTarget > activeIdx ? 1 : -1;
                    goTo(safeTarget, dir);
                  }}
                  aria-label={`Go to slide ${dotIdx + 1}`}
                  animate={{ width: isActive ? 14 : 10, height: isActive ? 14 : 10 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  style={{
                    height: 10,
                    background: isActive
                      ? "var(--primary)"
                      : "color-mix(in oklch, var(--foreground) 25%, transparent)",
                    flexShrink: 0,
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}