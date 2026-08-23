import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/doto/wght.css'
import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import './styles.css'
import App from './App'
import AppSplash from './components/AppSplash'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppSplash />
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/notification-sw.js') })
}
