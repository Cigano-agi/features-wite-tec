import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BillingLinksPage from './pages/BillingLinks';
import PublicChargePage from './pages/PublicCharge';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BillingLinksPage />} />
        <Route path="/pay/:linkId" element={<PublicChargePage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
