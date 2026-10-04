import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/app.css'
import 'katex/dist/katex.min.css'

const container = document.getElementById('root')
if (!container) throw new Error('PUCHO root element is missing')

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)