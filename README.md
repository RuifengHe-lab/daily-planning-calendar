# Daily Planning Calendar

一个固定日期为 **2026-07-29 至 2026-12-31** 的交互式日程日历。

## 功能

- 固定、不可修改的日期与星期栏
- 点击日期查看、添加和删除当日计划
- 每条计划可独立勾选
- 当日计划全部完成后自动盖章
- 本地自动保存
- 可安装为 PWA，首次联网访问后支持离线打开
- 可选的私有账户云同步：电脑和手机登录同一账户

## 本地运行

```bash
pnpm install
pnpm dev
```

生产构建：

```bash
pnpm build
```

## 配置跨设备同步

1. 创建一个 Supabase 项目。
2. 在 Supabase SQL Editor 中执行 [`supabase/schema.sql`](supabase/schema.sql)。
3. 在 Supabase Authentication 的 Users 页面手动创建唯一的登录用户。
4. 不要在网站中提供注册入口；应用只实现登录。
5. 将 `.env.example` 复制为 `.env.local`。
6. 填入项目 URL 与 anon key：

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

7. 重新构建并部署。

`anon` key 是浏览器客户端使用的公开项目标识，不是管理员密钥。数据表启用了 Row Level Security，只允许经过身份验证的用户读取和修改 `user_id = auth.uid()` 的记录。**不要在仓库、浏览器代码或部署日志中使用 `service_role` key。**

## 数据与离线说明

- 未配置云同步时，数据只保存在当前浏览器。
- 配置云同步后，未登录用户无法进入日历；退出登录会清除此设备的本地计划副本。
- 离线时可以继续查看和编辑；恢复联网后会再次同步。
- 第一次访问、安装以及跨设备同步仍然需要网络。
