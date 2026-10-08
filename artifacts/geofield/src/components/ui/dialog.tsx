import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  panelClassName?: string;
  fullScreen?: boolean;
}

export function Dialog({ open, onOpenChange, children, panelClassName, fullScreen = false }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onOpenChange]);

  if (typeof document === "undefined") return null;

  // Mount outside page containers so clipping and sidebar stacking cannot hide dialogs.
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className={cn("fixed bottom-0 left-0 right-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] z-[200] bg-black/60 backdrop-blur-sm md:inset-0", fullScreen && "inset-0 top-0")}
          />
          <div className={cn("pointer-events-none fixed bottom-0 left-0 right-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] z-[200] flex min-h-0 items-center justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:inset-0 md:p-4", fullScreen && "inset-0 top-0 p-0 md:p-0")}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              role="dialog"
              aria-modal="true"
              className={cn("relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl pointer-events-auto md:max-h-[90vh]", panelClassName, fullScreen && "h-full max-h-full max-w-none rounded-none border-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:max-h-full")}
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="absolute right-3 top-3 z-20 flex h-10 w-10 touch-manipulation items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={fullScreen ? { top: "calc(env(safe-area-inset-top) + 0.5rem)", right: "calc(env(safe-area-inset-right) + 0.5rem)" } : undefined}
                aria-label={fullScreen ? "Exit full screen" : "Close popup"}
              >
                <X className="h-5 w-5" />
              </button>
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function DialogContent({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 touch-pan-y overflow-y-auto overscroll-y-contain p-6 [-webkit-overflow-scrolling:touch]", className)}>{children}</div>
}

export function DialogHeader({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6 pr-16 pb-0", className)}>{children}</div>
}

export function DialogTitle({ children, className }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-xl font-bold font-display tracking-tight", className)}>{children}</h2>
}
