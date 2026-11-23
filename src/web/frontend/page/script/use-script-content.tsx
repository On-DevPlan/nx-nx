// 选中脚本之后的三件事：读源码、拉参数声明、维护「有没有改动」。
//
// 单独一层的原因：这三个 effect 是「选中谁 → 拿到什么」的完整闭环，
// 与「跑哪条通道、台账怎么刷」无关。分开后工作台本体只剩动作编排。
import { useEffect, useState } from 'react';
import type { ScriptParam } from '../../../../core/script/params.js';
import type { C } from './helpers.js';
import { defaultValues } from './helpers.js';

export function useScriptContent(client: C, selected: string | null) {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [params, setParams] = useState<ScriptParam[]>([]);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  // 选中脚本 → 拉参数声明（表单控件据此渲染）；切换时用默认值重置
  useEffect(() => {
    if (!selected) {
      setParams([]);
      setParamValues({});
      return;
    }
    let alive = true;
    client['script.params']({ name: selected })
      .then((r) => {
        if (!alive) return;
        setParams(r.params);
        setParamValues(defaultValues(r.params));
      })
      .catch(() => {
        if (!alive) return;
        setParams([]);
        setParamValues({});
      });
    return () => {
      alive = false;
    };
  }, [selected, client]);

  // 选中脚本 → 读源码；切走后丢弃迟到的响应
  useEffect(() => {
    if (!selected) {
      setContent('');
      setSavedContent('');
      return;
    }
    let alive = true;
    setBusy('load');
    setErr('');
    client['script.read']({ name: selected })
      .then((r) => {
        if (!alive) return;
        setContent(r.content);
        setSavedContent(r.content);
      })
      .catch((e: unknown) => {
        if (alive) setErr(String((e as { message?: string })?.message || e));
      })
      .finally(() => {
        if (alive) setBusy(null);
      });
    return () => {
      alive = false;
    };
  }, [selected, client]);

  return {
    content,
    setContent,
    savedContent,
    setSavedContent,
    params,
    paramValues,
    setParamValues,
    busy,
    setBusy,
    err,
    setErr,
  };
}
