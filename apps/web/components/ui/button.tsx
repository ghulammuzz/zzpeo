import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium tracking-wide transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30",
  {
    variants: {
      variant: {
        default:
          "border border-neon-cyan/60 bg-transparent text-neon-cyan hover:bg-neon-cyan/8 hover:border-neon-cyan hover:shadow-[0_0_14px_rgba(0,229,255,0.3)] active:scale-[0.97]",
        destructive:
          "border border-neon-magenta/60 bg-transparent text-neon-magenta hover:bg-neon-magenta/8 hover:border-neon-magenta hover:shadow-[0_0_14px_rgba(255,0,85,0.3)] active:scale-[0.97]",
        outline:
          "border border-border bg-transparent text-foreground hover:border-neon-cyan/40 hover:text-neon-cyan hover:bg-neon-cyan/5 active:scale-[0.97]",
        secondary:
          "bg-secondary text-secondary-foreground border border-transparent hover:border-border hover:bg-secondary/70 active:scale-[0.97]",
        ghost:
          "border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground hover:border-border/50 active:scale-[0.97]",
        link: "text-neon-cyan underline-offset-4 hover:underline border-0 p-0 h-auto",
        solid:
          "bg-neon-cyan text-background font-semibold border border-neon-cyan hover:bg-neon-cyan/90 hover:shadow-[0_0_18px_rgba(0,229,255,0.5)] active:scale-[0.97]",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-sm",
        sm: "h-7 rounded-sm px-3 text-xs",
        lg: "h-10 rounded-sm px-8",
        icon: "h-9 w-9 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
