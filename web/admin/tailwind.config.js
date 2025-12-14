/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../DJAMMS_PLAYER_REACT_MIGRATION/web/shared/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // DJAMMS Admin Theme (matches Electron app)
        'djamms-bg': '#000000',
        'djamms-secondary': '#121212',
        'djamms-elevated': '#1f1f1f',
        'djamms-hover': '#2d2d2d',
        'djamms-accent': '#ff1e56',
        'djamms-border': '#333333',
      },
    },
  },
  plugins: [],
}
