// 面板入口：Provider 组装（store → toast → theme → App）。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { StoreProvider } from './store.js';
import { ToastProvider } from './components/ui.js';
import { ThemeProvider } from './components/theme.js';
import './style.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('缺少 #root 挂载点');

createRoot(rootEl).render(
  <StrictMode>
    <StoreProvider>
      <ToastProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </ToastProvider>
    </StoreProvider>
  </StrictMode>,
);
