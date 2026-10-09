// home 面板：一个演示动作（问候）+ 运行信息。
//
// 所有请求走类型安全 client：action id、参数名、flag 值类型、返回数据
// 全部由注册表类型推出，写错在编译期就红。
import { useState } from 'react';
import { CliHints } from '../../web/frontend/components/CliHints.js';
import { Copyable, useToast } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import type { GreetingResult } from './service.js';

export default function HomeView() {
  const { boot, client } = useStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [loud, setLoud] = useState(false);
  const [result, setResult] = useState<GreetingResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!name.trim()) {
      toast('请先填写名字');
      return;
    }
    setBusy(true);
    try {
      const r = await client['home.greet']({ name: name.trim(), loud });
      setResult(r);
    } catch (err) {
      toast(String((err as { message?: string })?.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ padding: 16 }}>
      <div className="card">
        <div className="colhead">问候（演示动作）</div>
        <div style={{ padding: 14 }}>
          <div className="toolbar">
            <input
              value={name}
              placeholder="你的名字"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send();
              }}
            />
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={loud} onChange={(e) => setLoud(e.target.checked)} />
              大声
            </label>
            <button className="btn" disabled={busy} onClick={() => void send()}>
              {busy ? '问候中…' : '打招呼'}
            </button>
          </div>
          {result && (
            <div style={{ marginTop: 12 }}>
              <strong>{result.greeting}</strong>
              <div className="muted" style={{ marginTop: 4 }}>
                第 {result.count} 次 · {result.at}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="colhead">运行信息</div>
        <dl className="kv">
          <div className="kv-row">
            <dt>应用</dt>
            <dd>{boot ? `${boot.app.name} v${boot.app.version}` : '加载中…'}</dd>
          </div>
          <div className="kv-row">
            <dt>存储</dt>
            <dd>
              <Copyable text={boot?.storePath || ''}>{boot?.storePath || '…'}</Copyable>
            </dd>
          </div>
          <div className="kv-row">
            <dt>环境变量</dt>
            <dd>{boot?.storeEnv}</dd>
          </div>
        </dl>
      </div>

      <CliHints module="home" />
    </div>
  );
}
