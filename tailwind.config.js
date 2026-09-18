/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/client/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        cairo: ['Cairo', 'Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#e8f5ef',
          100: '#c9e8db',
          200: '#a3d9c1',
          300: '#6ec4a0',
          400: '#3aa87f',
          500: '#0e7c56',
          600: '#0b6a4a',
          700: '#085640',
          800: '#064334',
          900: '#043128',
        },
      }
    },
  },
  plugins: [],
}