import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-sm border border-input bg-background/60 px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-[0_0_10px_rgba(0,229,255,0.2)] disabled:cursor-not-allowed disabled:opacity-30 transition-all resize-none",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
