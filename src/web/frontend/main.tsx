// 面板入口：Provider 组装（query → store → toast → theme → App）。
//
// QueryClient 放在最外层：服务组状态、运行台账这些「服务端事实」都归它管，
// 视图只声明「我要什么、多久刷一次」，缓存与重取由它决定。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.js';
import { StoreProvider } from './store.js';
import { ToastProvider } from './components/ui.js';
import { ThemeProvider } from './components/theme.js';
import './style.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 本地工具：失败重试一次就够，重试太多只会让「服务没起」的提示迟迟不出来
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 2000,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('缺少 #root 挂载点');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <ToastProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </ToastProvider>
      </StoreProvider>
    </QueryClientProvider>
  </StrictMode>,
);
