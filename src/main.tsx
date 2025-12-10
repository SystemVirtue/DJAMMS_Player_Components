import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { PlayerWindow, AdminConsole } from './pages'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

function App() {
  return (
    <ErrorBoundary componentName="App">
      <HashRouter>
        <Routes>
          <Route path="/" element={
            <ErrorBoundary componentName="PlayerWindow">
              <PlayerWindow />
            </ErrorBoundary>
          } />
          <Route path="/admin" element={
            <ErrorBoundary componentName="AdminConsole">
              <AdminConsole />
            </ErrorBoundary>
          } />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)