# 智慧加油小程序 - 数据模型

> 基于 API 接口和代码逆向分析推导 | 生成日期: 2026-08-20

---

## 1. API 接口定义

### 1.1 接口基础信息

| 项目 | 值 |
|------|-----|
| 生产环境 | https://api.auto-pai.com |
| 测试环境 | https://api.auto-pai.cn |
| 业务 AppID | iyvt7pn3u8php1sz |
| 签名方式 | MD5 签名 |
| 通用参数 | appid, sign, token, data |

### 1.2 接口清单

#### 订单相关

| 接口名称 | 路径 | 方法 | 描述 |
|----------|------|------|------|
| refuel | /pay/front/order/refuel | POST | 车主邦加油下订单 |
| createOrder | /pay/front/refuel/createOrder | POST | 加油聚合下单 |
| orderStatus | /pay/front/refuel/orderStatus | POST | 查询订单状态 |
| orderDetail | /pay/front/refuel/orderDetail | POST | 查询订单详情 |
| orderList | /pay/front/refuel/orderList | POST | 查询订单列表 |
| cancelOrder | /pay/front/refuel/cancelOrder | POST | 取消订单 |
| refund | /pay/front/refuel/refund | POST | 申请退款 |
| paySubmit | /pay/front/refuel/paySubmit | POST | 提交支付 |

#### 油站相关

| 接口名称 | 路径 | 方法 | 描述 |
|----------|------|------|------|
| getGasInfoListOilNo | /pay/front/refuel/getGasInfoListOilNo | POST | 获取加油站列表（含油号） |
| getStationDetail | /pay/front/refuel/getStationDetail | POST | 获取油站详情 |
| getStationType | /pay/front/refuel/getStationType | POST | 获取油站品牌类型 |
| getOilNoList | /pay/front/refuel/getOilNoList | POST | 获取油号列表 |

#### 服务商相关

| 接口名称 | 路径 | 方法 | 描述 |
|----------|------|------|------|
| getPartnerList | /pay/front/refuel/getPartnerList | POST | 获取服务商列表 |
| getPartnerDetail | /pay/front/refuel/getPartnerDetail | POST | 获取服务商详情 |

#### 用户相关

| 接口名称 | 路径 | 方法 | 描述 |
|----------|------|------|------|
| getMemberInfo | /pay/front/refuel/getMemberInfo | POST | 获取会员信息 |
| getUserCoupon | /pay/front/refuel/getUserCoupon | POST | 获取用户优惠券 |
| getCollectionList | /pay/front/refuel/getCollectionList | POST | 获取收藏列表 |
| addCollection | /pay/front/refuel/addCollection | POST | 添加收藏 |
| cancelCollection | /pay/front/refuel/cancelCollection | POST | 取消收藏 |
| preferenceSet | /pay/front/refuel/preferenceSet | POST | 保存偏好设置 |
| preferenceGet | /pay/front/refuel/preferenceGet | POST | 获取偏好设置 |
| secretPartner | /pay/front/refuel/secretPartner | POST | 免密支付签约/查询 |
| agreementQuery | /pay/front/refuel/agreementQuery | POST | 查询用户协议 |

#### 返现相关

| 接口名称 | 路径 | 方法 | 描述 |
|----------|------|------|------|
| cashbackActivity | /pay/front/refuel/cashbackActivity | POST | 获取返现活动信息 |
| cashbackAccount | /pay/front/refuel/cashbackAccount | POST | 绑定返现账户 |
| cashbackRecord | /pay/front/refuel/cashbackRecord | POST | 获取返现记录 |

#### Banner/运营位

| 接口名称 | 路径 | 方法 | 描述 |
|----------|------|------|------|
| bannerList | /pay/front/refuel/bannerList | POST | 获取运营位 Banner 列表 |
| bannerDetail | /pay/front/refuel/bannerDetail | POST | 获取 Banner 详情 |

#### 登录相关

| 接口名称 | 路径 | 方法 | 描述 |
|----------|------|------|------|
| login | /pay/front/refuel/login | POST | 微信登录 |
| sendSms | /pay/front/refuel/sendSms | POST | 发送短信验证码 |
| bindPhone | /pay/front/refuel/bindPhone | POST | 绑定手机号 |

---

## 2. 核心数据实体

