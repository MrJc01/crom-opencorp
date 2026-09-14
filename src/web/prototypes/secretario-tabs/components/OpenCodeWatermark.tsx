import type { Component } from "solid-js";

interface OpenCodeWatermarkProps {
  label?: string;
  sublabel?: string;
  subtle?: boolean;
}

export const OpenCodeWatermark: Component<OpenCodeWatermarkProps> = (props) => {
  return (
    <div class="flex flex-col items-center justify-center select-none pointer-events-none py-12 transition-all">
      {/* Bloco geométrico minimalista característico do OpenCode */}
      <div class="flex items-center gap-3.5 mb-3 opacity-25 hover:opacity-40 transition-opacity">
        <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-zinc-600 via-zinc-800 to-zinc-900 border border-zinc-700/50 flex items-center justify-center shadow-inner">
          <div class="h-4 w-4 rounded-md bg-zinc-400/80" />
        </div>
        <span class="text-4xl sm:text-5xl font-extrabold tracking-tighter text-zinc-600 font-mono">
          {props.label || "opencode"}
        </span>
      </div>

      <div class="flex items-center gap-2 text-xs font-mono text-zinc-600/80 tracking-wide">
        <span>{props.sublabel || "OpenCorp AI Studio · Workspace Governed"}</span>
      </div>
    </div>
  );
};
