// 数据库驱动的注册点。
//
// GoFrame 的驱动是**自注册**的：只有驱动包被 import（哪怕是空导入），
// 它才会在 init() 里把自己注册进 gdb 的驱动表。少这一行，运行期会报
//
//	cannot find database driver for specified database type "pgsql"
//
// 而 go.mod 里有依赖、`go build` 也通过 —— 编译期完全看不出问题，
// 只在第一次查库时才炸。这是最容易漏、也最难一眼看出的一个坑。
//
// 为什么单独放一个包而不是写在 main.go：驱动必须在**所有会建连接的二进制**里生效，
// 包括测试二进制。放在「唯一会创建连接的包」里，测试与线上走同一条注册路径。
// （internal/logic 里也有一处空导入，是给只编译 logic 的单元测试用的。）
package db

import (
	// PostgreSQL 驱动（纯 Go，无需 CGO）
	_ "github.com/gogf/gf/contrib/drivers/pgsql/v2"
)
