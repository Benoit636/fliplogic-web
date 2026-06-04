import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './fliplogic-web/src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './fliplogic-web/src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './fliplogic-web/src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
