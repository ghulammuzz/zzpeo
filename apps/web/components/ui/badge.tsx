import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase font-mono transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
  {
    variants: {
      variant: {
        default:
          "border-neon-cyan/40 bg-neon-cyan/8 text-neon-cyan",
        secondary:
          "border-border bg-secondary/60 text-muted-foreground",
        destructive:
          "border-neon-magenta/40 bg-neon-magenta/8 text-neon-magenta",
        outline:
          "border-border text-foreground bg-transparent",
        success:
          "border-neon-green/40 bg-neon-green/8 text-neon-green",
        warning:
          "border-neon-yellow/40 bg-neon-yellow/8 text-neon-yellow",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
