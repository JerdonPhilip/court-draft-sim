import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/gameStore';
import { DraftScreen } from './components/draft/DraftScreen';
import { SeasonSetup } from './components/simulation/SeasonSetup';
import { SimulationDashboard } from './components/simulation/SimulationDashboard';
import { VSModeScreen } from './components/simulation/VSMode';
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

export default function App() {
  const { phase, draftState, simulationResult, vsMatchup, historicalTeams, setHistoricalTeams, initializeDraft, runSimulation, setPhase, error, setError } = useGameStore();
  const initialized = useRef(false);

  useEffect(() => {
    // Don't wipe rehydrated state: only init a fresh draft when there's no progress.
    if (initialized.current) return;
    initialized.current = true;
    const hasProgress = draftState.lineup.slots.some(s => s.player !== null) || draftState.pool !== null;
    if (!hasProgress && phase === 'draft') {
      initializeDraft();
      void useGameStore.getState().spinDraftPool();
    }
    if (historicalTeams.length === 0) {
      api.simulation.getHistoricalTeams()
        .then(data => setHistoricalTeams(data.teams))
        .catch(() => {
          // Offline backup: local reference list (ids match the server).
          setHistoricalTeams(HISTORICAL_TEAMS);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewDraft = () => {
    initializeDraft();
    void useGameStore.getState().spinDraftPool();
  };

  const handleVSMode = () => {
    setPhase('vs-mode');
  };

  const handleBackToResults = () => {
    setError(null);
    setPhase(simulationResult ? 'results' : 'draft');
  };

  if (phase === 'draft') {
    return <><DraftScreen /><Toasts /></>;
  }

  if (phase === 'season-setup') {
    return <><SeasonSetup onBack={() => setPhase('draft')} /><Toasts /></>;
  }

  if (phase === 'simulation') {
    if (error) {
      return <><ErrorScreen message={error} onRetry={() => { setError(null); setPhase('draft'); }} /><Toasts /></>;
    }
    // The setup screen kicks off runSimulation; this is a transient state.
    // Retry once if we landed here without a pending load (e.g. persisted phase).
    if (!useGameStore.getState().isLoading && !simulationResult) {
      void runSimulation();
    }
    return <><LoadingScreen message="Simulating your 82-game season..." /><Toasts /></>;
  }

  if (phase === 'results' && simulationResult) {
    return (
      <><AnimatePresence mode="wait">
        <SimulationDashboard
          key="simulation"
          result={simulationResult}
          onNewDraft={handleNewDraft}
          onVSMode={handleVSMode}
        />
      </AnimatePresence><Toasts /></>
    );
  }

  if (phase === 'results' && error) {
    return <><ErrorScreen message={error} onRetry={handleBackToResults} /><Toasts /></>;
  }

  if (phase === 'vs-mode') {
    return (
      <><AnimatePresence mode="wait">
        <VSModeScreen
          key="vs-mode"
          onBack={handleBackToResults}
        />
      </AnimatePresence><Toasts /></>
    );
  }

  void vsMatchup;
  return <><DraftScreen /><Toasts /></>;
}
