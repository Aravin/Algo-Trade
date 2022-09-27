import '../styles/globals.css'
import type { AppProps } from 'next/app'
import AppLayout from '../components/Layout'
import Head from 'next/head'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
    <Head>
      <title>Algo Trade</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" key="viewport" />
    </Head>
    <AppLayout>
      <Component {...pageProps} />
    </AppLayout>
    </>
  )
}

export default MyApp
