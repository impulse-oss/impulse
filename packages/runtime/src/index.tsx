import ReactDOM from 'react-dom/client'
import styles from './styles.css'
import { ImpulseParams, ImpulseRoot } from './app'

declare global {
  interface Window {
    IMPULSE_RUN: typeof run   
  }
}

window.IMPULSE_RUN = run

export function run(params?: ImpulseParams) {
  if (typeof window === 'undefined') {
    return
  }

  const styleElement = document.createElement('style')
  styleElement.id = 'impulse-styles'
  styleElement.innerHTML = styles
  document.head.appendChild(styleElement)

  const rootElement = document.createElement('div')
  rootElement.id = 'impulse-mount-point'
  document.body.appendChild(rootElement)

  const root = ReactDOM.createRoot(rootElement)
  root.render(<ImpulseRoot {...params} />)
  console.log('Impulse started successfully! 🎉');
}
