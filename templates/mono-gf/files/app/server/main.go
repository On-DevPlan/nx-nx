// app/server 是这套骨架的唯一 HTTP 应用入口。
//
// 为什么入口必须在 app/ 下面而不是仓库根：Go 的 internal 规则——
// `app/server/internal/...` 只能被 `app/server/...` 子树里的包 import。
// 根目录放 main.go 的话，它 import 不到自己的 internal。
//
// 跑法：go run ./app/server（或 make run）
package main

import (
	"github.com/gogf/gf/v2/os/gctx"

	"{{goModule}}/app/server/internal/cmd"
)

func main() {
	cmd.Main.Run(gctx.GetInitCtx())
}
