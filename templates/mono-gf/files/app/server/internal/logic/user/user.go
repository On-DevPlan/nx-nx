// 业务逻辑层。界面与传输层（controller）不碰 SQL，SQL 也不出现在 controller 里——
// 这条边界就是「换个前端不用动数据库代码」的保证。
//
// 分层说明：GoFrame 官方骨架里 controller → service（接口）→ logic（实现）。
// 本模板只到 logic 为止，是因为一个 CRUD 演示不值得先立接口。
// 等你出现第二个实现（本地/远程、缓存/直连）时，再补 internal/service 接口与注册即可。
package user

import (
	"context"

	"github.com/gogf/gf/v2/frame/g"

	// 空导入：确保「只编译本包」的单元测试也能拿到 pgsql 驱动。
	// 少这一行时症状是运行期报 cannot find database driver，而编译完全通过。
	_ "{{goModule}}/app/server/internal/db"
	"{{goModule}}/app/server/internal/model/entity"
)

// List 分页查询。返回 total 与当前页数据。
//
// 用 AllAndCount 一次拿齐总数与列表：分两次查在并发写入时会得出
// 「total 与 list 长度对不上」的结论，翻页体验会莫名其妙。
func List(ctx context.Context, page, size int) (int, []entity.User, error) {
	m := g.DB().Model("t_user").Ctx(ctx).Safe()
	list, total, err := m.Page(page, size).OrderDesc("id").AllAndCount(false)
	if err != nil {
		return 0, nil, err
	}
	var users []entity.User
	if err = list.Structs(&users); err != nil {
		return 0, nil, err
	}
	if users == nil {
		users = []entity.User{}
	}
	return total, users, nil
}

// Create 新建用户，返回主键。
//
// 唯一索引冲突（邮箱重复）不在这里吞掉——让错误带着数据库原文往上抛，
// 由调用方决定是 400 还是 409。吞掉再编一个「操作失败」是最难排查的做法。
func Create(ctx context.Context, name, email string) (int64, error) {
	r, err := g.DB().Model("t_user").Ctx(ctx).Data(g.Map{
		"name":  name,
		"email": email,
	}).InsertAndGetId()
	if err != nil {
		return 0, err
	}
	return r, nil
}
