import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 开发期把 /api 反代到本机的 Go 进程，并**把前缀剥掉**。
 *
 * 为什么后端路由里没有 /api 前缀还要剥：后端是 GoFrame 的 api 契约
 * （/hello、/user/list），前缀是给「同源 + 反代」这层用的——
 * 浏览器只跟一个源打交道，生产期由 nginx 做同一件事（见 web/nginx.conf）。
 *
 * ⚠️ 两处规则必须一致：这里 rewrite 掉 /api，nginx 的 proxy_pass 结尾也要带 /。
 * 不一致的症状是「本地好、上线 404」——最难查的那一类。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:{{apiPort}}',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
})
