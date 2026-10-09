import { useEffect, useState } from 'react'

import { api } from '../api/client'

/**
 * 概览页：证明「前端 → nginx/vite 代理 → GoFrame → 响应」这条链路是通的。
 *
 * 这里刻意只打 /hello（不碰数据库）：它能区分三种状态 ——
 * 页面没起来、页面起来了但后端没起来、整条链路都通。
 */

interface PingRes {
  service: string
  version: string
  time: string
}

export default function Dashboard() {
  const [ping, setPing] = useState<PingRes | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    api
      .get<PingRes>('/hello')
      .then((r) => alive && setPing(r))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [])

  return (
    <>
      {error && <div className="notice">{error}</div>}

      <div className="card">
        <div className="card-title">服务状态</div>
        {ping ? (
          <dl className="kv">
            <dt>应用</dt>
            <dd className="mono">{ping.service}</dd>
            <dt>版本</dt>
            <dd className="mono">{ping.version}</dd>
            <dt>服务端时间</dt>
            <dd className="mono">{ping.time}</dd>
          </dl>
        ) : (
          <p className="muted">检测中…</p>
        )}
      </div>

      <div className="card">
        <div className="card-title">接口文档</div>
        <p className="muted" style={{ margin: '0 0 10px' }}>
          后端由 GoFrame 从 api 契约自动生成 OpenAPI 文档与调试面板。
          <strong>只在开发配置里开启</strong>（config.docker.yaml 已关掉）——
          生产环境多一个入口就多一份暴露面。
        </p>
        <div className="row">
          <a className="btn btn-ghost" href="http://127.0.0.1:{{apiPort}}/swagger" target="_blank" rel="noreferrer">
            打开自带面板
          </a>
          <a className="btn btn-ghost" href="http://127.0.0.1:{{apiPort}}/api.json" target="_blank" rel="noreferrer">
            查看 api.json
          </a>
        </div>
      </div>
    </>
  )
}
