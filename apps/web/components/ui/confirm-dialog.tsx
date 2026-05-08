"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Trash2, ShieldAlert } from "lucide-react"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: "destructive" | "warning" | "default"
  loading?: boolean
  loadingText?: string
  onConfirm: () => void
}

const VARIANT_STYLES = {
  destructive: {
    border: "border-neon-magenta/40",
    iconBg: "bg-neon-magenta/10",
    icon: <Trash2 className="h-5 w-5 text-neon-magenta" />,
    titleColor: "text-neon-magenta",
    confirmVariant: "destructive" as const,
  },
  warning: {
    border: "border-yellow-500/40",
    iconBg: "bg-yellow-500/10",
    icon: <ShieldAlert className="h-5 w-5 text-yellow-400" />,
    titleColor: "text-yellow-400",
    confirmVariant: "default" as const,
  },
  default: {
    border: "border-neon-cyan/30",
    iconBg: "bg-neon-cyan/8",
    icon: <AlertTriangle className="h-5 w-5 text-neon-cyan" />,
    titleColor: "text-neon-cyan",
    confirmVariant: "default" as const,
  },
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "destructive",
  loading = false,
  loadingText,
  onConfirm,
}: ConfirmDialogProps) {
  const s = VARIANT_STYLES[variant]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-sm border ${s.border} bg-background`}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm ${s.iconBg}`}>
              {s.icon}
            </div>
            <DialogTitle className={`font-mono text-sm tracking-wide ${s.titleColor}`}>
              {title}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="text-sm text-muted-foreground font-mono leading-relaxed px-1">
          {description}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (loadingText ?? "Processing...") : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
