import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BRANDING } from './config/branding'
import { App } from './ui/App'
import './ui/index.css'

document.title = BRANDING.name

const root = document.getElementById('root')
if (!root) throw new Error('index.html is missing the #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
