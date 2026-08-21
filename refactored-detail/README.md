# detail.vue 重构文档

## 概述

原 `pages/detail/detail.vue` 是项目中最大的单文件组件（2160行），职责过多，难以维护。本次重构将其拆分为 5 个子组件和 5 个 composables，保持功能不变。

## 文件结构

```
refactored-detail/
├── detail.vue                          # 主组件（页面入口，~400行）
├── components/
│   ├── StationCard.vue                 # 油站信息卡片
│   ├── RefuelInfoStep.vue              # 加油信息步骤（步骤1）
│   ├── AmountInfoStep.vue              # 金额信息步骤（步骤2）
│   ├── OilGunSelector.vue              # 油号油枪选择弹窗
│   └── PartnerSelector.vue             # 服务商选择弹窗
├── composables/
│   ├── utils.js                        # 公共工具（条件导入 commonUtils）
│   ├── useStationData.js               # 油站数据获取与收藏
│   ├── usePartnerSelection.js          # 服务商列表与选择逻辑
│   ├── usePriceCalculation.js          # 价格计算与优惠
│   ├── usePayment.js                   # 支付方式与订单提交
│   └── useKeyboardInput.js             # 键盘输入逻辑
└── README.md
```

## 子组件说明

| 组件 | 职责 | Props数 | Events数 |
|------|------|---------|----------|
| StationCard | 油站卡片展示（名称/价格/地址/导航/收藏） | 6 | 2 |
| RefuelInfoStep | 加油信息步骤（服务商/油枪选择 + 步骤指示器） | 5 | 3 |
| AmountInfoStep | 金额信息步骤（金额输入/快捷金额/优惠券/支付/提交） | 18 | 7 |
| OilGunSelector | 油号油枪选择弹窗 | 5 | 3 |
| PartnerSelector | 服务商选择弹窗（最优价 + 服务商列表） | 4 | 3 |

## Composable 说明

| Composable | 管理状态 | 核心方法 |
|------------|---------|---------|
| useStationData | detailData, changeDetailData, stationId | getStationDetail, handleDetailInfo, storeStation |
| usePartnerSelection | partnerLists, zuiyoujia, oilOptions, gunsList | getPartnerOilList, handlePartnerInfo, selectZuiyoujia, selectPartner |
| usePriceCalculation | totalPrice, inputTotalPriceValue, payAmount | setPreferential, setOilPrice, confirmInputValue |
| usePayment | payWay, tradeType, couponList, couponId | selectPayWay, clickMianmizhifu, buildOrderData, submitOrder, selectCoupon |
| useKeyboardInput | keyInputValue, isInputMask, inputTextClose | openInputMask, setInputValue, deleteInputValue, clearInputValue, closeInputMask |

## 架构设计

```
detail.vue (页面入口)
├── setup() 初始化所有 composables
├── 生命周期: onLoad → init() → getStationDetail() + getPartnerOilList()
├── 模板渲染:
│   ├── StationCard ← stationData (props)
│   ├── RefuelInfoStep ← partnerData (props) → emit 事件 → detail.vue methods
│   ├── AmountInfoStep ← priceData + paymentData (props) → emit 事件 → detail.vue methods
│   ├── OilGunSelector ← partnerData (props) → emit 事件 → detail.vue methods
│   └── PartnerSelector ← partnerData (props) → emit 事件 → detail.vue methods
└── methods 委托给 composable 方法处理业务逻辑
```

## 数据流

- **向下**: detail.vue 通过 props 将 composable state 传递给子组件
- **向上**: 子组件通过 $emit 事件通知 detail.vue，detail.vue 调用 composable 方法更新状态
- **状态管理**: 所有状态由 composables 持有，通过 setup() 返回并绑定到组件实例

## 使用方式

1. 将 `refactored-detail/` 目录放置到项目 `src/pages/` 下
2. 确保 `@libs/*` 路径别名在项目中正确配置
3. 样式文件 `detail.less` 和 `detail_light.less` 保持原路径不变
4. 子组件中的 `WT-UI` 路径需根据实际项目结构调整

## 对比

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| 总文件数 | 1 | 12 |
| 单文件最大行数 | 2160 | ~400 (detail.vue) |
| 组件数 | 1 | 6 (1主 + 5子) |
| 可测试性 | 低（全部耦合） | 高（composables 独立可测） |
| 职责分离 | 无 | 清晰（展示/逻辑/数据分离） |