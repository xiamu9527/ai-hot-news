"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  children?: React.ReactNode;
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = "#06b6d4",
      shimmerSize = "0.05em",
      shimmerDuration = "2s",
      borderRadius = "12px",
      background = "rgba(15, 23, 42, 0.9)",
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "group relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap px-6 py-3 font-medium text-sm transition-all duration-300 disabled:pointer-events-none disabled:opacity-50",
          "animate-shimmer bg-[linear-gradient(110deg,transparent,45%,rgba(6,182,212,0.15),55%,transparent)] bg-[length:200%_100%]",
          "border border-cyan-500/30 hover:border-cyan-400/60 hover:shadow-lg hover:shadow-cyan-500/20",
          className
        )}
        style={{
          borderRadius,
          background,
        }}
        {...props}
      >
        <span className="relative z-10 text-cyan-400 group-hover:text-cyan-300 transition-colors">
          {children}
        </span>
      </button>
    );
  }
);

ShimmerButton.displayName = "ShimmerButton";
