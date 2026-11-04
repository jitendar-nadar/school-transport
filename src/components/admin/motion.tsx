"use client";

import { animate, MotionConfig, motion, useMotionValue, useTransform, type Variants } from "framer-motion";
import { useEffect } from "react";

export const easeOut = [0.22, 1, 0.36, 1] as const;

export const pageVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2, staggerChildren: 0.05 } },
};

export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: easeOut } },
};

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function CountUp({ value }: { value: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest).toLocaleString());
  useEffect(() => {
    const controls = animate(count, value, { duration: 0.8, ease: easeOut });
    return () => controls.stop();
  }, [count, value]);
  return <motion.span>{rounded}</motion.span>;
}
