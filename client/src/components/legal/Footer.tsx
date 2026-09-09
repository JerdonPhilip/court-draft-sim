export type LegalDoc = 'privacy' | 'terms' | 'cookies';

export function Footer({ onOpenLegal }: { onOpenLegal: (doc: LegalDoc) => void }) {
  return (
    <footer className="shrink-0 border-t border-broadcast-border/50 bg-broadcast-darker/60 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-0.5 px-4 pt-2 text-center text-[11px] leading-tight text-broadcast-text-muted sm:px-6">
        <span>COURT DRAFT SIM · Fan game. Not affiliated with the NBA.</span>
        <nav aria-label="Legal" className="flex items-center gap-3">
          <button type="button" onClick={() => onOpenLegal('privacy')} className="underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent">
            Privacy
          </button>
          <button type="button" onClick={() => onOpenLegal('terms')} className="underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent">
            Terms
          </button>
          <button type="button" onClick={() => onOpenLegal('cookies')} className="underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent">
            Cookies
          </button>
        </nav>
        <a href="mailto:jerdonphilipmacaraeg@gmail.com" className="underline-offset-2 hover:text-white hover:underline">
          Contact
        </a>
      </div>
    </footer>
  );
}
