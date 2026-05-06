import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { RuntimeAPIProvider } from './contexts/RuntimeAPIProvider';
import { registerRuntimeAPIs } from './contexts/runtimeAPIRegistry';
import { I18nProvider, initializeLocale } from './lib/i18n';
import { ThemeSystemProvider } from './contexts/ThemeSystemContext';
import { ThemeProvider } from './components/providers/ThemeProvider';
import type { RuntimeAPIs } from './lib/api/types';

const noopAsync = async () => ({ ok: true } as any);
const noopSub = () => ({ close: () => {} });
const proxyApi = () => new Proxy({}, { get: () => noopAsync });

const fallbackRuntimeAPIs: RuntimeAPIs = {
  runtime: { platform: 'web', isDesktop: false, isVSCode: false, label: 'web' },
  terminal: new Proxy({ connect: noopSub }, { get: (_, p) => (p === 'connect' ? noopSub : noopAsync) }) as RuntimeAPIs['terminal'],
  git: proxyApi() as RuntimeAPIs['git'],
  files: proxyApi() as RuntimeAPIs['files'],
  settings: proxyApi() as RuntimeAPIs['settings'],
  permissions: proxyApi() as RuntimeAPIs['permissions'],
  notifications: proxyApi() as RuntimeAPIs['notifications'],
  tools: proxyApi() as RuntimeAPIs['tools'],
};

const runtimeAPIs = (window as typeof window & { __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs }).__OPENCHAMBER_RUNTIME_APIS__ ?? fallbackRuntimeAPIs;
registerRuntimeAPIs(runtimeAPIs);
initializeLocale();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RuntimeAPIProvider apis={runtimeAPIs}>
      <I18nProvider>
        <ThemeSystemProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </ThemeSystemProvider>
      </I18nProvider>
    </RuntimeAPIProvider>
  </React.StrictMode>,
);
