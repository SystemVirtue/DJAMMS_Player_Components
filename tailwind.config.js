/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/components/**/*.{jsx,tsx}",
    "./src/pages/**/*.{jsx,tsx}",
    "./src/web/**/*.{jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'google-sans': ['system-ui', '-apple-system', 'Roboto', 'sans-serif'],
      },
      colors: {
        ytm: {
          bg: '#000000',
          surface: '#121212',
          'surface-hover': '#1F1F1F',
          text: '#FFFFFF',
          'text-secondary': '#AAAAAA',
          'text-disabled': '#717171',
          accent: '#FF0000',
          divider: '#333333',
        },
      },
    },
  },
  plugins: [],
}

