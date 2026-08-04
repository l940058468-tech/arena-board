# 斗魂竞技场全英雄榜单

《英雄联盟》斗魂竞技场（Arena）模式的实时胜率 / 登场率榜单，并附带每个英雄的白银、黄金、棱彩海克斯增强胜率和选取率。

## 运行

```powershell
node scraper.js   # 抓取并生成 data/arena-stats.json
node server.js    # 启动本地服务
```

打开 `http://127.0.0.1:4173` 即可查看榜单。页面上有“刷新数据”按钮，点击后会重新抓取并更新缓存。

## 数据来源

数据抓取自 [LoLalytics](https://lolalytics.com/lol/tierlist/arena/)：

- 全英雄榜单来自 `lol/tierlist/arena/q-data.json`
- 每个英雄的海克斯增强统计来自 `lol/{champion}/arena/build/q-data.json`
- 增强稀有度（白银 / 黄金 / 棱彩）来自 LoLalytics 的增强元数据

抓取器会解析页面使用的 Qwik 序列化 JSON，聚合 5 个增强槽位的胜率与选取率，并缓存到 `data/arena-stats.json`。英雄榜为全量抓取，完整运行约需几分钟。

## 目录

```text
scraper.js          抓取与聚合脚本
server.js           本地静态服务与 API
public/             前端页面
data/               生成的数据缓存
```
