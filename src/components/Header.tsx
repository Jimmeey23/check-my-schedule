import { FileSpreadsheet } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="container mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <FileSpreadsheet className="h-4 w-4" />
          </div>

          <div>
            <h1 className="text-sm font-semibold tracking-tight text-slate-950">
              Check My Schedule
            </h1>
            <p className="text-[11px] font-medium text-slate-500">Schedule QA workspace</p>
          </div>
        </div>

        <div className="hidden rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 sm:block">
          Internal tool
        </div>
      </div>
    </header>
  );
}
