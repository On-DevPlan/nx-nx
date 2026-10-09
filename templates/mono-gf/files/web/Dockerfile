# 前端镜像：node 构建 → nginx 托管。
#
# 为什么要分两阶段：node_modules 与构建工具链不该进最终镜像
# （体积从 ~400MB 降到 ~50MB，且少一整类「运行时有 npm 却没人知道谁在用」的风险）。
#
# 依赖用 npm install 而不是 npm ci：package-lock.json 在 Windows 上生成时
# 只会解析 win32 原生可选依赖，Linux 上 npm ci 装不出 rollup/esbuild 的 linux 包，
# 构建会在 vite 阶段报「Cannot find module」——看着像代码问题，其实无关平台。
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
# 先装依赖再拷源码：源码改动不会让依赖层缓存失效
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
