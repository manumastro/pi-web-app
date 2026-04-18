import * as React from "react"
import { cn } from "@/lib/utils"

const Text = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm leading-none", className)}
    {...props}
  />
))
Text.displayName = "Text"

export { Text }
