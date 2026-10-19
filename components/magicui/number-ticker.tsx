"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

export function NumberTicker({
  value,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
}: {
  value: number;
  direction?: "up" | "down";
  className?: string;
  delay?: number;
  decimalPlaces?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(direction === "down" ? value : 0);
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  const format = (n: number) =>
    Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(Number(n.toFixed(decimalPlaces)));

  useEffect(() => {
    if (!isInView) return;
    const target = direction === "down" ? 0 : value;
    const start = setTimeout(() => motionValue.set(target), delay * 1000);
    // The spring emits nothing when the value does not move (a 0 stayed blank) and can stop short of a value that
    // arrives later; once it should be done, show the exact number.
    const settle = setTimeout(() => {
      if (ref.current) ref.current.textContent = format(target);
    }, delay * 1000 + 1500);
    return () => {
      clearTimeout(start);
      clearTimeout(settle);
    };
  }, [motionValue, isInView, delay, value, direction]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current) ref.current.textContent = format(latest);
      }),
    [springValue, decimalPlaces] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <span
      className={cn(
        "inline-block tabular-nums text-foreground tracking-wider",
        className
      )}
      ref={ref}
    />
  );
}
