// 路由的类型层工具：
//   - RouteParams：从 '/api/templates/:id' 里提取 :id（模板字面量递归）
//   - ParamsCovered：断言路由参数全部在 args 中声明（否则运行时静默 undefined）
//   - AmbiguousPairs：检测结构性歧义路由（如 /x/:a 与 /x/:b，任何排序都救不了）

export type RouteParams<P extends string> = P extends `${string}:${infer Rest}`
  ? Rest extends `${infer Name}/${infer More}`
    ? Name | RouteParams<`/${More}`>
    : Rest
  : never;

export type ArgNames<A> = A extends { args: infer As }
  ? As extends readonly unknown[]
    ? As[number] extends infer X
      ? X extends string
        ? X
        : X extends { name: infer N }
          ? N
          : never
      : never
    : never
  : never;

type PatternOf<A> = A extends { http: infer H }
  ? H extends readonly [string, infer P]
    ? P
    : never
  : never;

// 路由里声明的每个 :param 都必须出现在 args 名中。
// 对应 skill 错误案例："声明 args:['ref'] 却与 http 的 :ref 不同名 → 静默 undefined"。
export type ParamsCovered<A> = [RouteParams<PatternOf<A>>] extends [never]
  ? true
  : RouteParams<PatternOf<A>> extends ArgNames<A>
    ? true
    : false;

// ---- 路由歧义检测（对应 api.js 注释里 status 被 :id 抢走的事故）----

type Segs<P extends string> = P extends `${infer H}/${infer R}` ? [H, ...Segs<R>] : [P];

type SegMatch<A extends string, B extends string> = A extends `:${string}`
  ? true
  : B extends `:${string}`
    ? true
    : A extends B
      ? true
      : false;

type SameLenCompat<X extends readonly string[], Y extends readonly string[]> = X extends readonly [
  infer XH extends string,
  ...infer XR extends string[],
]
  ? Y extends readonly [infer YH extends string, ...infer YR extends string[]]
    ? SegMatch<XH, YH> extends true
      ? SameLenCompat<XR, YR>
      : false
    : false
  : true;

// 段数相同、每段字面量相等或互为参数 → 两条路由匹配同一批 URL。
export type Overlap<P extends string, Q extends string> = Segs<P>['length'] extends Segs<Q>['length']
  ? SameLenCompat<Segs<P>, Segs<Q>>
  : false;

// 路由键 = "METHOD|/api/path"。同一路径不同方法（GET/PUT/DELETE）不是歧义——
// 运行时先按 method 过滤再匹配，类型层也必须同口径，否则 REST 风格的
// PUT /api/x/:id 与 DELETE /api/x/:id 会被误报。
type MethodOfKey<K extends string> = K extends `${infer M}|${string}` ? M : never;
type PatternOfKey<K extends string> = K extends `${string}|${infer P}` ? P : never;

export type OverlapKey<A extends string, B extends string> = [MethodOfKey<A>] extends [MethodOfKey<B>]
  ? [MethodOfKey<B>] extends [MethodOfKey<A>]
    ? Overlap<PatternOfKey<A>, PatternOfKey<B>>
    : false
  : false;

// 对路由键元组做双重遍历，产出所有歧义对（无歧义则 never）。
//
// **为什么要分桶**：段数不同的两条路由永远匹配不到同一批 URL，
// 所以只有「同段数」的路由才可能歧义。原实现对全表做 O(n²) 的映射类型展开，
// 路由一多（50+）就会把 TS 的类型实例化预算打爆
// （实测报 "Type instantiation is excessively deep"）。
// 现在先按段数分桶，桶内再两两比对——桶通常只有几条，代价降一个数量级，
// 判定口径与原来完全一致。
type LenOfKey<K extends string> = Segs<PatternOfKey<K>>['length'];

type Bucket<Ps extends readonly string[], L extends number> = Ps extends readonly [
  infer H extends string,
  ...infer R extends readonly string[],
]
  ? LenOfKey<H> extends L
    ? [H, ...Bucket<R, L>]
    : Bucket<R, L>
  : [];

type AmbiguousInBucket<Ps extends readonly string[], I extends unknown[] = []> = I['length'] extends Ps['length']
  ? never
  : Ps[I['length'] & number] extends infer P extends string
    ?
        | {
            [J in keyof Ps]: J extends `${I['length']}`
              ? never
              : OverlapKey<P, Ps[J] extends string ? Ps[J] : never> extends true
                ? `${P} ≈ ${Ps[J]}`
                : never;
          }[number]
        | AmbiguousInBucket<Ps, [...I, 1]>
    : never;

/** 表中出现过的段数（去重）。 */
type DistinctLens<
  Ps extends readonly string[],
  Acc extends number[] = [],
> = Ps extends readonly [infer H extends string, ...infer R extends readonly string[]]
  ? LenOfKey<H> extends Acc[number]
    ? DistinctLens<R, Acc>
    : DistinctLens<R, [...Acc, LenOfKey<H>]>
  : Acc;

type AmbiguousAcrossLens<
  Ps extends readonly string[],
  Ls extends number[],
> = Ls extends readonly [infer L extends number, ...infer R extends number[]]
  ? AmbiguousInBucket<Bucket<Ps, L>> | AmbiguousAcrossLens<Ps, R>
  : never;

export type AmbiguousPairs<Ps extends readonly string[]> = AmbiguousAcrossLens<Ps, DistinctLens<Ps>>;
