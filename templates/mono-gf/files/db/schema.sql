-- PostgreSQL 初始化脚本。
--
-- 放这里的意义：数据库结构是**可复现的**。新同学 clone 之后
-- `docker compose up -d pg` 就得到一个和所有人一致的空库，
-- 不需要「找谁要一份 dump」。
--
-- 表结构改动的正确姿势：写一个增量迁移文件（db/migrations/），不要改这里的历史语句。
-- 这个文件只负责「从零到当前」。

CREATE TABLE IF NOT EXISTS t_user (
    id         BIGSERIAL   PRIMARY KEY,
    name       VARCHAR(64) NOT NULL,
    email      VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 邮箱唯一：重复注册靠数据库拦，而不是靠先查再插（并发下必然漏）
CREATE UNIQUE INDEX IF NOT EXISTS uk_t_user_email ON t_user (email);

COMMENT ON TABLE  t_user            IS '演示用用户表';
COMMENT ON COLUMN t_user.name       IS '姓名';
COMMENT ON COLUMN t_user.email      IS '邮箱（唯一）';

-- 一条种子数据，让面板一打开就有东西可看（空列表页分不清「没数据」和「接口坏了」）
INSERT INTO t_user (name, email)
VALUES ('示例用户', 'demo@example.com')
ON CONFLICT (email) DO NOTHING;
