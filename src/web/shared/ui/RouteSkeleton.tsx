import React, { type FC } from "react";

export const RouteSkeleton: FC = () => {
  return (
    <div className="flex flex-col flex-1 h-full w-full p-6 space-y-6 animate-pulse bg-zinc-950 overflow-hidden">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-zinc-900 rounded-lg border border-zinc-850" />
          <div className="h-3.5 w-72 bg-zinc-900/60 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-zinc-900 rounded-xl border border-zinc-850" />
          <div className="h-9 w-9 bg-zinc-900 rounded-xl border border-zinc-850" />
        </div>
      </div>

      {/* Grid de Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 bg-zinc-800 rounded" />
              <div className="h-5 w-12 bg-zinc-800/60 rounded-full" />
            </div>
            <div className="h-3 w-full bg-zinc-800/40 rounded" />
            <div className="h-3 w-2/3 bg-zinc-800/40 rounded" />
          </div>
        ))}
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 rounded-2xl bg-zinc-900/30 border border-zinc-800/60 p-6 space-y-4">
        <div className="h-4 w-40 bg-zinc-850 rounded" />
        <div className="space-y-2.5">
          <div className="h-10 w-full bg-zinc-900/60 rounded-xl border border-zinc-850/50" />
          <div className="h-10 w-full bg-zinc-900/60 rounded-xl border border-zinc-850/50" />
          <div className="h-10 w-full bg-zinc-900/60 rounded-xl border border-zinc-850/50" />
        </div>
      </div>
    </div>
  );
};
