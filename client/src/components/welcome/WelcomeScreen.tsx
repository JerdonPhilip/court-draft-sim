import { useEffect, useRef } from 'react';
import { Dices, Trophy, Swords, ShieldCheck } from 'lucide-react';
import { APP_VERSION } from '../../version';

interface WelcomeScreenProps {
  filledCount: number;
  maxRounds: number;
  hasProgress: boolean;
  apiOnline: boolean | null;
  onStart: () => void;
  onContinue: () => void;
  onNewDraft: () => void;
}

const STEPS = [
  { Icon: Dices, title: '1 · Spin', text: 'Franchise + era combo. 4 re-spins, 3 rerolls per axis.' },
  { Icon: ShieldCheck, title: '2 · Draft 10', text: 'Five starters + five bench. One version per player.' },
  { Icon: Trophy, title: '3 · Sim 82', text: 'Sixth Man, options, 240 minutes. Pick a league, sim.' },
];

export function WelcomeScreen({ filledCount, maxRounds, hasProgress, apiOnline, onStart, onContinue, onNewDraft }: WelcomeScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-broadcast-dark">
      <a href="#welcome-start" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-broadcast-accent focus:text-broadcast-dark focus:rounded-lg">
        Skip to start
      </a>
      {/* Even vertical rhythm via a single gap scale; sections carry no outer margins. */}
      <main className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-2 text-center sm:gap-3.5 sm:px-6 md:gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-broadcast-accent to-broadcast-gold sm:h-12 sm:w-12 sm:rounded-2xl" aria-hidden="true">
          <Swords className="h-5 w-5 text-broadcast-dark sm:h-6 sm:w-6" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-broadcast-accent sm:text-[11px]">Fan-made sim · v{APP_VERSION}</p>
          <h1 ref={headingRef} tabIndex={-1} className="gradient-text mt-1 font-display text-3xl font-bold focus:outline-none sm:text-4xl">
            COURT DRAFT SIM
          </h1>
          <p className="mx-auto mt-1.5 max-w-xl text-xs text-broadcast-text-secondary sm:text-base">
            Draft a 10-man roster through the slot machine, set the rotation,
            and sim all 82 — or duel a legend in VS Mode.
          </p>
        </div>

        <div>
          <div id="welcome-start" className="flex w-full max-w-[19rem] flex-col items-stretch gap-2 sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-3">
            {hasProgress ? (
              <>
                <button onClick={onContinue} className="btn-primary inline-flex min-h-[44px] items-center justify-center px-6 py-2.5 text-base">
                  CONTINUE ({filledCount}/{maxRounds})
                </button>
                <button onClick={onNewDraft} className="btn-secondary inline-flex min-h-[44px] items-center justify-center px-5 py-2.5 text-base">
                  NEW DRAFT
                </button>
              </>
            ) : (
              <button onClick={onStart} className="btn-primary inline-flex min-h-[48px] items-center justify-center px-7 py-2.5 text-lg">
                START DRAFT
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-broadcast-text-muted" role="status">
            {apiOnline === null ? 'Checking server…' : apiOnline ? 'Server online.' : 'Server offline — playing locally (same engine).'}
          </p>
        </div>

        <div className="grid w-full grid-cols-3 items-stretch gap-1.5 sm:gap-2" aria-label="How it works">
          {STEPS.map(({ Icon, title, text }) => (
            <div key={title} className="card flex min-w-0 flex-col p-2.5 text-left sm:p-3">
              <Icon className="h-4 w-4 shrink-0 text-broadcast-accent" aria-hidden="true" />
              <h2 className="mt-1.5 font-display text-xs font-bold text-white sm:text-sm">{title}</h2>
              <p className="mt-0.5 text-[11px] leading-snug text-broadcast-text-secondary sm:text-xs">{text}</p>
            </div>
          ))}
        </div>

        <p className="max-w-xl text-[10px] leading-relaxed text-broadcast-text-muted sm:text-[11px]">
          Free hobby project. Not affiliated with the NBA. Progress saves only in this browser. 13+ recommended.
        </p>
      </main>
    </div>
  );
}
