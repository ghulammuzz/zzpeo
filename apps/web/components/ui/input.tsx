import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-sm border border-input bg-background/60 px-3 py-2 text-sm font-mono",
          "placeholder:text-muted-foreground/40",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:border-primary focus-visible:bg-background focus-visible:shadow-[0_0_10px_rgba(0,229,255,0.2)]",
          "disabled:cursor-not-allowed disabled:opacity-30",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
