import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed aria-disabled:cursor-not-allowed [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-evergreen-600 text-white hover:bg-evergreen-700 disabled:bg-[#D5D8D2] disabled:text-[#4E5561]",
        secondary:
          "border border-evergreen-600 bg-white text-evergreen-600 hover:bg-hover-soft hover:text-evergreen-700 disabled:border-[#C9CBC4] disabled:text-[#6B7280]",
        outline: "border border-control bg-white text-ink hover:bg-ghost-hover",
        ghost: "text-ink-2 hover:bg-ghost-hover hover:text-ink disabled:text-[#6B7280]",
        danger: "bg-danger text-white hover:bg-danger-700 disabled:bg-[#D5D8D2] disabled:text-[#4E5561]",
        "danger-outline": "border border-danger bg-white text-danger hover:bg-danger-50",
        link: "h-auto px-0 text-evergreen-600 underline underline-offset-4 hover:text-evergreen-700",
      },
      size: {
        md: "min-h-11 px-4 text-sm",
        lg: "min-h-13 rounded-xl px-6 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), variant === "link" && "min-h-0", className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
