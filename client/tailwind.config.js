/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        court: {
          50: '#f0f5f9',
          100: '#dce3eb',
          200: '#bccddc',
          300: '#8fabbf',
          400: '#66899e',
          500: '#4a6d82',
          600: '#3d5766',
          700: '#344652',
          800: '#2e3a45',
          900: '#29323b',
          950: '#1a2128',
        },
        broadcast: {
          dark: '#0a0f14',
          darker: '#060a0d',
          card: '#111820',
          border: '#1e2a38',
          accent: '#00d4aa',
          accentDim: '#00a887',
          gold: '#ffd700',
          goldDim: '#e6c200',
          red: '#ff3b30',
          blue: '#007aff',
          green: '#34c759',
          purple: '#af52de',
        },
        // Expose text colors at root level for text-* utilities
        'broadcast-text-primary': '#f0f5f9',
        'broadcast-text-secondary': '#8fabbf',
        'broadcast-text-muted': '#66899e',
        team: {
          lakers: '#552583',
          celtics: '#007a33',
          bulls: '#ce1141',
          warriors: '#1d428a',
          heat: '#98002e',
          spurs: '#c4ced4',
          nets: '#000000',
          knicks: '#006bb6',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-subtle': 'bounceSubtle 2s infinite',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'shimmer': 'shimmer 2s infinite',
        'slot-roll': 'slotRoll 0.1s linear',
        'slot-settle': 'slotSettle 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slot-spin': 'slotSpin 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'card-flip': 'cardFlip 0.6s ease-out',
        'confetti': 'confetti 1s ease-out forwards',
      },
      keyframes: {
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slotRoll: {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(-100%)' },
        },
        slotSettle: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slotSpin: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-50%)' },
        },
        cardFlip: {
          '0%': { transform: 'rotateY(90deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg)', opacity: '1' },
        },
        confetti: {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(100vh) rotate(720deg)', opacity: '0' },
        },
      },
      boxShadow: {
        'broadcast': '0 0 0 1px rgba(0, 212, 170, 0.1), 0 4px 24px rgba(0, 0, 0, 0.4)',
        'broadcast-lg': '0 0 0 1px rgba(0, 212, 170, 0.15), 0 8px 48px rgba(0, 0, 0, 0.5)',
        'glow-accent': '0 0 20px rgba(0, 212, 170, 0.3)',
        'glow-gold': '0 0 20px rgba(255, 215, 0, 0.4)',
        'inner-card': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'court-pattern': "url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%2300d4aa\" fill-opacity=\"0.02\"%3E%3Cpath d=\"M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')",
        'broadcast-gradient': 'linear-gradient(180deg, #0a0f14 0%, #0d151c 50%, #0a0f14 100%)',
      },
    },
  },
  plugins: [],
}