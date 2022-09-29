const libConfig = require('../tailwind.config')

module.exports = {
  ...libConfig,
  content: ['./src/**/*.{tsx,ts,js,jsx,md,mdx}', '../src/**/*.{tsx,ts,js,jsx,md,mdx}'],
}
