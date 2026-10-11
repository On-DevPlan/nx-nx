// 面板表单模型（src/modules/scaffold/option-form.ts）的测试。
//
// 这个模块是 core/templates.ts 的**前端镜像**：面板用它决定「预览文件 / 生成项目」
// 两个按钮能不能点。两边规则一旦漂移，后果分两头——
//   面板比服务端严 → 合法输入点不动（mono-gf 与 std-a-lang 的按钮恒灰就是这么来的）
//   面板比服务端松 → 用户点了才吃服务端报错，表单白填
// 所以除了单测每条规则，还要拿真实模板库与服务端**对拍**：面板说行，服务端必须收。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { listTemplates, resolveVars } from '../../src/core/templates.js';

// tsx 以「经典 JSX 运行时」转译 .tsx（根 tsconfig 只是 references，没有 jsx 设置），
// 因此直接渲染组件时需要 React 在全局。Vite/tsc 那边走 react-jsx 自动注入，不受影响。
globalThis.React = React;
const { OptionField } = await import('../../src/modules/scaffold/option-field.js');
import {
  blockingIssues,
  describeIssues,
  isBlank,
  splitOptions,
  suggestProjectName,
  validateOption,
} from '../../src/modules/scaffold/option-form.js';
import { sampleValues } from './sample-values.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const html = (opt, value) =>
  renderToStaticMarkup(createElement(OptionField, { opt, value, onChange: () => {} }));

test('isBlank: 空串/null/undefined 算缺，0 与 false 不算', () => {
  for (const v of ['', null, undefined]) assert.equal(isBlank(v), true, String(v));
  assert.equal(isBlank(0), false, '0 是合法端口');
  assert.equal(isBlank(false), false, 'false 是合法开关值');
});

test('splitOptions: 必填在前、可选在后，组内保持声明顺序', () => {
  const opts = [
    { name: 'a', label: 'A' },
    { name: 'b', required: true, label: 'B' },
    { name: 'c', label: 'C' },
    { name: 'd', required: true, label: 'D' },
  ];
  const g = splitOptions(opts);
  assert.deepEqual(g.required.map((o) => o.name), ['b', 'd']);
  assert.deepEqual(g.optional.map((o) => o.name), ['a', 'c']);
});

test('validateOption: 留空一律放行（必填与否交给 blockingIssues，避免刚打开就满屏红）', () => {
  assert.equal(validateOption({ name: 'letters', type: 'letters', required: true }, ''), null);
  assert.equal(validateOption({ name: 'port', type: 'number' }, undefined), null);
});

test('validateOption: 类型规则与服务端 coerceOption 逐条对齐', () => {
  assert.equal(validateOption({ name: 'port', type: 'number' }, '8000'), null);
  assert.match(validateOption({ name: 'port', type: 'number' }, 'abc'), /必须是数字/);

  assert.equal(validateOption({ name: 'letters', type: 'letters' }, 'AB'), null, '服务端大小写宽容');
  assert.match(validateOption({ name: 'letters', type: 'letters' }, 'abcdef'), /1~5 位小写字母/);

  const scheme = { name: 'scheme', type: 'enum', values: ['klein', 'mars'] };
  assert.equal(validateOption(scheme, 'mars'), null);
  assert.match(validateOption(scheme, 'zzz'), /只能是 klein \| mars/);

  const lang = { name: 'lang', type: 'string', pattern: '^[a-z]{2}$' };
  assert.equal(validateOption(lang, 'ts'), null);
  assert.match(validateOption(lang, 'TS'), /格式不符合要求/);
});

test('blockingIssues: 有 default 的必填项不算缺（服务端 blank+default 会落回默认值）', () => {
  const opts = [{ name: 'ver', required: true, default: '0.1.0' }];
  assert.deepEqual(blockingIssues(opts, {}), []);
  const noDefault = [{ name: 'name', required: true }];
  assert.equal(blockingIssues(noDefault, {}).length, 1);
  assert.equal(blockingIssues(noDefault, { name: 'demo' }).length, 0);
});

test('describeIssues: 缺什么说什么，一行讲完', () => {
  const text = describeIssues(
    blockingIssues(
      [
        { name: 'name', label: '项目名', required: true },
        { name: 'letters', label: '项目字母', type: 'letters' },
      ],
      { letters: 'toolong' },
    ),
  );
  assert.match(text, /还差必填项：项目名/);
  assert.match(text, /项目字母 必须是 1~5 位小写字母/);
  assert.equal(describeIssues([]), '');
});

