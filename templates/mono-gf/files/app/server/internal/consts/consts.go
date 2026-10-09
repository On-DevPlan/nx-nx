// 全局常量。凡是「代码里要引用、配置里也要写」的值都放这里，
// 避免同一个字符串在两处各写一遍然后慢慢漂移。
package consts

const (
	// AppName 进程名与日志前缀
	AppName = "{{name}}"

	// ServerName GoFrame 多 server 的实例名。配置里对应顶层 `server:` 段
	ServerName = "server"

	// DefaultAddr 配置缺失时的回落地址（只在日志里能看出来用了它）
	DefaultAddr = ":{{apiPort}}"
)

// Version 必须是 var —— make build 用 -ldflags "-X ...=x.y.z" 覆盖它，
// const 覆盖不了（ldflags 只能改包级变量）。
var Version = "{{version}}"
