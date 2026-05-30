import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface AuroraBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

export function AuroraBackground({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) {
  return (
    <div
      className={cn(
        "relative min-h-screen overflow-hidden bg-zinc-50 text-slate-950 transition-colors",
        className
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className={cn(
            `
              absolute -inset-[10px] opacity-40 blur-[10px] invert will-change-transform
              [--aurora:repeating-linear-gradient(100deg,var(--blue-500)_10%,var(--indigo-300)_15%,var(--blue-300)_20%,var(--violet-200)_25%,var(--blue-400)_30%)]
              [--black:#000]
              [--blue-300:#93c5fd]
              [--blue-400:#60a5fa]
              [--blue-500:#3b82f6]
              [--indigo-300:#a5b4fc]
              [--transparent:transparent]
              [--violet-200:#ddd6fe]
              [--white:#fff]
              [--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)]
              [background-image:var(--white-gradient),var(--aurora)]
              [background-position:50%_50%,50%_50%]
              [background-size:300%,_200%]
              after:absolute after:inset-0 after:animate-aurora after:content-[""]
              after:[background-attachment:fixed]
              after:[background-image:var(--white-gradient),var(--aurora)]
              after:[background-size:200%,_100%]
              after:mix-blend-difference
            `,
            showRadialGradient &&
              "[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]"
          )}
        />
      </div>
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  );
}
