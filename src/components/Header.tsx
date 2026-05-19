import { FileSpreadsheet, Sparkles } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="container mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <div className="app-title-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white sm:h-9 sm:w-9">
            <FileSpreadsheet className="h-4 w-4" />
          </div>

          <h1 className="flex min-w-0 items-center whitespace-nowrap text-[12px] font-semibold tracking-tight sm:text-lg md:text-xl">
            <span className="app-title-wordmark">Check My Schedule</span>
            <span className="mx-1.5 text-slate-400 sm:mx-2"> - </span>
            <span className="app-title-wordmark">By Jimmeey Gondaa</span>
            <Sparkles className="app-title-spark ml-2 hidden h-4 w-4 shrink-0 text-slate-500 sm:block" />
          </h1>
        </div>
      </div>
    </header>
  );
}
