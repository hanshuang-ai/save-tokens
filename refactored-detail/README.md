# detail.vue 重构说明

原 `src/pages/detail/detail.vue` 是项目最大的单文件组件（约 2159 行 / 87KB），职责混杂：数据请求、服务商/油号油枪选择、价格计算、支付下单、金额键盘、多个蒙层渲染全部堆在一个文件里。

本目录提供了保持**功能不变**的重构版本，将原文件拆分为 5 个展示子组件 + 4 个业务 composable + 1 个精简父组件。

## 目录结构

```
refactored-detail/
├── detail.vue                      # 父组件：编排 + 页面级 UI 状态 + 生命周期
├── components/
│   ├── StationCard.vue             # 油站卡片（收藏 / 导航 / 收起展开）
│   ├── OrderPanel.vue              # 加油流程操作区（加油信息 → 金额信息 → 支付）
│   ├── OilGunMask.vue              # 油号 / 油枪选择蒙版
│   ├── AmountKeyboard.vue          # 金额键盘输入蒙版
│   └── PartnerMask.vue             # 服务商选择蒙版
├── composables/
│   ├── lib.js                      # 条件依赖注入（dsBridge 场景下 commonUtils / checkAndLogin）
│   ├── useStationDetail.js         # 油站详情数据 + 收藏 + 导航
│   ├── usePartnerOil.js            # 服务商 / 油号 / 油枪数据与选择
│   ├── usePriceCalculator.js       # 价格计算 + 金额输入 + 优惠券
│   └── useOrder.js                 # 支付方式 + 订单提交 + 步骤切换
└── README.md
```

## 拆分思路

### 1. 展示子组件（dumb component）

每个子组件只负责渲染与事件上抛，不直接改业务状态：

| 子组件 | 职责 | 输入（props） | 输出（events） |
| --- | --- | --- | --- |
| StationCard | 油站信息卡片 | detailData / changeDetailData / logo / themeStyle… | navigate / collect |
| OrderPanel | 加油与金额两步流程 + 支付方式 | 步骤、金额、支付、优惠券等展示字段 | open-partner-mask / open-oil-mask / set-oil-price / confirm-order… |
| OilGunMask | 油号油枪选择 | oilOptions / gunsList / currentOilType | choose-oil / choose-gun / close |
| AmountKeyboard | 金额键盘 | keyInputValue / keyboardValue / verticalBig | set-input / delete / confirm / close |
| PartnerMask | 服务商列表与最优价 | zuiyoujia / partnerLists / selectPartnerIndex | select-zuiyoujia / select-partner / close |

父组件 `detail.vue` 通过 props 下传数据、通过事件把用户操作转发给 composable 中的方法。

### 2. 业务 composable

本项目是 **Vue2 选项式 API**（Taro + Vue2），没有 `setup()`。因此 composable 以「mixin 工厂」形式组织：

```js
export default function useXxx() {
  return { data() { return { ... }; }, methods: { ... } };
}
```

父组件通过 `mixins: [useStationDetail(), usePartnerOil(), usePriceCalculator(), useOrder()]` 注册。Vue 会把各 mixin 的 `data` / `methods` 与组件合并到同一个 `this` 上，所以各 composable 之间、以及 composable 与父组件之间可以互相调用（例如 `useOrder.orderSubmit` 读取 `usePartnerOil` 声明的 `oilGunText`、`zuiyoujia` 等）。

> 若后续升级到 Vue3 / 组合式 API，这些 mixin 工厂可直接改写为 `setup()` 中的真正 composable，方法体无需变化。

### 3. 状态归属约定

- **页面级 UI 状态**（`zindexStatus`、`scrollTop`、`networkDisconnected_`、`timeOut`、`horizontalBig`、`verticalBig`、`THEME`、`keyboardValue`、布局图片等）放在父组件 `data` 中。
- **业务数据**按领域拆分到各 composable 的 `data` 中（如油站详情归 `useStationDetail`，服务商/油号油枪归 `usePartnerOil`，价格/优惠券归 `usePriceCalculator`，支付/订单归 `useOrder`）。
- 跨领域的共享状态通过 `this` 访问，不重复声明，避免 key 冲突。

## 回填方式

将本目录内容放回原项目 `src/pages/detail/` 下（即 `detail.vue`、`components/`、`composables/` 三部分与 `detail.less`、`detail_light.less` 同级），再通过 Taro 正常编译即可。

需要注意的路径：

- `composables/*.js` 内部继续使用原项目别名 `@libs/...`。
- `components/*.vue` 的静态图片使用 `@static/...` 别名。
- `OilGunMask.vue` 引用 `wt-list-scroll-column` 的路径比原文件深一层，故使用 `../../../../WT-UI/...`（原 `detail.vue` 为 `../../../WT-UI/...`）。

## 保持功能不变的说明

- 所有方法体、埋点（`wt.report`）、控制台日志、字段名、zindex 层级值（0/1/2/3/4/5）均原样保留。
- 保留原代码中的历史遗留项，未做「顺手修复」，包括：
  - 优惠券相关逻辑（`AutomaticallySelectCoupons` 被注释、`couponList` 样式 `display:none`）——原样保留。
  - `getStationDetail` 使用 `base.apiInfo.appId2`、`getPartnerOilList` 使用 `base.appInfo.appId2` 的不一致写法——原样保留。
  - `confirmOrder` 中 `if (this.bannerCode)`（未取 `options.bannerCode`）——原样保留。
- 唯一一处有意的微调：`init()` 中 `console.log("initoptions", options)` 原代码在 `let options` 声明前引用（依赖 Babel 降级为 `var` 时打印 `undefined`），改为 `console.log("initoptions", this.options)`，仅影响日志内容，不影响运行逻辑。

## 未包含的内容

- `detail.less` / `detail_light.less` 样式文件未拆分（体积大且非本任务重点），请沿用原文件；子组件使用的类名均为这些全局样式。
