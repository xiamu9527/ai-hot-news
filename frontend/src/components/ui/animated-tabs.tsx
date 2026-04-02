"use client";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Tab = {
  title: string;
  value: string;
  icon?: React.ReactNode;
  content?: React.ReactNode;
};

export const AnimatedTabs = ({
  tabs: propTabs,
  containerClassName,
  activeTabClassName,
  tabClassName,
  contentClassName,
  onChange,
}: {
  tabs: Tab[];
  containerClassName?: string;
  activeTabClassName?: string;
  tabClassName?: string;
  contentClassName?: string;
  onChange?: (tab: Tab) => void;
}) => {
  const [active, setActive] = useState<Tab>(propTabs[0]);
  const [tabs, setTabs] = useState<Tab[]>(propTabs);

  const moveSelectedTabToTop = (idx: number) => {
    const newTabs = [...propTabs];
    const selectedTab = newTabs.splice(idx, 1);
    newTabs.unshift(selectedTab[0]);
    setTabs(newTabs);
    setActive(newTabs[0]);
    onChange?.(newTabs[0]);
  };

  return (
    <>
      <div
        className={cn(
          "flex flex-row items-center justify-start [perspective:1000px] relative overflow-auto sm:overflow-visible no-visible-scrollbar max-w-full w-full",
          containerClassName
        )}
      >
        {propTabs.map((tab, idx) => (
          <button
            key={tab.title}
            onClick={() => moveSelectedTabToTop(idx)}
            className={cn("relative px-4 py-2 rounded-full", tabClassName)}
            style={{ transformStyle: "preserve-3d" }}
          >
            {active.value === tab.value && (
              <motion.div
                layoutId="clickedbutton"
                transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
                className={cn(
                  "absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-full",
                  activeTabClassName
                )}
              />
            )}
            <span
              className={cn(
                "relative block text-sm font-medium transition-colors",
                active.value === tab.value ? "text-cyan-400" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <span className="flex items-center gap-2">
                {tab.icon}
                {tab.title}
              </span>
            </span>
          </button>
        ))}
      </div>
      <FadeInDiv
        tabs={tabs}
        active={active}
        key={active.value}
        className={cn("mt-6", contentClassName)}
      />
    </>
  );
};

const FadeInDiv = ({
  className,
  tabs,
  active,
}: {
  className?: string;
  tabs: Tab[];
  active: Tab;
  key?: string;
}) => {
  return (
    <div className="relative w-full h-full">
      {tabs.map((tab) => (
        <motion.div
          key={tab.value}
          layoutId={undefined}
          style={{
            display: active.value === tab.value ? "block" : "none",
          }}
          animate={{
            y: active.value === tab.value ? [10, 0] : 0,
            opacity: active.value === tab.value ? [0, 1] : 0,
          }}
          className={cn("w-full", className)}
        >
          {tab.content}
        </motion.div>
      ))}
    </div>
  );
};
