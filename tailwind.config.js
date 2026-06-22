/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
        },
      },
      keyframes: {
        breathe: {
          '0%, 100%': {
            transform: 'scale(1)',
            boxShadow: '0 0 10px 2px rgba(59,130,246,0.12)',
          },
          '50%': {
            transform: 'scale(1.018)',
            boxShadow: '0 0 22px 6px rgba(59,130,246,0.30)',
          },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        breathe: 'breathe 2.4s ease-in-out infinite',
        'spin-slow': 'spin-slow 2.8s linear infinite',
      },
    },
  },
  darkMode: 'class',
  plugins: [],
};
