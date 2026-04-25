import { StrictMode, Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import { registerServiceWorker } from './lib/pwa';
import './index.css';

const Admin = lazy(() => import('./pages/Admin.jsx'));
const Tap = lazy(() => import('./pages/Tap.jsx'));

registerServiceWorker();

function RouteFallback() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <div className="h-10 w-40 animate-pulse rounded-xl bg-gray-200" />
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-2xl bg-white shadow-sm" />
          ))}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route
          path="/tap"
          element={(
            <AppErrorBoundary title="Tap page failed to load">
              <Suspense fallback={<RouteFallback />}>
                <Tap />
              </Suspense>
            </AppErrorBoundary>
          )}
        />
        <Route
          path="/admin"
          element={(
            <AppErrorBoundary title="Admin page failed to load">
              <Suspense fallback={<RouteFallback />}>
                <Admin />
              </Suspense>
            </AppErrorBoundary>
          )}
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
