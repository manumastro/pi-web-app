import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { clearFrontendCacheStorage } from '@/lib/frontend-cache';
import './index.css';
import 'katex/dist/katex.min.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';

clearFrontendCacheStorage();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
