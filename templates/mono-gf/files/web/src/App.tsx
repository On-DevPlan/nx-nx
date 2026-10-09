import { useState } from 'react'

import Dashboard from './pages/Dashboard'
import Users from './pages/Users'

/**
 * 应用外壳：侧栏 + 顶栏 + 内容区。
 *
 * 路由用 `useState` 而不是引 router 库：本模板只有两页，
 * 引一个路由库换来的是「多一层要维护的抽象」。页面超过 5 个再换 react-router。
 */

type PageId = 'dashboard' | 'users'

const PAGES: { id: PageId; label: string }[] = [
  { id: 'dashboard', label: '概览' },
  { id: 'users', label: '用户管理' },
]

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard')

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{{initial}}</span>
          <span>{{name}}</span>
        </div>
        <nav className="nav">
          {PAGES.map((p) => (
            <a
              key={p.id}
              className="nav-item"
              href={'#' + p.id}
              aria-current={page === p.id ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault()
                setPage(p.id)
              }}
            >
              {p.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <strong>{PAGES.find((p) => p.id === page)?.label}</strong>
          <span className="tag mono">v{{version}}</span>
        </header>
        <main className="content">
          {page === 'dashboard' ? <Dashboard /> : <Users />}
        </main>
      </div>
    </div>
  )
}
