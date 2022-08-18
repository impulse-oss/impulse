module.exports = {
  content: ['./src/**/*.{tsx,ts,js,jsx,md,mdx}'],
  theme: {
    extend: {
      colors: colors([
        'content',
        'content-opaque',
        'bg-highlight',
        'bg',
        'accent',
        'blue',
        'red',
      ]),
    },
  },
  plugins: [],
}

function colors(names) {
  return Object.fromEntries(names.map((name) => [`theme-${name}`, color(name)]))
}

function color(name) {
  // return `var(--theme-color-${name})`
  return `rgb(var(--theme-color-${name}) / <alpha-value>)`
}
