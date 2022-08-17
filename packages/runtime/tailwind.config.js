module.exports = {
  content: ['./src/**/*.{tsx,ts,js,jsx,md,mdx}'],
  theme: {
    extend: {
      colors: colors([
        'base03',
        'base02',
        'base01',
        'base00',
        'base0',
        'base1',
        'base2',
        'base3',
        'yellow',
        'orange',
        'red',
        'magenta',
        'violet',
        'blue',
        'cyan',
        'green',
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
