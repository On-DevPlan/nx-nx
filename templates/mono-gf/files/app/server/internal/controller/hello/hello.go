// controller 只做三件事：接参数（框架已校验过）、调逻辑、拼响应。
// 业务判断、SQL、事务都不该出现在这一层。
//
// GoFrame 官方骨架习惯把 ControllerV1 / NewV1 / 各方法拆到三个文件
// （xxx.go / xxx_new.go / xxx_v1_<action>.go）。本模板合成一个文件，
// 方法多了再按官方方式拆开即可——拆分是手段，不是规矩。
package hello

import (
	"context"

	"github.com/gogf/gf/v2/os/gtime"

	v1 "{{goModule}}/app/server/api/hello/v1"
	"{{goModule}}/app/server/internal/consts"
)

// ControllerV1 v1 版本控制器。
type ControllerV1 struct{}

// NewV1 构造。返回值为空接口之外的具名类型是为了让 group.Bind 能反射出方法集。
func NewV1() *ControllerV1 {
	return &ControllerV1{}
}

// Ping 实现 v1.PingReq。
//
// 注意方法名必须是 Ping（与 PingReq/PingRes 的前缀一致）——框架据此把
// 请求路由到方法上，写错不会编译报错，只会在运行期变成 404。
func (c *ControllerV1) Ping(ctx context.Context, req *v1.PingReq) (res *v1.PingRes, err error) {
	return &v1.PingRes{
		Service: consts.AppName,
		Version: consts.Version,
		Time:    gtime.Now().String(),
	}, nil
}
