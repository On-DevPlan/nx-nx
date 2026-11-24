// API 文档页：OpenAPI 文档 + Swagger UI（文档由后端从 action 声明自动生成）。
import { definePage } from './contract.js';

export default definePage({
  path: '/api-docs',
  nav: { label: 'API 文档', order: 30 },
  page: () => import('../pages/api-docs/index.js'),
});
