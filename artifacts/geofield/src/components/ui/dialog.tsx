import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              role="dialog"
              aria-modal="true"
              className="relative bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]"
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="absolute right-3 top-3 z-20 flex h-10 w-10 touch-manipulation items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close popup"
              >
                <X className="h-5 w-5" />
              </button>
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

export function DialogContent({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 overflow-y-auto", className)}>{children}</div>
}

export function DialogHeader({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6 pr-16 pb-0", className)}>{children}</div>
}

export function DialogTitle({ children, className }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-xl font-bold font-display tracking-tight", className)}>{children}</h2>
}
