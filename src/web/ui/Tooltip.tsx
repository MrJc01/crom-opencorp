import { Tooltip as Kobalte } from "@kobalte/core/tooltip";
import { type JSXElement, type ParentProps } from "solid-js";

export interface TooltipProps extends ParentProps {
  content: JSXElement;
  placement?: "top" | "bottom" | "left" | "right";
}

export function Tooltip(props: TooltipProps) {
  return (
    <Kobalte placement={props.placement ?? "top"} gutter={6}>
      <Kobalte.Trigger as="div" class="inline-flex">
        {props.children}
      </Kobalte.Trigger>
      <Kobalte.Portal>
        <Kobalte.Content class="z-50 px-2 py-1 text-xs text-zinc-100 bg-zinc-800 border border-zinc-700/80 rounded shadow-md animate-in fade-in-0 zoom-in-95 pointer-events-none select-none">
          <Kobalte.Arrow class="border-zinc-700 fill-zinc-800" />
          <p>{props.content}</p>
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte>
  );
}
