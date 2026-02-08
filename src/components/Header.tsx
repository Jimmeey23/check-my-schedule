import { FileSpreadsheet, Sparkles, Zap } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/70 bg-white/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/60 shadow-soft">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between max-w-7xl">
        <div className="flex items-center gap-3 hover-lift">
          {/* Animated icon background */}
          <div className="relative w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-elevated transition-all duration-300 animate-gradient-shift hover:scale-110">
            <div className="absolute inset-0 rounded-xl opacity-0 hover:opacity-15 transition-opacity duration-300"
                 style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.35), rgba(255,255,255,0))' }} />
            <FileSpreadsheet className="w-5 h-5 text-white relative z-10 icon-tilt" />
          </div>

          <div className="hover-glow">
            <h1 className="text-lg font-display font-bold gradient-text">
              Check My Schedule
            </h1>
            <p className="text-xs text-slate-500 font-medium">Compare & Verify Schedules</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-muted text-slate-700 text-sm font-medium hover-lift">
            <Sparkles className="w-4 h-4 text-blue-600 animate-float" />
            <span>Auto-normalize</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-muted text-slate-700 text-sm font-medium hover-lift">
            <Zap className="w-4 h-4 text-emerald-600" />
            <span>Real-time</span>
          </div>
        </div>
      </div>

      {/* Bottom animated gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#0353A4] to-transparent opacity-25" />
    </header>
  );
}
