import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { PlayerWindow, AdminConsole } from './pages'
import './index.css'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<PlayerWindow />} />
        <Route path="/admin" element={<AdminConsole />} />
      </Routes>
    </HashRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)