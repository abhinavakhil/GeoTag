import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router';
import './styles.css'; // global tokens first, so page styles can override them
import Landing from './pages/Landing.jsx';

const MapApp = lazy(() => import('./pages/MapApp.jsx')); // keeps Leaflet + app code out of the landing bundle

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<Suspense fallback={null}><MapApp /></Suspense>} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
