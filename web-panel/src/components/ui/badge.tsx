import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

type BadgeVariant = "default" | "outline"

const BADGE_BASE = "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-[0.625rem] font-medium whitespace-nowrap"

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
  outline: "border-border bg-input/20 text-foreground",
}

function Badge({
  className,
  variant = "default",
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(BADGE_BASE, BADGE_VARIANTS[variant], className)}
      {...props}
    />
  )
}

export { Badge }
