"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const FloatingDock = ({
  items,
  className,
}: {
  items: {
    title: string;
    icon: React.ReactNode;
    active?: boolean;
    onClick?: () => void;
    badge?: number;
  }[];
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "flex items-center gap-1 bg-slate-900/80 border border-slate-800/60 rounded-2xl p-1.5 backdrop-blur-xl shadow-2xl shadow-black/20",
        className
      )}
    >
      {items.map((item) => (
        <motion.button
          key={item.title}
          whileHover={{ scale: 1.1, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={item.onClick}
          className={cn(
            "relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
            item.active
              ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          )}
        >
          <span className="text-lg">{item.icon}</span>
          <span className="hidden sm:inline">{item.title}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full">
              {item.badge > 9 ? '9+' : item.badge}
            </span>
          )}
        </motion.button>
      ))}
    </div>
  );
};
