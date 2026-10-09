// 接口契约（api 层）。这是唯一真相源：
//
//   - 路由、方法、参数校验规则、OpenAPI 文档全部由这里的 g.Meta 与 tag 派生
//   - `gf gen ctrl` 会据此生成 controller 骨架（本模板已手写好，可直接改）
//   - 前端只认这些路径（web/src/api/client.ts）
//
// 命名约定：<Action>Req / <Action>Res，controller 侧方法名就是 <Action>。
package v1

import "github.com/gogf/gf/v2/frame/g"

// PingReq 连通性自检。
type PingReq struct {
	g.Meta `path:"/hello" method:"get" tags:"hello" summary:"连通性自检（进程活着、配置读到了）"`
}

// PingRes 故意只回最少的字段：它要能在数据库不可用时也答上来，
// 否则「服务活着但库挂了」与「服务根本没起来」就分不清了。
type PingRes struct {
	Service string `json:"service" dc:"应用名"`
	Version string `json:"version" dc:"版本"`
	Time    string `json:"time"    dc:"服务端时间"`
}
