/**
 * 后端调用的唯一出口。**业务页面不要绕过它直接 fetch** ——
 * 信封拆包、错误码判断、id 精度这三件事在这个家族里都踩过坑，
 * 散到每个页面写一遍时，必然有一处写漏。
 */

// 为什么是 /api：后端路由本身没有这个前缀（GoFrame 的 api 契约就是 /hello、/user/list），
// 前缀由「同源 + 反代」这一层剥掉 —— 开发期是 vite.config.ts 的 proxy，生产期是 nginx。
const BASE = '/api'

/**
 * GoFrame 默认的响应信封：`{ code, message, data }`。
 * code === 0 表示成功，非 0 时 message 是可展示的原因。
 */
interface Envelope<T> {
  code: number
  message: string
  data: T
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * 解析前把「位数过长」的整数字面量加上引号。
 *
 * 背景：雪花 id 是 ~19 位 int64，超出 Number.MAX_SAFE_INTEGER，
 * JSON.parse 会**静默改写**末几位 —— 症状是列表里的 id 与详情页的 id 对不上、
 * 删除落到错误的行上，而且没有任何报错。本模板的 t_user 用 BIGSERIAL 不受影响，
 * 但只要哪天换成雪花 id，这层就是唯一挡住它的东西。
 */
function quoteLongIntegers(text: string): string {
  return text.replace(/:\s*(-?\d{16,})([,}\]])/g, ': "$1"$2').replace(/\[\s*(-?\d{16,})([,}\]])/g, '["$1"$2')
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      headers: { 'content-type': 'application/json' },
      ...init,
    })
  } catch {
    // 网络层失败与业务失败必须区分：前者用户应该看「后端没起来」，而不是「操作失败」
    throw new ApiError('连不上后端服务（确认 Go 进程已启动）', -1)
  }

  const raw = await res.text()
  if (!raw) throw new ApiError(`后端返回空响应（HTTP ${res.status}）`, res.status)

  let env: Envelope<T>
  try {
    env = JSON.parse(quoteLongIntegers(raw)) as Envelope<T>
  } catch {
    throw new ApiError(`响应不是合法 JSON（HTTP ${res.status}）`, res.status)
  }

  if (env.code !== 0) {
    throw new ApiError(env.message || `请求失败（code ${env.code}）`, env.code)
  }
  return env.data
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
}
