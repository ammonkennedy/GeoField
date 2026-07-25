import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "water" | "rock" | "soil";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-primary text-primary-foreground shadow": variant === "default",
          "border-transparent bg-secondary text-secondary-foreground": variant === "secondary",
          "border-transparent bg-destructive text-destructive-foreground shadow": variant === "destructive",
          "text-foreground": variant === "outline",
          "border-transparent bg-[var(--color-water)] text-white shadow-sm": variant === "water",
          "border-transparent bg-[var(--color-rock)] text-white shadow-sm": variant === "rock",
          "border-transparent bg-[var(--color-soil)] text-white shadow-sm": variant === "soil",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