### 2.1 用户信息（UserInfo）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| userId | String | 是 | 用户唯一标识 |
| wtId | String | 是 | 梧桐加密用户 ID |
| openId | String | 是 | 微信 OpenID |
| token | String | 是 | 登录凭证 |
| nickName | String | 否 | 用户昵称 |
| avatarUrl | String | 否 | 用户头像 URL |
| phone | String | 是 | 手机号 |
| dataKey | String | 否 | 数据加密密钥 |
| signature | String | 否 | 签名 |
| oemId | String | 否 | OEM 标识 |

### 2.2 加油站（GasStation）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| stationId | String | 是 | 油站唯一标识 |
| name | String | 是 | 油站名称 |
| logo | String | 否 | 油站品牌 Logo URL |
| address | String | 是 | 油站地址 |
| latitude | Number | 是 | 纬度（GCJ-02） |
| longitude | Number | 是 | 经度（GCJ-02） |
| dist | String | 否 | 距离（格式化字符串，如 "1.2km"） |
| price | Number | 是 | 优惠后价格（元/升） |
| priceGun | Number | 是 | 国标价/枪价（元/升） |
| discountPrice | Number | 否 | 加 200 元约省金额 |
| oilNo | String | 是 | 默认油号 |
| oilName | String | 否 | 油号名称 |
| stationType | Integer | 是 | 品牌类型：0=所有, 2=品牌优选, 3=壳牌, 4=其他 |
| lowestPrice | Boolean | 否 | 是否价格最优 |
| oftenStation | Boolean | 否 | 是否最近常去 |
| phone | String | 否 | 联系电话 |
| businessTime | String | 否 | 营业时间 |
| isCollection | Boolean | 否 | 是否已收藏 |

### 2.3 服务商（Partner）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| partnerId | String | 是 | 服务商 ID |
| partnerName | String | 是 | 服务商名称 |
| partnerLogo | String | 否 | 服务商 Logo |
| discount | Number | 否 | 优惠金额/折扣 |
| discountDesc | String | 否 | 优惠描述 |
| isAvailable | Boolean | 否 | 是否可用 |
| payWay | String | 否 | 支付方式 |
| supportOilNo | Array | 否 | 支持的油号列表 |

### 2.4 订单（Order）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| orderId | String | 是 | 订单编号 |
| stationId | String | 是 | 油站 ID |
| stationName | String | 是 | 油站名称 |
| stationLogo | String | 否 | 油站 Logo |
| stationAddress | String | 否 | 油站地址 |
| oilNo | String | 是 | 油号 |
| oilName | String | 否 | 油号名称 |
| gunNo | String | 是 | 油枪编号 |
| partnerId | String | 是 | 服务商 ID |
| partnerName | String | 否 | 服务商名称 |
| totalPrice | Number | 是 | 订单总金额（元） |
| discountAmount | Number | 否 | 优惠金额（元） |
| actualMoney | Number | 是 | 实际支付金额（元） |
| couponId | String | 否 | 使用的优惠券 ID |
| couponAmount | Number | 否 | 优惠券抵扣金额 |
| payWay | String | 是 | 支付方式：WECHAT/ALIPAY |
| payWayName | String | 否 | 支付方式名称 |
| orderStatus | Integer | 是 | 订单状态 |
| orderStatusName | String | 否 | 订单状态名称 |
| createTime | String | 是 | 创建时间 |
| payTime | String | 否 | 支付时间 |
| isInvoice | Boolean | 否 | 是否可开票 |
| invoiceFlag | Integer | 否 | 开票标识：0=油站开票, 1=能链开票 |
| alipayNoSecret | Boolean | 否 | 支付宝是否免密 |
| wechatNoSecret | Boolean | 否 | 微信是否免密 |
| tradeType | String | 否 | 交易类型：SM/MM |
| isCollection | Boolean | 否 | 是否收藏 |
| gps | Object | 是 | 下单时的 GPS 坐标 |

### 2.5 订单状态枚举

| 状态码 | 状态名称 | 描述 |
|--------|----------|------|
| 0 | 待支付 | 订单已创建，等待支付 |
| 1 | 支付成功 | 支付完成 |
| 2 | 已取消 | 订单已取消 |
| 3 | 已退款 | 订单已退款 |
| 4 | 支付失败 | 支付处理失败 |
| 12 | 退款失败 | 退款处理失败 |

