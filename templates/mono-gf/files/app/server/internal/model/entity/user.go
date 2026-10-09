// 数据实体。字段名 → 列名的映射由 gdb 自动做（CamelCase → snake_case），
// 显式写 orm tag 是为了让「这张表有哪些列」在不查 SQL 的情况下也一眼可见。
//
// 表结构定下来之后，改成跑 `make dao`（gf gen dao）生成 dao/do/entity，
// 那份会覆盖本文件——届时把 logic 里的 `g.DB().Model(...)` 换成 dao 调用即可。
// 模板刻意手写这一份，是为了让项目**生成即可编译**，而不是先连库才能编译。
package entity

import "github.com/gogf/gf/v2/os/gtime"

// User 对应 db/schema.sql 里的 t_user。
type User struct {
	Id        int64       `json:"id"        orm:"id"`
	Name      string      `json:"name"      orm:"name"`
	Email     string      `json:"email"     orm:"email"`
	CreatedAt *gtime.Time `json:"createdAt" orm:"created_at"`
}
