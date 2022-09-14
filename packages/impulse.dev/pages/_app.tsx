import '../styles/globals.css'
import type { AppProps } from 'next/app'

if (process.env.NODE_ENV === 'development') {
  const impulseParams = {
    prettierConfig: require('../../../.prettierrc.js'),
    tailwindConfig: require('../tailwind.config'),
    config: { editorLinkSchema: 'neovide' },
  }
  import('@impulse.dev/runtime').then((impulse) => impulse.run(impulseParams))
}

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

export default MyApp
