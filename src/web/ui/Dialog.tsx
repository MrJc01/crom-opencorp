import { Dialog as Kobalte } from "@kobalte/core/dialog";
import { type JSXElement, type ParentProps, Show } from "solid-js";
import { X } from "lucide-solid";
import { IconButton } from "./IconButton";

export interface ModalProps extends ParentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: JSXElement;
  description?: JSXElement;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

export function Modal(props: ModalProps) {
  const widthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
  }[props.maxWidth ?? "md"];

  return (
    <Kobalte open={props.open} onOpenChange={props.onOpenChange}>
      <Kobalte.Portal>
        <Kobalte.Overlay class="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs transition-opacity data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0" />
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Kobalte.Content class={`w-full ${widthClasses} bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95`}>
            <Show when={props.title}>
              <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <Kobalte.Title class="text-sm font-semibold text-zinc-100">
                  {props.title}
                </Kobalte.Title>
                <Kobalte.CloseButton as={IconButton} size="sm" variant="ghost" aria-label="Fechar">
                  <X size={16} />
                </Kobalte.CloseButton>
              </div>
            </Show>
            <Show when={props.description}>
              <Kobalte.Description class="px-4 pt-2 text-xs text-zinc-400">
                {props.description}
              </Kobalte.Description>
            </Show>
            <div class="p-4 overflow-y-auto flex-1 text-sm text-zinc-200">
              {props.children}
            </div>
          </Kobalte.Content>
        </div>
      </Kobalte.Portal>
    </Kobalte>
  );
}
