"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface MagicCardProps extends React.HTMLAttributes<HTMLDivElement> {
  gradientSize?: number;
  gradientColor?: string;
  gradientOpacity?: number;
}

export function MagicCard({
  children,
  className,
  gradientSize = 200,
  gradientColor = "hsl(var(--primary))",
  gradientOpacity = 0.15,
}: MagicCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!cardRef.current) return;
      const card = cardRef.current;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      card.style.setProperty("--mouse-x", `${x}px`);
      card.style.setProperty("--mouse-y", `${y}px`);
      card.style.setProperty("--gradient-size", `${gradientSize}px`);
      card.style.setProperty("--gradient-color", gradientColor);
      card.style.setProperty("--gradient-opacity", `${gradientOpacity}`);
    },
    [gradientSize, gradientColor, gradientOpacity]
  );

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    card.addEventListener("mousemove", handleMouseMove);
    return () => card.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative overflow-hidden rounded-card bg-card border border-border p-6",
        "before:pointer-events-none before:absolute before:inset-0 before:z-10",
        "before:rounded-card before:opacity-0 before:transition-opacity before:duration-300",
        "before:[background:radial-gradient(var(--gradient-size)_circle_at_var(--mouse-x)_var(--mouse-y),var(--gradient-color),transparent_40%)]",
        "hover:before:opacity-[var(--gradient-opacity)]",
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-glow",
        className
      )}
    >
      {children}
    </div>
  );
}
