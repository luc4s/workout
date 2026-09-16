import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { requestPersistence } from './db/db';
import './styles/global.css';

registerSW({ immediate: true });
requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
