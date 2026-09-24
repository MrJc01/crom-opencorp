import type { Component } from "solid-js";

export const RouteSkeleton: Component = () => {
  return (
    <div class="flex flex-col h-full w-full p-6 space-y-6 bg-zinc-950 animate-pulse select-none" role="status" aria-label="Carregando módulo">
      {/* Cabeçalho Skeleton */}
      <div class="flex items-center justify-between border-b border-zinc-850 pb-4">
        <div class="space-y-2">
          <div class="h-6 w-48 bg-zinc-800 rounded-md" />
          <div class="h-3 w-72 bg-zinc-900 rounded-md" />
        </div>
        <div class="h-8 w-24 bg-zinc-800 rounded-lg" />
      </div>

      {/* Grid de Cards Estatísticos / Ações */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="h-24 bg-zinc-900/80 border border-zinc-800/60 rounded-xl" />
        <div class="h-24 bg-zinc-900/80 border border-zinc-800/60 rounded-xl" />
        <div class="h-24 bg-zinc-900/80 border border-zinc-800/60 rounded-xl" />
      </div>

      {/* Área Principal de Trabalho */}
      <div class="flex-1 min-h-[350px] bg-zinc-900/40 border border-zinc-850/60 rounded-xl p-6 space-y-4">
        <div class="h-4 w-full bg-zinc-800/60 rounded" />
        <div class="h-4 w-5/6 bg-zinc-800/40 rounded" />
        <div class="h-4 w-4/6 bg-zinc-800/30 rounded" />
      </div>
    </div>
  );
};
