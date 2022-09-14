/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        theme: {
          content: 'rgb(88 110 117 / <alpha-value>)',
          'content-opaque': 'rgb(131 148 150 / <alpha-value>)',
          'bg-highlight': 'rgb(238 232 213 / <alpha-value>)',
          bg: 'rgb(253 246 227 / <alpha-value>)',
          accent: 'rgb(223 202 136 / <alpha-value>)',
          blue: 'rgb(38 139 210 / <alpha-value>)',
          red: 'rgb(220 50 47 / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
