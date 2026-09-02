import { type Component, type JSX, splitProps } from "solid-js";

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button: Component<ButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ["variant", "size", "loading", "children", "class", "disabled"]);

  const variantClasses = {
    primary: "bg-zinc-100 text-zinc-900 hover:bg-white active:bg-zinc-200 border border-zinc-200",
    secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:bg-zinc-800 border border-zinc-700",
    ghost: "bg-transparent text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100 active:bg-zinc-800",
    danger: "bg-rose-950/40 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60",
    outline: "bg-transparent border border-zinc-700 text-zinc-200 hover:bg-zinc-800/60",
  }[local.variant ?? "secondary"];

  const sizeClasses = {
    xs: "h-6 px-2 text-xs rounded",
    sm: "h-7 px-2.5 text-xs rounded-md",
    md: "h-8 px-3 text-sm rounded-md",
    lg: "h-10 px-4 text-base rounded-lg",
  }[local.size ?? "md"];

  return (
    <button
      {...rest}
      disabled={local.disabled || local.loading}
      class={`inline-flex items-center justify-center gap-1.5 font-medium transition-all select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${variantClasses} ${sizeClasses} ${local.class ?? ""}`}
    >
      {local.loading && (
        <svg class="animate-spin h-3.5 w-3.5 text-current" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {local.children}
    </button>
  );
};
