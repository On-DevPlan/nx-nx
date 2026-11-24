// API 文档页：OpenAPI 文档 + Swagger UI。
//
// 文档本身由后端从 action 声明自动生成（GET /api/api-docs），本页只负责呈现：
//   - 有网（CDN 可达）→ 挂 Swagger UI（业界标准交互：展开路径、试调请求）
//   - 无网 / CDN 失败 → 降级为自绘文档列表（纯文本渲染，功能不丢）
//
// 为什么要自己降级而不是只依赖 CDN：面板是本机工具，经常在离线环境跑；
// 文档页在离线时必须还能看（它是 action 契约的人读视图）。
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';

interface OpenApiParam {
  name: string;
  in: string;
  required: boolean;
  description: string;
  schema?: { type?: string; enum?: string[] };
}

interface OpenApiOp {
  operationId: string;
  summary: string;
  parameters?: OpenApiParam[];
  requestBody?: { content: Record<string, { schema?: { properties?: Record<string, { description: string; type?: string }>; required?: string[] } }> };
}

interface OpenApiDoc {
  openapi: string;
  info: { title: string; description: string; version: string };
  paths: Record<string, Record<string, OpenApiOp>>;
}

const SWAGGER_CSS = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css';
const SWAGGER_JS = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js';

/** 脚本/样式按需加载一次（页面可能反复挂载）。 */
function loadAsset(tag: 'script' | 'link', attrs: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.addEventListener('load', () => resolve());
    el.addEventListener('error', () => reject(new Error('CDN 资源加载失败')));
    document.head.appendChild(el);
  });
}

export default function ApiDocsPage() {
  const [doc, setDoc] = useState<OpenApiDoc | null>(null);
  const [error, setError] = useState('');
  const [swaggerUp, setSwaggerUp] = useState(false);
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api<OpenApiDoc>('/api/api-docs')
      .then(setDoc)
      .catch((e) => setError(String((e as Error)?.message || e)));
  }, []);

  // Swagger UI 挂载：CSS + JS 都到位后再初始化
  useEffect(() => {
    if (!doc || !mountRef.current) return;
    let disposed = false;
    const w = window as unknown as { SwaggerUIBundle?: (cfg: unknown) => void };
    (async () => {
      try {
        await loadAsset('link', { rel: 'stylesheet', href: SWAGGER_CSS });
        await loadAsset('script', { src: SWAGGER_JS });
        if (disposed || !w.SwaggerUIBundle || !mountRef.current) return;
        w.SwaggerUIBundle({
          domNode: mountRef.current,
          spec: doc,
          deepLinking: true,
          docExpansion: 'list',
        });
        setSwaggerUp(true);
      } catch {
        // CDN 不可达 → 保持自绘文档（下面的降级视图）
      }
    })();
    return () => {
      disposed = true;
    };
  }, [doc]);

  return (
    <div className="stack" style={{ padding: 16 }}>
      <div className="card">
        <div className="colhead">
          API 文档
          <span className="right muted">
            {doc ? `OpenAPI ${doc.openapi} · ${doc.info.title} v${doc.info.version}` : '加载中…'}
          </span>
        </div>
        <div style={{ padding: 12 }} className="stack">
          {error && <div className="muted">文档加载失败：{error}</div>}
          {doc && (
            <div className="muted">
              文档由 action 声明自动生成——加一条 action 这里就多一节，字段描述来自各 schema 的
              .describe()。
            </div>
          )}
        </div>
      </div>

      {/* Swagger UI 容器（CDN 可达时填充；否则留空，下面显示自绘版本） */}
      <div ref={mountRef} style={{ display: swaggerUp ? 'block' : 'none' }} />

      {/* 降级视图：CDN 不可达时的自绘文档（信息完整，只是没有交互试调） */}
      {doc && !swaggerUp && (
        <div className="card">
          <div className="colhead">
            文档（自绘视图）
            <span className="right muted">Swagger UI 的 CDN 不可达，用内置渲染</span>
          </div>
          <div style={{ padding: 12 }} className="stack">
            {Object.entries(doc.paths).map(([path, ops]) =>
              Object.entries(ops).map(([method, op]) => (
                <div key={method + path} className="stack" style={{ gap: 4 }}>
                  <div className="row nav-row">
                    <span className="name">
                      {method.toUpperCase()} {path}
                    </span>
                    <span className="desc">{op.summary}</span>
                  </div>
                  {(op.parameters ?? []).map((p) => (
                    <div key={p.in + p.name} className="muted" style={{ paddingLeft: 16 }}>
                      {p.in} · {p.name}
                      {p.required ? '' : '?'} — {p.description}
                    </div>
                  ))}
                  {op.requestBody?.content?.['application/json']?.schema?.properties &&
                    Object.entries(op.requestBody.content['application/json'].schema.properties).map(
                      ([name, spec]) => (
                        <div key={'body-' + name} className="muted" style={{ paddingLeft: 16 }}>
                          body · {name} — {spec.description}
                        </div>
                      ),
                    )}
                </div>
              )),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
