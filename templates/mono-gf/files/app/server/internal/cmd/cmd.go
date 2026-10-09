// 命令与装配：进程启动的一切都收敛在这里，顺序可读。
//
// 与 nx-nx 家族的老习惯一致（见 go-ac）：**启动即失败**比带半截状态跑着强。
// 所以这里不做「连不上库也先起来」的降级——那只会把问题推迟到某个请求上。
package cmd

import (
	"context"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/gogf/gf/v2/os/gcmd"

	"{{goModule}}/app/server/internal/consts"
	"{{goModule}}/app/server/internal/controller/hello"
	"{{goModule}}/app/server/internal/controller/user"
	// 空导入：只为触发 PostgreSQL 驱动的 init() 自注册。
	// 放在 internal/db 而不是 main.go，是为了让测试二进制走同一条注册路径。
	_ "{{goModule}}/app/server/internal/db"
)

// Main 服务主命令。
var Main = gcmd.Command{
	Name:  consts.AppName,
	Usage: consts.AppName,
	Brief: "{{description}}",
	Func: func(ctx context.Context, parser *gcmd.Parser) error {
		return run(ctx)
	},
}

func run(ctx context.Context) error {
	s := g.Server(consts.ServerName)

	// 监听地址从配置读（manifest/config/config.yaml 的 server.address），
	// 缺配置时回落到 consts.DefaultAddr，避免「配置文件没挂上就静默监听 0.0.0.0:80」。
	addr := g.Cfg().MustGet(ctx, "server.address", consts.DefaultAddr).String()
	s.SetAddr(addr)

	// 路由：一条 api 声明同时是接口契约、参数校验规则与文档来源。
	//
	// 这里刻意**不加 CORS**：前端走的是「同源 + 反代」——
	// 开发期 vite proxy 把 /api 转到本进程，生产期 nginx 做同一件事（见 web/nginx.conf）。
	// 同源就不需要 CORS，也就不存在「预检放行了但 Cookie 没带」这类半好不坏的状态。
	s.Group("/", func(group *ghttp.RouterGroup) {
		// ⚠️ 这行不能少，而且它不报错、只表现为「静默空响应」：
		// 没有它，handler 返回的 Res 会被直接丢掉 —— 客户端拿到的是
		// HTTP 200 + Content-Length: 0，连参数校验失败也只剩日志里一行
		// Validation Failed。排查时像是「后端没返回数据」，实际是少了中间件。
		//
		// 它同时定义了响应信封 {code, message, data} —— 前端
		// web/src/api/client.ts 拆的就是这个格式。
		group.Middleware(ghttp.MiddlewareHandlerResponse)

		group.Bind(
			hello.NewV1(),
			user.NewV1(),
		)
	})

	g.Log().Infof(ctx, "%s v%s 监听 %s", consts.AppName, consts.Version, addr)
	s.Run()
	return nil
}
