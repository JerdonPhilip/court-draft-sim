# Court Draft Sim

An NBA roster-building and 82-game simulation game inspired by 82-0.com. Build your ultimate 5-man lineup through a 5-round draft with a slot machine mechanic, then simulate a full 82-game season with a non-linear win curve algorithm.

## Features

- **Slot Machine Draft Engine**: Spin for random NBA franchise + decade combinations to create your draft pool
- **5-Round Draft**: Fill PG, SG, SF, PF, C positions with strategic picks
- **Franchise/Decade Rerolls**: Limited tactical rerolls — keep the decade and roll a new team, or vice versa
- **82-Game Simulation**: Non-linear win curve that makes 82-0 progressively harder unless all stats are balanced
- **Era Seasons**: Take your roster against a full 82-game schedule in any decade (1960s–2020s) with real historical lineups, or the default mixed league
- **VS Mode**: Challenge historical all-time great teams (96 Bulls, 17 Warriors, 01 Lakers, etc.)
- **Dark Mode Sports Broadcast UI**: High-contrast, animated interface modeled after modern sports dashboards

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS + Lucide React
- **Backend**: Node.js + Express + TypeScript
- **State Management**: Zustand with persistence
- **Drag & Drop**: @dnd-kit
- **Animations**: Framer Motion

## Project Structure

```
court-draft-sim/
├── client/                 # Vite + React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── draft/      # Draft screen components
│   │   │   └── simulation/ # Simulation dashboard components
│   │   ├── store/          # Zustand store
│   │   ├── types/          # TypeScript types
│   │   ├── data/           # Constants and static data
│   │   ├── utils/          # Helper functions & API client
│   │   ├── App.tsx         # Main app component
│   │   └── main.tsx        # Entry point
│   └── ...
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic (simulation, draft)
│   │   ├── data/           # Player database & historical teams
│   │   ├── types/          # Shared TypeScript types
│   │   └── index.ts        # Server entry point
│   └── ...
└── package.json            # Root workspace config
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Install all dependencies (run from root)
npm install

# Or install separately
cd client && npm install
cd ../server && npm install
```

### Development

```bash
# Run both frontend and backend concurrently
npm run dev

# Or run separately
npm run dev:client  # Frontend on http://localhost:5173
npm run dev:server  # Backend on http://localhost:3001
```

### Building

```bash
# Build both workspaces
npm run build

# Build separately
npm run build:client
npm run build:server
```

### Production

```bash
# Build and start server
npm run build
npm run start
```

## Game Mechanics

### Draft Phase
1. **Spin** the slot machine to get a random Franchise + Decade combination (4 manual re-spins per game; dealt pools are always free)
2. **Review** 5-6 available players from that franchise/era
3. **Draft** one player for your current position slot (PG→SG→SF→PF→C)
4. **Repeat** for 5 rounds
5. **Use Rerolls** strategically (3 Franchise Rerolls, 3 Decade Rerolls per game)

### Simulation Phase
- Pick your season: mixed modern league or any era (1960s–2020s) with real historical lineups
- Player ratings (PTS, REB, AST, STL, BLK) feed into a weighted algorithm
- Position-specific weights ensure balanced lineups perform better
- **Non-linear win curve**: 82-0 requires elite balance across ALL categories
- Variance introduces realistic game-to-game fluctuation

### VS Mode
- Select from 10 historical all-time great teams
- Choose 1-game or 7-game series
- Full box score breakdown for each game

## API Endpoints

```
GET  /api/health                    # Health check
GET  /api/draft/pools               # All franchise/decade combinations
GET  /api/draft/franchises          # All franchises
GET  /api/draft/decades             # All decades
POST /api/draft/spin                # Spin for random pool
GET  /api/draft/pool/:franchise/:decade  # Get specific pool

GET  /api/players                   # All players (with filters)
GET  /api/players/:id               # Single player
GET  /api/players/by-franchise-decade/:franchise/:decade
GET  /api/players/random/:franchise/:decade?count=5
GET  /api/players/decade/:decade
GET  /api/players/franchise/:franchise
GET  /api/players/search/:query

POST /api/simulation/season         # Simulate 82-game season (optional era: 1960s–2020s)
POST /api/simulation/game           # Simulate single game
POST /api/simulation/vs-mode        # VS Mode simulation
GET  /api/simulation/historical-teams  # List historical teams
GET  /api/simulation/eras          # List playable season eras with difficulty
```

## Player Database

The game includes 910+ historical players across 7 eras:
- **1960s**: Russell, Chamberlain, Robertson, West, Baylor, Pettit, Lucas, Reed, Hayes, Alcindor, Monroe, Cunningham + full 4–7 man pools for all 14 period franchises
- **1970s**: Kareem, Dr. J, Maravich, Gervin, Cowens, Barry, Walton, McAdoo, Frazier, Reed, Hayes + full pools for all 22 ABA/NBA lineages
- **1980s**: Magic, Bird, Moses, Isiah, Dominique, Jordan, Moncrief, Dantley, B. King, Sikma + full pools for all 23 lineages
- **1990s**: Jordan, Hakeem, Malone, Stockton, Robinson, Shaq, Mourning, Payton, Kemp, Hardaway + full pools for all 28 lineages
- **2000s**: Shaq, Kobe, Duncan, KG, Dirk, Nash, Iverson, Wade, LeBron, Yao, Kidd, Webber, Pierce, Carter + full pools for all 29 lineages
- **2010s**: LeBron, Curry, KD, Kawhi, Harden, Giannis, AD, Jokic, Rose, Dwight, Wall, Westbrook + full pools for all 29 lineages
- **2020s**: Jokic, Giannis, Luka, SGA, Tatum, Wemby, Embiid, Trae, Morant, Paolo, Cade, Hali + full pools for all 30 lineages

## License

MIT