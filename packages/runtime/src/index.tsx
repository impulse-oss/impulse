import ReactDOM from 'react-dom/client'
import './styles.css'
import { ImpulseParams, ImpulseRoot } from './app'

export function mountApp(params?: ImpulseParams) {
  if (typeof window === 'undefined') {
    return
  }

  const rootElement = document.createElement('div')
  rootElement.id = 'impulse-mount-point'
  document.body.appendChild(rootElement)

  const root = ReactDOM.createRoot(rootElement)
  root.render(<ImpulseRoot {...params} />)
}
