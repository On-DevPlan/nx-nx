// 栏目管理：**容器 + 拖拽**。整页只有一个心智模型——
//   一个页面要么在「平铺」里、要么在某个分组里、要么在「隐藏」里；
//   拖，就是把它从一个容器挪到另一个。
//
// 「隐藏」不是开关，就是一个容器：拖进去 = 不出现在头部（深链仍然可用）。
// 拖拽过程中**实时预览**（列表就按落点重排），松手即提交——所见即所得。
//
// **受控组件**：数据（cfg）与保存都在设置页；这里只管画与调 onChange。
// 所有数据操作走 navModel 的纯函数（可单测），组件里不做状态体操。
import { useMemo, useState } from 'react';
import * as nav from '../../web/frontend/components/navModel.js';

export default function NavManager({ sections, value, onChange }) {
  const [drag, setDrag] = useState(null); // { kind:'view', vid } | { kind:'group', gi }
  const [over, setOver] = useState(null); // { key, index, group? }

  // 注意顺序：preview 的依赖里用到 allIds —— const 声明晚于使用就是 TDZ 崩
  const allIds = sections.map((s) => s.id);
  const sectionOf = (id) => sections.find((s) => s.id === id) || null;

  const keyToTarget = (key) => {
    if (key === 'pool') return { kind: 'pool' };
    if (key === 'hidden') return { kind: 'hidden' };
    const gi = Number(key.slice(1));
    return Number.isFinite(gi) ? { kind: 'group', gi } : null;
  };

  /** 实时预览：拖动过程中就把落点算出来渲染，松手前就看到最终顺序。 */
  const preview = useMemo(() => {
    if (drag?.kind !== 'view' || !over) return value;
    const target = keyToTarget(over.key);
    if (!target) return value;
    const index = nav.insertionIndex(value, drag.vid, target, over.index, allIds);
    return nav.moveToContainer(value, drag.vid, target, index, allIds);
  }, [value, drag, over, allIds]);

  const draggingVid = drag?.kind === 'view' ? drag.vid : null;
  const endDrag = () => { setDrag(null); setOver(null); };

  /** 松手即提交预览里的顺序（预览就是结果）。 */
  const commit = () => { if (preview !== value) onChange(preview); endDrag(); };

  // 只在落点真的变了才 setState：dragover 每次鼠标移动都触发，不去重就会每动一下重排整页
  const setOverIfChanged = (next) => setOver((o) => (
    o && o.key === next.key && o.index === next.index && o.group === next.group ? o : next
  ));

  const zone = (key, base = '') => ({
    className: `${base} ${over?.key === key ? 'drop-target' : ''}`,
    onDragOver: (e) => {
      if (draggingVid) { e.preventDefault(); setOverIfChanged({ key, index: null }); }
    },
    onDragLeave: () => setOver((o) => (o?.key === key && o.index === null ? null : o)),
    onDrop: (e) => { e.preventDefault(); commit(); },
  });

  /**
   * 行的落点判定。两条防抖铁律：
   *   ① 行内事件**就地拦下**（preventDefault + stopPropagation）：一旦冒泡到容器，
   *      容器会把它当成「拖到空白处」翻成「追加到末尾」——指针压在被拖的行上时来回切，就抖。
   *   ② 插入位取自**原始配置**里的位置（不随预览漂移）+ 指针在上半/下半决定前后；
   *      用「预览后的行号」等于自己推自己。
   */
  const rowProps = (key, vid) => ({
    onDragOver: (e) => {
      if (!draggingVid) return;
      e.preventDefault();
      e.stopPropagation();
      if (draggingVid === vid) return; // 悬停在自己身上：保持当前落点，不重算
      const rect = e.currentTarget.getBoundingClientRect();
      const below = e.clientY > rect.top + rect.height / 2;
      const at = nav.containerOf(value, vid, allIds);
      const index = (typeof at.index === 'number' ? at.index : 0) + (below ? 1 : 0);
      setOverIfChanged({ key, index });
    },
    onDrop: (e) => { e.preventDefault(); e.stopPropagation(); commit(); },
    onDragStart: () => setDrag({ kind: 'view', vid }),
  });

  const pool = nav.poolIds(preview, allIds);

  return (
    <div className="stack">
      {/* ① 平铺：不进分组也不隐藏的页面（= 头部平铺显示） */}
      <section {...zone('pool', 'nav-pool')}>
        <div className="hint">平铺：不进分组也不隐藏的页面，直接显示在头部（拖到这里 = 移出分组 / 取消隐藏）</div>
        {pool.length ? (
          <div className="nav-list">
            {pool.map((vid) => (
              <SectionRow key={vid} section={sectionOf(vid)} vid={vid}
                dragging={draggingVid === vid}
                {...rowProps('pool', vid)}
                onDragEnd={endDrag}
                actions={null} />
            ))}
          </div>
        ) : <div className="muted">没有平铺的页面。</div>}
      </section>

      {/* ② 分组：组名可改、组间可拖把手换位 */}
      {preview.groups.map((g, gi) => (
        <section key={gi} {...zone(`g${gi}`, 'card nav-group')}>
          <div
            className={`colhead ${over?.key === `g${gi}` && over.group ? 'drop-target' : ''}`}
            onDragOver={(e) => {
              if (drag?.kind === 'group') { e.preventDefault(); setOverIfChanged({ key: `g${gi}`, index: null, group: true }); }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag?.kind === 'group' && drag.gi !== gi) onChange(nav.moveGroup(value, drag.gi, gi - drag.gi));
              endDrag();
            }}
          >
            <span className="grip" title="拖动调整分组顺序" draggable
              onDragStart={() => setDrag({ kind: 'group', gi })} onDragEnd={endDrag} />
            <input className="nav-title" placeholder="组名，如「求职」" value={g.title}
              onChange={(e) => onChange(nav.renameGroup(value, gi, e.target.value))} />
            <span className="muted">{g.views.length} 个页面</span>
            <span className="right rowgap">
              <button className="btn small ghost" onClick={() => onChange(nav.removeGroup(value, gi))}>删除组</button>
            </span>
          </div>
          {g.views.length ? (
            <div className="nav-list">
              {g.views.map((vid) => (
                <SectionRow key={vid} section={sectionOf(vid)} vid={vid}
                  dragging={draggingVid === vid}
                  {...rowProps(`g${gi}`, vid)}
                  onDragEnd={endDrag}
                  actions={<button className="btn small ghost" onClick={() => onChange(nav.toPool(value, vid, allIds))}>移出</button>} />
              ))}
            </div>
          ) : <div className="row"><span className="desc">空分组——把页面拖进来。</span></div>}
        </section>
      ))}

      {/* ③ 隐藏：与分组同构的容器——拖进去即「不进头部」 */}
      <section {...zone('hidden', 'card nav-group nav-hidden')}>
        <div className="colhead">
          隐藏
          <span className="muted">{preview.hidden.length} 个页面</span>
          <span className="right muted">不进头部 · 深链仍可用</span>
        </div>
        {preview.hidden.length ? (
          <div className="nav-list">
            {preview.hidden.map((vid) => (
              <SectionRow key={vid} section={sectionOf(vid)} vid={vid}
                dragging={draggingVid === vid}
                {...rowProps('hidden', vid)}
                onDragEnd={endDrag}
                actions={<button className="btn small ghost" onClick={() => onChange(nav.toPool(value, vid, allIds))}>移出</button>} />
            ))}
          </div>
        ) : <div className="row"><span className="desc">没有隐藏的页面——把不常用的拖进来。</span></div>}
      </section>

      <div className="rowgap">
        <button className="btn" onClick={() => onChange(nav.addGroup(value))}>新增分组</button>
        <span className="hint">组顺序 = 头部显示顺序；组内顺序 = 展开列表顺序</span>
      </div>
    </div>
  );
}

/** 一行页面：把手（拖）+ 名称 + 容器自己的动作（移出 / 无）。 */
function SectionRow({ section, vid, dragging, actions, onDragStart, onDragEnd, onDragOver, onDrop }) {
  return (
    <div className={`row nav-row ${dragging ? 'dragging' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <span className="grip" title="拖动：换位 / 换容器" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} />
      <span className="name">{section ? section.title : `页面已删除（${vid}）`}</span>
      <span className="desc">{section ? vid : '保存前请移出'}</span>
      <span className="acts">{actions}</span>
    </div>
  );
}
