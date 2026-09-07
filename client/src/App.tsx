'use client';

import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/gameStore';
import { DraftScreen } from './components/draft/DraftScreen';
import { SimulationDashboard } from './components/simulation/SimulationDashboard';
import { VSModeScreen } from './components/simulation/VSMode';
import { HISTORICAL_TEAMS } from './data/historicalTeams';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-broadcast-dark flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-broadcast-accent to-broadcast-gold flex items-center justify-center animate-pulse">
          <svg className="w-10 h-10 text-broadcast-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-bold gradient-text mb-2">COURT DRAFT SIM</h1>
        <p className="text-broadcast-text-secondary">Building your dynasty...</p>
        <div className="mt-6 w-48 mx-auto h-2 bg-broadcast-card rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-broadcast-accent to-broadcast-gold animate-shimmer" style={{ width: '100%' }} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { phase, draftState, simulationResult, vsMatchup, historicalTeams, setHistoricalTeams, initializeDraft } = useGameStore();

  useEffect(() => {
    if (historicalTeams.length === 0) {
      setHistoricalTeams(HISTORICAL_TEAMS);
    }
    initializeDraft();
  }, []);

  const handleNewDraft = () => {
    initializeDraft();
  };

  const handleVSMode = () => {
    // Phase will be set by the store action
  };

  if (phase === 'draft') {
    return <DraftScreen />;
  }

  if (phase === 'simulation') {
    return <LoadingScreen />;
  }

  if (phase === 'results' && simulationResult) {
    return (
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

  if (phase === 'vs-mode' && vsMatchup) {
    return (
      <AnimatePresence mode="wait">
        <VSModeScreen
          key="vs-mode"
          onBack={handleNewDraft}
        />
      </AnimatePresence>
    );
  }

  return <DraftScreen />;
}