test('suggestProjectName: 四套模板各自推出自己的项目名（不认 letters 一家）', async () => {
  const { templates } = await listTemplates();
  const by = (id) => templates.find((t) => t.id === id);

  // server-cli-web：namePrefix + letters
  assert.equal(suggestProjectName(by('server-cli-web'), { letters: 'ab' }), 'nx-ab');
  // mono-gf：没有 namePrefix，直接用 name 选项
  assert.equal(suggestProjectName(by('mono-gf'), { name: 'demo' }), 'demo');
  // std-a-lang：namePrefix + 第一个必填项 lang，与 hooks.mjs 的派生一致
  assert.equal(suggestProjectName(by('std-a-lang'), { lang: 'ts' }), 'a_ts');
  // 多语言（ts, go）不是合法目录名 → 不猜，让用户自己填
  assert.equal(suggestProjectName(by('std-a-lang'), { lang: 'ts, go' }), '');
  assert.equal(suggestProjectName(by('server-cli-web'), {}), '');
});

test('真实模板库逐个对拍：面板说行，服务端必须收；面板说缺，服务端必须拒', async () => {
  const { templates } = await listTemplates();
  assert.ok(templates.length >= 1, '模板库不该是空的，否则这条测试是空转');

  for (const meta of templates) {
    const opts = meta.options || [];
    const label = meta.id;

    // 空表单：有必填项就必须被面板拦下，且服务端同步拒绝
    const empty = blockingIssues(opts, {});
    const mustFill = opts.some((o) => o.required && (o.default ?? null) === null);
    assert.equal(empty.length > 0, mustFill, `${label}: 面板与服务端对「还缺必填项」的判断不一致`);
    if (empty.length) {
      assert.throws(
        () => resolveVars(meta, {}),
        /缺少必填选项/,
        `${label}: 面板说有必填项没填，服务端却收了`,
      );
    }

    // 填齐后：面板零阻塞，服务端零报错（这条钉死 mono-gf / std-a-lang 的按钮恒灰）
    const values = sampleValues(meta);
    assert.deepEqual(
      blockingIssues(opts, values),
      [],
      `${label}: 合法输入下按钮仍不可点`,
    );
    assert.doesNotThrow(() => resolveVars(meta, values), `${label}: 面板放行但服务端拒绝`);
  }
});

test('必填 / 选填标记在所有控件类型上一致（此前 enum 与 boolean 压根没有标记）', () => {
  // 这条直接渲染出 HTML 来查，不依赖浏览器——面板的读法必须对所有 type 统一。
  for (const type of ['string', 'number', 'letters', 'enum', 'boolean']) {
    const req = html({ name: 'x', type, label: '字段', required: true, values: ['a', 'b'] }, '');
    assert.match(req, /class="req"/, `${type} 的必填星号缺失`);
    assert.doesNotMatch(req, /opt-badge/, `${type} 同时标了必填与选填`);

    const opt = html({ name: 'x', type, label: '字段', values: ['a', 'b'] }, type === 'boolean' ? false : 'a');
    assert.match(opt, /opt-badge/, `${type} 的选填徽标缺失`);
    assert.match(opt, /选填/, `${type} 的选填文案缺失`);
    assert.doesNotMatch(opt, /class="req"/, `${type} 同时标了必填与选填`);
  }
});

test('留空不报红，格式错才在行内报错', () => {
  // 刚打开面板时满屏红字是噪音：缺必填由分组标题 + 底部提示负责，行内只管格式。
  assert.doesNotMatch(html({ name: 'x', type: 'string', label: '字段', required: true }, ''), /opt-hint bad/);
  assert.match(html({ name: 'x', type: 'letters', label: '项目字母' }, 'toolong'), /1~5 位小写字母/);
  assert.match(
    html({ name: 'lang', type: 'string', label: '语言', pattern: '^[a-z]{2}$' }, 'TS'),
    /格式不符合要求/,
  );
});

test('回归：面板不得再按具体选项名门禁', () => {
  // 这条锁的是 bug 的形状而不是行为：mono-gf 的 name、std-a-lang 的 lang 都不叫
  // letters，一旦有人图省事写回 `!letters`，按钮立刻对不上模板。
  const src = readFileSync(join(ROOT, 'src', 'modules', 'scaffold', 'view.tsx'), 'utf8');
  assert.ok(!src.includes('请先填项目字母'), '写死的「项目字母」提示该回来了');
  assert.ok(
    !/disabled=\{[^}]*\bletters\b/.test(src),
    '按钮 disabled 又绑到 letters 上了：非 letters 模板（mono-gf / std-a-lang）会恒灰',
  );
  assert.match(src, /disabled=\{busy \|\| !tpl \|\| allIssues\.length > 0/, '按钮应按 schema 推出的 issues 门禁（siblings 时再拼一条 missing dir）');
});