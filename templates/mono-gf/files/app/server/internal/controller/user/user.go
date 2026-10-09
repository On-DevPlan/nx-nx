// user 控制器：把逻辑层的实体映射成接口契约里的 DTO。
//
// 为什么不直接把 entity 返回给前端：entity 跟着表走，表加一列前端就多收一个字段；
// DTO 跟着契约走，加列不会泄漏出去。这条边界在多表关联时价值最大。
package user

import (
	"context"

	v1 "{{goModule}}/app/server/api/user/v1"
	userLogic "{{goModule}}/app/server/internal/logic/user"
)

// ControllerV1 v1 版本控制器。
type ControllerV1 struct{}

// NewV1 构造。
func NewV1() *ControllerV1 {
	return &ControllerV1{}
}

// List 实现 v1.ListReq。
func (c *ControllerV1) List(ctx context.Context, req *v1.ListReq) (res *v1.ListRes, err error) {
	total, users, err := userLogic.List(ctx, req.Page, req.Size)
	if err != nil {
		return nil, err
	}

	list := make([]v1.UserItem, 0, len(users))
	for _, u := range users {
		item := v1.UserItem{Id: u.Id, Name: u.Name, Email: u.Email}
		if u.CreatedAt != nil {
			// 统一在服务端格式化成字符串：前端拿到 Date 对象再各自格式化，
			// 会因为时区与本地化在处理时间/日期边界时出现偏差。
			item.CreatedAt = u.CreatedAt.Format("2006-01-02 15:04:05")
		}
		list = append(list, item)
	}
	return &v1.ListRes{Total: total, List: list}, nil
}

// Create 实现 v1.CreateReq。
func (c *ControllerV1) Create(ctx context.Context, req *v1.CreateReq) (res *v1.CreateRes, err error) {
	id, err := userLogic.Create(ctx, req.Name, req.Email)
	if err != nil {
		return nil, err
	}
	return &v1.CreateRes{Id: id}, nil
}
