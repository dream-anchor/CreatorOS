import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/20 text-primary backdrop-blur-sm",
        secondary: "border-white/10 bg-white/5 text-foreground backdrop-blur-sm hover:bg-white/10",
        destructive: "border-transparent bg-destructive/20 text-destructive backdrop-blur-sm",
        outline: "border-white/15 text-foreground bg-transparent hover:bg-white/5",
        success: "border-transparent bg-success/20 text-success backdrop-blur-sm",
        warning: "border-transparent bg-warning/20 text-warning backdrop-blur-sm",
        info: "border-transparent bg-info/20 text-info backdrop-blur-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };