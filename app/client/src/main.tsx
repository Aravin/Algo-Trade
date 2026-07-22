import './lib/auth.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Auth0Provider } from '@auth0/auth0-react'
import { auth0Config, isAuth0Enabled } from './lib/auth0-config.ts'

const root = createRoot(document.getElementById('root')!)

if (isAuth0Enabled()) {
  root.render(
    <StrictMode>
      <Auth0Provider
        domain={auth0Config.domain}
        clientId={auth0Config.clientId}
        authorizationParams={{
          redirect_uri: window.location.origin,
          audience: auth0Config.audience || undefined,
        }}
        cacheLocation="sessionstorage"
      >
        <App />
      </Auth0Provider>
    </StrictMode>,
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
