import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  default: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  primary: "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300",
  success: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  warning: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  danger: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
