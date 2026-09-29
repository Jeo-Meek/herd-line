# 赶羊线 / Herd Line

Phaser 4 的 H5 原型：手指一划就是篱笆，把羊群导进羊圈，狼来了就画墙。

在线试玩（GitHub Pages）：https://jeo-meek.github.io/herd-line/

## 本地运行

需要 Node 20+。

```bash
npm install
npm test
npm run dev
```

开发服务器会打开 `http://localhost:5173/herd-line/`（`base` 固定为 `/herd-line/`，和 Pages 子路径一致）。

手机真机调试：同一 Wi-Fi 下访问机器的局域网地址 + `/herd-line/`。

## 构建

```bash
npm run build
npm run preview
```

产物在 `dist/`。`preview` 同样挂在 `/herd-line/` 下。

## 部署

仓库已启用 GitHub Pages，构建类型为 **GitHub Actions**。

- 工作流：`.github/workflows/pages.yml`
- 触发：推送到 `main`，或手动 `workflow_dispatch`
- 步骤：`npm ci` → `npm test` → `npm run build` → `actions/configure-pages` → `actions/upload-pages-artifact`（`dist`）→ `actions/deploy-pages`
- Vite `base` 为 `/herd-line/`，对应项目站 `https://jeo-meek.github.io/herd-line/`

## MVP 范围（对照 GDD §9）

已做：

- 1 张开阔草原图、1 种羊、1 种狼（占位几何贴图，无外部资源下载）
- 画线：触屏 / 鼠标采样、触屏 EMA 平滑、RDP 简化、最短 40 u 作废退墨、单笔上限、墨水耗尽收笔、同时最多 3 条篱笆
- 篱笆寿命、最后 1.5 s 闪烁、碎裂粒子；碰撞保留到消失前
- 羊群 boids（分离 / 对齐 / 聚合 / 漂移 / 惊吓传染）+ 线段软斥力 + **夹紧到线段的硬约束**（不用物理引擎）
- 狼状态机：预警 / 巡逻 / 接近 / 蓄力 / 冲刺 / 叼走 / 被挡 / 撤退；叼羊撞墙会松口
- 进圈判定（位移线段 ∩ 门线）、L1–L3 及文档里的教学节拍、胜负与 1–3 星、重试 / 下一关
- `PlatformSDK` 空实现（只打日志，第一次输入才 `gameplayStart`，start/stop 去重）
- 固定 30 Hz 逻辑步、屏幕 **`Scale.RESIZE`**：960×720 可玩区在安全区内尽量放大（横屏铺满高度、竖屏铺满宽度），多出来的区域铺草地；HUD 按 CSS 像素贴边并避开 safe-area
- `visualViewport` 跟随地址栏显隐 / 旋转；第一次抬手尝试 Fullscreen（iOS Safari 不支持则忽略）
- 渲染：配置为 `Phaser.AUTO`（有 WebGL 就用 WebGL；本仓库的无 GPU 试玩环境会落到 Canvas）
- `localStorage` 包在 try/catch 里

未做 / 明确砍掉（GDD 第二阶段或后置，或任务说明允许跳过）：

- 调参 debug 面板（可用 `?debug=1` 给狼精灵打上状态名，没有滑杆）
- 道具、升级、羊毛币、地图选关、每日挑战
- 河 / 桥 / 暴雨 / 狼群冲锋 / 竖屏整关旋转
- 真实 Poki / CrazyGames SDK
- 完整音效包与 BGM（用 WebAudio 占位蜂鸣）

## 调参文件

GDD 里「未定（建议值 X）」一律用建议值。改手感先动这两个文件，不必翻场景代码。

| GDD 段落 | 内容 | 文件 |
|---|---|---|
| §0.2、§3.1、§3.2、§4.2–4.4、§2.4 墨水 / 寿命 | 世界尺寸、逻辑帧率、羊 boids、狼状态机、画线、墨水、篱笆 | `src/data/tuning.json` |
| §5.1 L1–L3 | 羊数、出生区、漂移、羊圈、墨水、寿命、时限、狼入场、星级、岩石、描红折线 | `src/data/levels.ts` |
| §2.1 星级公式 | `starsForRate` / `neededForOneStar` | `src/types.ts` |
| 点到**线段**距离（不是无限直线） | `nearestOnSegment` | `src/sim/geom.ts` |
| 横竖屏 / 安全区 / HUD 尺寸 | `computeLayout` | `src/layout.ts` |

关卡字段可以覆盖墨水与篱笆寿命；群体权重目前走全局 `tuning.json`。

L1–L3 的建议值：

- L1：20 羊，无狼，墨水 200 / 40，寿命 12 s，不计时（60 s 兜底），星 50/75/90%，不可失败
- L2：30 羊，12 s 与 50 s 从东侧入狼，墨水 150 / 25，寿命 8 s，75 s，星 50/70/90%
- L3：40 羊 + 零星岩石，20 s 东 / 50 s 北入狼，墨水 100 / 10，寿命 7 s，80 s，星 60/75/90%
