import { CalendarClock, CalendarDays, ClipboardList, Clock3 } from 'lucide-react';

export function Header() {
  return (
    <header className="app-header sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="app-header-bg-icons" aria-hidden="true">
        <CalendarDays className="app-header-bg-icon app-header-bg-icon-1" />
        <Clock3 className="app-header-bg-icon app-header-bg-icon-2" />
        <ClipboardList className="app-header-bg-icon app-header-bg-icon-3" />
      </div>

      <div className="container relative z-10 mx-auto flex min-h-[5.6rem] max-w-7xl items-center px-4 py-3 sm:min-h-24 sm:px-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-3.5">
          <div className="app-title-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white sm:h-10 sm:w-10">
            <CalendarClock className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]" />
          </div>

          <h1 className="app-title flex min-w-0 flex-col items-start whitespace-nowrap">
            <span className="app-title-primary">Check My Schedule</span>
            <span className="app-title-border" aria-hidden="true" />
            <span className="app-title-signature" aria-label="by Jimmeey Gondaa">
              <span className="app-title-by">by</span>
              <span className="app-title-name">Jimmeey Gondaa</span>
            </span>
          </h1>
        </div>
      </div>
    </header>
  );
}
