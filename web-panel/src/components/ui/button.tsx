import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

type ButtonVariant = "default" | "outline"
type ButtonSize = "default" | "icon"

const BUTTON_BASE = "inline-flex shrink-0 items-center justify-center rounded-md border border-transparent text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50"

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/80",
  outline: "border-border hover:bg-input/50 hover:text-foreground",
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  default: "h-7 gap-1 px-2",
  icon: "size-7",
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      data-slot="button"
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  )
}

export { Button }
