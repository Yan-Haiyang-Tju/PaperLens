import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cloneElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

type TooltipChildProps = { disabled?: boolean; style?: CSSProperties };

export function Tooltip({ label, children, side = "right" }: { label: string; children: ReactElement<TooltipChildProps>; side?: "top" | "right" | "bottom" | "left" }): ReactNode {
  const trigger = children.props.disabled ? (
    <span aria-label={label} style={{ display: "inline-flex" }} tabIndex={0}>
      {cloneElement(children, { style: { ...children.props.style, pointerEvents: "none" } })}
    </span>
  ) : children;

  return (
    <TooltipPrimitive.Root delayDuration={120}>
      <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className="tooltip-content" side={side} sideOffset={7}>
          {label}
          <TooltipPrimitive.Arrow className="tooltip-arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
