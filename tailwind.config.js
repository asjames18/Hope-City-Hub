/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          900: '#004E59',
          800: '#006064',
        },
        lime: {
          50: '#f7fde8',
          100: '#ecf9c9',
          400: '#A3D600',
          500: '#8fbf00',
          600: '#7aa800',
          700: '#5c7d00',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
