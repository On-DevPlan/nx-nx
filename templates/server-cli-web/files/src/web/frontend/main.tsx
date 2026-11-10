// 面板入口：Provider 组装（store → toast → 路由）。
//
// 路由在最内层，因为它要用 store 里的 bootstrap 数据与 settings；
// 反过来 store 不认识路由——「当前在哪一页」由 URL 决定，不再存在这里。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router.js';
import { StoreProvider } from './store.js';
import { ToastProvider } from './components/ui/index.js';
import './assets/tokens.css';
import './assets/base.css';
import './assets/shells.css';
import './assets/features.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('缺少 #root 挂载点');

createRoot(rootEl).render(
  <StrictMode>
    <StoreProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </StoreProvider>
  </StrictMode>,
);
