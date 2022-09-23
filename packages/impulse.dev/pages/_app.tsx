import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'

if (process.env.NODE_ENV === 'development') {
  const impulseParams = {
    // prettierConfig: require('../../../.prettierrc.js'),
    tailwindConfig: require('../tailwind.config'),
    config: { editorLinkSchema: 'neovide' },
  }
  import('@impulse.dev/runtime').then((impulse) => impulse.run(impulseParams))
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
