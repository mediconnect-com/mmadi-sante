/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Couleur principale de MmadiSanté (vert-bleu « santé »)
        marque: {
          50: '#ecfdf8',
          100: '#d1faee',
          500: '#12b0a0',
          600: '#0e9488',
          700: '#0f766e',
          800: '#115e59',
        },
      },
    },
  },
  plugins: [],
};
