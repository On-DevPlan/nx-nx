// user 模块的接口契约。后端 → 数据库的整条链路靠它演示：
// 前端列表页 → /api/user/list → controller → logic → g.DB() → PostgreSQL 的 t_user。
package v1

import "github.com/gogf/gf/v2/frame/g"

// ListReq 分页查询用户。
//
// 校验规则写在 tag 里而不是 handler 里：这样 CLI/HTTP/文档三处拿到的是同一套规则，
// 不会出现「接口文档写 min:1 但代码里忘了判」。
type ListReq struct {
	g.Meta `path:"/user/list" method:"get" tags:"user" summary:"用户列表（分页）"`
	Page   int `json:"page" d:"1"  v:"min:1"      dc:"页码，从 1 开始"`
	Size   int `json:"size" d:"20" v:"between:1,100" dc:"每页条数"`
}

// UserItem 列表项。字段名与前端类型一一对应，多一个字段前端就多一份要维护的映射。
type UserItem struct {
	Id        int64  `json:"id"        dc:"主键"`
	Name      string `json:"name"      dc:"姓名"`
	Email     string `json:"email"     dc:"邮箱"`
	CreatedAt string `json:"createdAt" dc:"创建时间"`
}

// ListRes 列表返回。
type ListRes struct {
	Total int        `json:"total" dc:"总数"`
	List  []UserItem `json:"list"  dc:"本页数据"`
}

// CreateReq 新建用户。
type CreateReq struct {
	g.Meta `path:"/user/create" method:"post" tags:"user" summary:"新建用户"`
	Name   string `json:"name"  v:"required|length:1,64" dc:"姓名"`
	Email  string `json:"email" v:"required|email"       dc:"邮箱"`
}

// CreateRes 新建结果。
type CreateRes struct {
	Id int64 `json:"id" dc:"新记录主键"`
}
