import { FileSpreadsheet, Sparkles, Zap } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-blue-100/50 bg-gradient-to-r from-white via-blue-50/30 to-white/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-gradient-to-r supports-[backdrop-filter]:from-white/90 supports-[backdrop-filter]:via-blue-50/20 supports-[backdrop-filter]:to-white/80 shadow-lg shadow-blue-100/20">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between max-w-7xl">
        <div className="flex items-center gap-3 hover-lift">
          {/* Animated icon background */}
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-300 animate-gradient-shift hover:scale-110">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 opacity-0 hover:opacity-20 transition-opacity duration-300" />
            <FileSpreadsheet className="w-5 h-5 text-white relative z-10" />
          </div>

          <div className="hover-glow">
            <h1 className="text-lg font-display font-bold bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 bg-clip-text text-transparent animate-gradient-shift">
              Check My Schedule
            </h1>
            <p className="text-xs text-slate-500 font-medium">Compare & Verify Schedules</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-blue-100/50 border border-blue-200/50 text-blue-600 text-sm font-medium hover:border-blue-300 transition-all duration-300 hover:shadow-md hover:shadow-blue-200/30">
            <Sparkles className="w-4 h-4 animate-float" />
            <span>Auto-normalize</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald-200/50 text-emerald-600 text-sm font-medium hover:border-emerald-300 transition-all duration-300 hover:shadow-md hover:shadow-emerald-200/30">
            <Zap className="w-4 h-4 animate-pulse" />
            <span>Real-time</span>
          </div>
        </div>
      </div>

      {/* Bottom animated gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-30 animate-pulse" />
    </header>
  );
}
