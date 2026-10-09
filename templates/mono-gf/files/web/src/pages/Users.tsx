import { useCallback, useEffect, useState } from 'react'

import { api } from '../api/client'

/**
 * 用户管理：一次完整的 CRUD 半边（列表 + 新增）。
 *
 * 它是这套骨架的「端到端证据」：这张表真的在 PostgreSQL 里，
 * 写入真的经过 controller → logic → g.DB()，而不是前端造数。
 */

interface UserItem {
  id: string
  name: string
  email: string
  createdAt: string
}

interface ListRes {
  total: number
  list: UserItem[]
}

export default function Users() {
  const [data, setData] = useState<ListRes | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await api.get<ListRes>('/user/list?page=1&size=20'))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function submit() {
    if (!name.trim() || !email.trim()) {
      setError('姓名与邮箱都要填')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.post('/user/create', { name: name.trim(), email: email.trim() })
      setName('')
      setEmail('')
      await load()
    } catch (e) {
      // 后端把数据库原文带回来了（例如唯一索引冲突），直接展示比自造文案有用
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && <div className="notice">{error}</div>}

      <div className="card">
        <div className="card-title">新增用户</div>
        <div className="row">
          <input
            className="input"
            placeholder="姓名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
          <button className="btn" disabled={busy} onClick={() => void submit()}>
            {busy ? '提交中…' : '新增'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          用户列表{data ? `（共 ${data.total} 条）` : ''}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>ID</th>
              <th>姓名</th>
              <th>邮箱</th>
              <th style={{ width: 180 }}>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {data?.list.map((u) => (
              <tr key={u.id}>
                <td className="mono">{u.id}</td>
                <td>{u.name}</td>
                <td className="mono">{u.email}</td>
                <td className="mono muted">{u.createdAt}</td>
              </tr>
            ))}
            {data && data.list.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  还没有数据。先确认 db/schema.sql 已执行（docker compose up -d pg 会自动跑）。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
