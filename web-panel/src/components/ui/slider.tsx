import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  disabled,
  onValueChange,
  value,
  min = 0,
  max = 100,
  step = 1,
  ...props
}: Omit<ComponentProps<"input">, "defaultValue" | "onChange" | "type" | "value"> & {
  defaultValue?: number
  onValueChange?: (value: number) => void
  value?: number
}) {
  const currentValue = Number(value ?? defaultValue ?? min)

  return (
    <input
      type="range"
      data-slot="slider"
      defaultValue={defaultValue}
      disabled={disabled}
      className={cn("h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50", className)}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onValueChange?.(Number(event.currentTarget.value))}
      {...props}
      aria-valuenow={currentValue}
    />
  )
}

export { Slider }
