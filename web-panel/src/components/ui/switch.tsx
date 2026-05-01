import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function Switch({
  checked = false,
  className,
  disabled,
  onCheckedChange,
  size = "default",
  ...props
}: Omit<ComponentProps<"button">, "onChange"> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  size?: "sm" | "default"
}) {
  return (
    <button
      type="button"
      aria-checked={checked}
      data-slot="switch"
      data-size={size}
      disabled={disabled}
      role="switch"
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-3.5 w-6" : "h-4 w-7",
        checked ? "bg-primary" : "bg-input",
        className
      )}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <span
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-background ring-0 transition-transform",
          size === "sm" ? "size-3" : "size-3.5",
          checked ? "translate-x-[calc(100%-2px)]" : "translate-x-0"
        )}
      />
    </button>
  )
}

export { Switch }
