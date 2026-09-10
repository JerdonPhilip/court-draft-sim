import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/gameStore';
import { DraftScreen } from './components/draft/DraftScreen';
import { SeasonSetup } from './components/simulation/SeasonSetup';
import { SimulationDashboard } from './components/simulation/SimulationDashboard';
import { VSModeScreen } from './components/simulation/VSMode';
import { WelcomeScreen } from './components/welcome/WelcomeScreen';
import { Footer, type LegalDoc } from './components/legal/Footer';
import { LegalModal } from './components/legal/LegalModal';
import { Toasts } from './components/ui/Toasts';
import { api } from './utils/api';
import { HISTORICAL_TEAMS } from './data/historicalTeams';

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-broadcast-dark flex items-center justify-center" role="status" aria-live="polite">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-broadcast-accent to-broadcast-gold flex items-center justify-center animate-pulse">
          <svg className="w-10 h-10 text-broadcast-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-bold gradient-text mb-2">COURT DRAFT SIM</h1>
        <p className="text-broadcast-text-secondary">{message}</p>
        <div className="mt-6 w-48 mx-auto h-2 bg-broadcast-card rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-broadcast-accent to-broadcast-gold animate-shimmer" style={{ width: '100%' }} />
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-broadcast-dark flex items-center justify-center px-4">
      <div className="text-center max-w-md" role="alert">
        <h1 className="font-display text-2xl font-bold text-white mb-2">Simulation failed</h1>
        <p className="text-broadcast-text-secondary mb-6">{message}</p>
        <button onClick={onRetry} className="btn-primary px-6 py-3">Back to draft</button>
      </div>
    </div>
  );
}

function legalFromHash(): LegalDoc | null {
  const h = window.location.hash.replace('#', '');
  return h === 'privacy' || h === 'terms' || h === 'cookies' ? h : null;
}

export default function App() {
  const { phase, draftState, simulationResult, historicalTeams, setHistoricalTeams, initializeDraft, runSimulation, setPhase, error, setError } = useGameStore();
  const isLoading = useGameStore(s => s.isLoading);
  const initialized = useRef(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(() => legalFromHash());
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const openLegal = useCallback((doc: LegalDoc) => {
    setLegalDoc(doc);
    window.location.hash = doc;
  }, []);
  const closeLegal = useCallback(() => {
    setLegalDoc(null);
    if (legalFromHash()) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    const onHash = () => setLegalDoc(legalFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    // Don't wipe rehydrated state: only init a fresh draft when entering play.
    // Welcome gate owns the first spin so cold visits cost zero API calls.
    if (initialized.current) return;
    initialized.current = true;
    if (historicalTeams.length === 0) {
      api.simulation.getHistoricalTeams()
        .then(data => { setHistoricalTeams(data.teams); setApiOnline(true); })
        .catch(() => {
          // Offline backup: local reference list (ids match the server).
          setHistoricalTeams(HISTORICAL_TEAMS);
          setApiOnline(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewDraft = () => {
    initializeDraft();
    void useGameStore.getState().spinDraftPool();
  };

  const handleWelcomeStart = () => {
    initializeDraft();
    void useGameStore.getState().spinDraftPool();
  };

  const handleWelcomeContinue = () => {
    const s = useGameStore.getState();
    s.setHasSeenWelcome(true);
    s.setPhase('draft');
    // Returning without a pool (e.g. cleared mid-draft) — recover a free spin.
    const st = useGameStore.getState();
    const filled = st.draftState.lineup.slots.filter(sl => sl.player).length;
    if (!st.draftState.pool && filled < st.draftState.maxRounds && !st.draftState.isSpinning) {
      void st.spinDraftPool();
    }
  };

  const handleVSMode = () => {
    setPhase('vs-mode');
  };

  const handleBackToResults = () => {
    setError(null);
    setPhase(simulationResult ? 'results' : 'draft');
  };

  const legalModal = legalDoc ? <LegalModal doc={legalDoc} onClose={closeLegal} /> : null;
  const chrome = <><Footer onOpenLegal={openLegal} /><Toasts />{legalModal}</>;
  const withChrome = (node: React.ReactNode) => <>{node}{chrome}</>;

  // Retry once if we landed in simulation without a pending load
  // (e.g. persisted phase). Side-effect belongs in an effect, not render —
  // otherwise StrictMode double-renders double-sim.
  useEffect(() => {
    if (phase === 'simulation' && !error && !isLoading && !simulationResult) {
      void runSimulation();
    }
  }, [phase, error, isLoading, simulationResult, runSimulation]);

  if (phase === 'welcome') {
    const filled = draftState.lineup.slots.filter(s => s.player !== null).length;
    const hasProgress = filled > 0 || draftState.pool !== null;
    // Single viewport: screen + footer share one h-dvh so nothing scrolls.
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <WelcomeScreen
          filledCount={filled}
          maxRounds={draftState.maxRounds}
          hasProgress={hasProgress}
          apiOnline={apiOnline}
          onStart={handleWelcomeStart}
          onContinue={handleWelcomeContinue}
          onNewDraft={handleNewDraft}
        />
        <Footer onOpenLegal={openLegal} />
        <Toasts />
        {legalModal}
      </div>
    );
  }

  if (phase === 'draft') {
    return withChrome(<DraftScreen />);
  }

  if (phase === 'season-setup') {
    return withChrome(<SeasonSetup onBack={() => setPhase('draft')} />);
  }

  if (phase === 'simulation') {
    if (error) {
      return withChrome(<ErrorScreen message={error} onRetry={() => { setError(null); setPhase('draft'); }} />);
    }
    // The setup screen kicks off runSimulation; this is a transient state.
    return withChrome(<LoadingScreen message="Simulating your 82-game season..." />);
  }

  if (phase === 'results' && simulationResult) {
    return withChrome(
      <AnimatePresence mode="wait">
        <SimulationDashboard
          key="simulation"
          result={simulationResult}
          onNewDraft={handleNewDraft}
          onVSMode={handleVSMode}
        />
      </AnimatePresence>
    );
  }

  if (phase === 'results' && error) {
    return withChrome(<ErrorScreen message={error} onRetry={handleBackToResults} />);
  }

  if (phase === 'vs-mode') {
    return withChrome(
      <AnimatePresence mode="wait">
        <VSModeScreen
          key="vs-mode"
          onBack={handleBackToResults}
        />
      </AnimatePresence>
    );
  }

  return withChrome(<DraftScreen />);
}
