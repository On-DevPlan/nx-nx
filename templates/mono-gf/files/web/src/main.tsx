import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './app.css'

const el = document.getElementById('root')
if (!el) throw new Error('找不到 #root 容器（index.html 被改过？）')

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
