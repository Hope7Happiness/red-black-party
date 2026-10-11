# 红黑牌

手机浏览器多人聚会游戏，部署在 Cloudflare Workers，房间数据存于 D1。无需账号，每人输入昵称并通过房间链接或 6 位房间码加入。

## 玩法

1. 2–24 人加入，房主开始一轮。问题由玩家在线下提出。
2. 每人获得红黑两个选项，做过交红牌，没做过交黑牌，全员交牌前可修改，全员交牌后锁定。
3. 全员交牌后，各自猜红牌总数（0 到人数）；全员提交前可修改自己的数字，全员提交后锁定并统一公布结果。
4. 每位猜中者可选择另一位玩家，翻牌者看到该玩家本轮提交的牌，被翻牌者知道是谁查看了自己；第三方看不到这条记录。每位猜中者一次，不同猜中者可选择同一人。
5. 翻牌完成后，房主开始下一轮。房主也可确认返回大厅以结束当前回合、增减玩家。

刷新页面会恢复当前浏览器的玩家身份。房间创建 24 小时后过期。昵称在房间内唯一。

## 开发

需要 Node.js 22.13+ 和 npm。首次安装 `npm run install:ci`。`npm run dev` 启动本地预览。数据库结构在 `db/schema.ts`，变更后执行 `npm run db:generate`。

构建：`npm run build`。本地数据库迁移（构建后）：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_*.sql
```

请以实际生成的迁移文件替换上面的文件名；每个迁移只应用一次。`npm start` 预览生产 Worker。

核心逻辑验证：`node --experimental-transform-types --test tests/game.test.mjs`。
联机验证：`node tests/integration.mjs http://127.0.0.1:8787`。

前端 API 类型见 `lib/game-types.ts`。`lib/game.ts` 实现规则；`lib/game-api.ts` 处理 D1 存取，通过版本条件更新防止同时操作覆盖彼此。

通过 Sites 的源代码同步、构建归档和发布流程部署。站点标识和 D1 绑定位于 `.openai/hosting.json`；不需要自行创建数据库或保存 Cloudflare 密钥。
