/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./shared/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Obie-v5 Kiosk Theme
        'kiosk-bg': '#0f172a', // slate-900
        'kiosk-card': 'rgba(30, 41, 59, 0.6)', // slate-800/60
        'kiosk-accent': '#f59e0b', // amber-500
        'kiosk-accent-light': '#fbbf24', // yellow-400
      },
      animation: {
        'scroll-left': 'scroll-left 20s linear infinite',
        'fade-in': 'fade-in 0.5s ease-out',
      },
      keyframes: {
        'scroll-left': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