### 2.6 优惠券（Coupon）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| couponId | String | 是 | 优惠券 ID |
| couponName | String | 是 | 优惠券名称 |
| couponType | Integer | 是 | 优惠券类型 |
| amount | Number | 是 | 优惠金额/折扣 |
| minAmount | Number | 否 | 最低使用金额门槛 |
| startTime | String | 是 | 有效期开始 |
| endTime | String | 是 | 有效期结束 |
| status | Integer | 是 | 状态：1=未使用, 2=已使用, 3=已过期 |
| stationLimit | Array | 否 | 适用油站限制 |
| oilNoLimit | Array | 否 | 适用油号限制 |

### 2.7 收藏（Collection）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| collectionId | String | 是 | 收藏 ID |
| stationId | String | 是 | 油站 ID |
| stationName | String | 是 | 油站名称 |
| stationLogo | String | 否 | 油站 Logo |
| stationAddress | String | 否 | 油站地址 |
| price | Number | 否 | 当前价格 |
| createTime | String | 是 | 收藏时间 |

### 2.8 偏好设置（Preference）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| defaultOilNo | String | 是 | 默认油号 |
| defaultSort | String | 是 | 默认排序：distance/price |
| defaultStationType | String | 否 | 默认品牌类型 |

### 2.9 返现账户（CashbackAccount）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| accountId | String | 是 | 账户 ID |
| accountType | String | 是 | 账户类型：WECHAT/ALIPAY |
| accountName | String | 否 | 账户名称 |
| isBind | Boolean | 是 | 是否已绑定 |
| bindTime | String | 否 | 绑定时间 |

### 2.10 返现记录（CashbackRecord）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| recordId | String | 是 | 记录 ID |
| orderId | String | 是 | 关联订单 ID |
| amount | Number | 是 | 返现金额 |
| status | Integer | 是 | 状态：0=待发放, 1=已发放, 2=发放失败 |
| createTime | String | 是 | 创建时间 |
| arriveTime | String | 否 | 到账时间 |

### 2.11 Banner/运营位（Banner）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| bannerId | String | 是 | Banner ID |
| bannerUrl | String | 是 | Banner 图片 URL |
| type | Integer | 是 | 类型：0=推荐规则, 1=加油返现, 2=视频详情, 3=图片详情, 5=优惠券 |
| code | String | 否 | 关联活动编码 |
| name | String | 否 | 活动名称 |
| priority | Integer | 否 | 优先级 |
| appletId | String | 否 | 跳转小程序 ID |
| openType | String | 否 | 打开方式 |
| pushNumber | Integer | 否 | 推送编号 |
| ruleData | Object | 否 | 推荐规则数据（type=0 时） |

### 2.12 系统信息（SystemInfo）

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| channelId | String | 是 | 渠道 ID |
| deviceType | String | 是 | 设备类型 |
| vin | String | 是 | 车辆 VIN 码 |
| wcenter_version | String | 否 | 服务中心版本号 |
| env | String | 否 | 环境标识 |

---

## 3. API 请求/响应通用格式

### 3.1 请求格式

```json
{
  "appid": "iyvt7pn3u8php1sz",
  "sign": "MD5签名",
  "token": "用户登录凭证",
  "data": {
    // 业务参数
  }
}
```

### 3.2 响应格式

```json
{
  "code": "0000",
  "msg": "success",
  "data": {
    // 业务数据
  }
}
```

### 3.3 分页请求格式

```json
{
  "page": {
    "pageNo": 1,
    "pageSize": 10
  }
}
```

### 3.4 分页响应格式

```json
{
  "code": "0000",
  "data": {
    "list": [],
    "total": 100,
    "pageNo": 1,
    "pageSize": 10
  }
}
```

---

## 4. 实体关系图

```
User (用户)
  ├── 1:N → Order (订单)
  ├── 1:N → Collection (收藏)
  ├── 1:N → Coupon (优惠券)
  ├── 1:1 → Preference (偏好设置)
  ├── 1:N → CashbackAccount (返现账户)
  └── 1:N → CashbackRecord (返现记录)

GasStation (加油站)
  ├── 1:N → Order (订单)
  ├── 1:N → Collection (收藏)
  └── 1:N → Partner (服务商)

Partner (服务商)
  └── 1:N → Order (订单)

Banner (运营位)
  └── 1:1 → RuleData (推荐规则数据)
```

---

## 5. 本地存储 Key 说明

| Key | 类型 | 描述 |
|-----|------|------|
| isAgreeAgreement | Boolean | 用户是否同意服务协议 |
| preferenceNewSet | Boolean | 是否已设置偏好 |
| token | String | 用户登录 Token |
| userInfo | Object | 用户信息缓存 |
| loginInfo | Object | 登录信息 |