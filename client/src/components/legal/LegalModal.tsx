import { useEffect, useRef } from 'react';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import type { LegalDoc } from './Footer';

const CONTACT = 'jerdonphilipmacaraeg@gmail.com';
const EFFECTIVE = 'September 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">{title}</h3>
      <div className="mt-1 space-y-2 text-sm leading-relaxed text-broadcast-text-secondary">{children}</div>
    </section>
  );
}

function PrivacyBody() {
  return (
    <div>
      <p className="text-sm text-broadcast-text-secondary">Effective: {EFFECTIVE} · Contact: <a className="text-broadcast-accent underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
      <Section title="Who we are">
        <p>Court Draft Sim is a free hobby fan game by Jerdon Philip Macaraeg, Malasiqui, Pangasinan, PH. Email above for privacy requests, corrections, erasure, objections, and takedowns.</p>
      </Section>
      <Section title="What we collect">
        <p><strong className="text-white">Game state (your browser only).</strong> Lineup, draft pools, minutes, and results stored as <code>court-draft-sim-store</code> in your own browser localStorage. It stays on your device except for the lineup you choose to send when you trigger a simulation. Clear site data to delete it.</p>
        <p><strong className="text-white">Server logs (personal data under RA 10173).</strong> IP address, date/time, method/URL/status, user-agent, referrer. URLs may include game filters (franchise/decade). We collect <strong className="text-white">no</strong> name, email, account, password, payment, precise location, or contacts.</p>
      </Section>
      <Section title="Why + legal basis">
        <p>Security, debugging, and abuse prevention (rate limiting) — legitimate interest under Data Privacy Act Sec. 12(f). No marketing, no profiling, no sale. Where your local law requires consent for non-essential processing, we ask first.</p>
      </Section>
      <Section title="Recipients">
        <p>Frontend CDN by Vercel (global edge); API hosting by Render in Singapore; no database today. Fonts are self-hosted (no Google transfer). A future Postgres store (Singapore) will be listed here before use. Public source on GitHub is governed by GitHub&apos;s own statement if you visit it.</p>
      </Section>
      <Section title="Retention">
        <p>Raw API logs max <strong className="text-white">30 days</strong>, then deleted or aggregated. Browser saves persist until you clear them.</p>
      </Section>
      <Section title="Your rights">
        <p>Be informed, object, access, correct, erase/block, claim damages, and complain to the National Privacy Commission (privacy.gov.ph) or your local authority. Objecting to security logs means not using the hosted sim, since logging is required to run it securely.</p>
      </Section>
      <Section title="Children">
        <p>General audience; 13+ recommended with parental guidance below that. No accounts and no knowing collection beyond technical logs. Parents/guardians may email for review or erasure.</p>
      </Section>
    </div>
  );
}

function TermsBody() {
  return (
    <div>
      <p className="text-sm text-broadcast-text-secondary">By using the game you agree; if not, don&apos;t use it.</p>
      <Section title="What it is">
        <p>Free, hobby, fan-made sim. No accounts, no fees. Provided <strong className="text-white">AS-IS</strong>, no warranty, no uptime promise; it may change or shut down anytime. Public code is under MIT (see LICENSE); these Terms govern use of the hosted game.</p>
      </Section>
      <Section title="Fan disclaimer">
        <p>Not affiliated with, endorsed, or sponsored by the NBA, its teams, or players. Names + factual stats are used for identification/informational fan use only. No logos, jerseys, or photos. Owners: contact <a className="text-broadcast-accent underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> for prompt takedown.</p>
      </Section>
      <Section title="Acceptable use">
        <p>No API abuse (scraping past rate limits, disruption, cheating), no unlawful or malicious content, no security circumvention. Breaches may be rate-limited or blocked. You must comply with your own local laws, including PH RA 10175 where applicable.</p>
      </Section>
      <Section title="Liability — Philippines + international">
        <p>To the maximum extent permitted by all applicable laws (PH + your local mandatory law): no liability for indirect, incidental, special, consequential, or punitive loss (profits, data, goodwill); aggregate liability capped at the amount paid (zero for this free game) or re-supply where your law requires. Nothing limits liability for fraud, willful misconduct, or gross negligence, or rights that cannot be waived — those prevail on conflict.</p>
      </Section>
      <Section title="Law / venue">
        <p>Philippines law; courts of Malasiqui, Pangasinan — except where your habitual residence grants non-waivable jurisdiction or consumer rights, which are preserved.</p>
      </Section>
    </div>
  );
}

function CookiesBody() {
  return (
    <div>
      <Section title="First-party cookies">
        <p><strong className="text-white">None.</strong> No cookie banner is shown because there is nothing requiring cookie consent.</p>
      </Section>
      <Section title="Local storage (functional)">
        <p><code>court-draft-sim-store</code> — saves your draft, lineup, minutes, and results so reloads resume. Required for the game you requested. Delete via browser → Clear site data; the game still works, progress resets.</p>
      </Section>
      <Section title="Third parties / tracking">
        <p>None in the game: no analytics, pixels, beacons, ad SDKs, or Google Fonts calls. If any are ever added, this page and the Privacy Notice update first, with prior consent where required.</p>
      </Section>
    </div>
  );
}

const TITLES: Record<LegalDoc, string> = {
  privacy: 'Privacy Notice',
  terms: 'Terms of Use',
  cookies: 'Cookies & Local Storage',
};

export function LegalModal({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  useLockBodyScroll(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Lightweight focus trap: cycle Tab within the dialog.
      if (e.key === 'Tab' && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const list = [...items].filter(el => !el.hasAttribute('disabled'));
        if (list.length === 0) return;
        const first = list[0]!;
        const last = list[list.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
    };
  }, [onClose, doc]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-broadcast-dark/90 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label={TITLES[doc]}>
      <div
        ref={panelRef}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-broadcast-border bg-broadcast-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="font-display text-lg font-bold text-white">{TITLES[doc]}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close legal document" className="rounded-lg border border-white/10 px-3 py-1 text-sm text-broadcast-text-secondary hover:text-white hover:border-broadcast-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent">
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {doc === 'privacy' && <PrivacyBody />}
          {doc === 'terms' && <TermsBody />}
          {doc === 'cookies' && <CookiesBody />}
          <p className="mt-6 text-[11px] text-broadcast-text-muted">Not legal advice. Contact {CONTACT} for requests.</p>
        </div>
      </div>
    </div>
  );
}
