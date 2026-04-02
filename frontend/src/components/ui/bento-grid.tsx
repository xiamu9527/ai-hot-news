"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "grid md:auto-rows-[10rem] grid-cols-2 md:grid-cols-4 gap-3 max-w-7xl mx-auto",
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  value,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  value?: string | number | React.ReactNode;
}) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "row-span-1 rounded-xl group/bento hover:shadow-xl transition duration-200 shadow-none border border-slate-800/60 bg-gradient-to-br from-slate-900/80 to-slate-800/30 overflow-hidden relative",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.03] to-transparent opacity-0 group-hover/bento:opacity-100 transition-opacity duration-300" />
      {header}
      <div className="p-4 relative z-10 h-full flex flex-col justify-between">
        <div>
          <div className="text-xl mb-1">{icon}</div>
          {value !== undefined && (
            <div className="text-2xl md:text-3xl font-bold font-mono text-slate-100 tracking-tight">
              {value}
            </div>
          )}
        </div>
        <div>
          {title && (
            <div className="font-medium text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">
              {title}
            </div>
          )}
          {description && (
            <div className="text-[10px] text-slate-600">{description}</div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
