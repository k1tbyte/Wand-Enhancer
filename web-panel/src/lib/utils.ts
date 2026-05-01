type ClassValue = string | number | false | null | undefined | ClassValue[] | Record<string, boolean | null | undefined>

export function cn(...inputs: ClassValue[]) {
  const classes: string[] = []

  for (const input of inputs) {
    if (!input) {
      continue
    }

    if (typeof input === "string" || typeof input === "number") {
      classes.push(String(input))
      continue
    }

    if (Array.isArray(input)) {
      const value = cn(...input)
      if (value) {
        classes.push(value)
      }
      continue
    }

    for (const [key, enabled] of Object.entries(input)) {
      if (enabled) {
        classes.push(key)
      }
    }
  }

  return classes.join(" ")
}
