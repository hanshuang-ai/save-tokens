<template>
  <view class="AmountInformation">
    <!-- 步骤指示 -->
    <view class="top">
      <view class="icon_container">
        <view :class="!isStep1 ? 'ash' : ''"> 加油信息 </view>
        <view
          class="stepsProgress"
          :class="isStep1 ? 'isStep1' : 'notStep1'"
        />
        <view :class="isStep1 ? 'ash' : ''"> 金额信息 </view>
      </view>
    </view>

    <!-- 金额选择或输入 -->
    <view class="priceInputContainer">
      <view class="priceInput" @tap="$emit('openInputMask', 'price')">
        <view> ¥</view>
        <view
          class="inputTotalPriceValue_"
          :class="inputTotalPriceValue ? '' : 'NOVALUE'"
        >
          {{ inputTotalPriceValue ? inputTotalPriceValue : "输入金额" }}
        </view>
      </view>
      <view class="priceInputNormal priceInputNormal1" @tap="$emit('setOilPrice', 200)">
        <view>¥ 200</view>
        <view class="saveMoney"> 省 ¥ {{ detailData.liangbaiDiscount }} </view>
      </view>
      <view class="priceInputNormal" @tap="$emit('setOilPrice', 300)">
        <view>¥ 300</view>
        <view class="saveMoney"> 省 ¥ {{ detailData.sanbaiDiscount }} </view>
      </view>
    </view>

    <!-- 优惠券 -->
    <view v-if="isTuanYou" class="couponList" style="display: none">
      <view
        v-if="couponList.length > 0 && isTuanYou && inputTotalPriceValue == 0"
        class="alreadyDiscounted"
      >
        你有{{ couponList.length }}张优惠券
      </view>
      <view
        v-if="couponList.length > 0 && inputTotalPriceValue && isTuanYou && couponMoney > 0"
        class="alreadyDiscounted alreadyDiscounted1"
      >
        已优惠{{ couponMoney }}元
      </view>
      <view
        v-if="isTuanYou && (couponMoney <= 0 || couponList.length == 0) && payAmount > 0"
        class="alreadyDiscounted"
      >
        暂无可用优惠券
      </view>
      <view class="reselect" @tap="$emit('reselectCoupon')">
        {{
          isTuanYou && (couponMoney <= 0 || couponList.length == 0) && payAmount > 0
            ? ""
            : couponList.length > 0 && isTuanYou && inputTotalPriceValue == 0
            ? "去选择"
            : "重新选择"
        }}
        <image class="icon-select-type" :src="rightIcon" />
      </view>
    </view>

    <!-- 支付方式 -->
    <view class="paymentMethod">
      <view class="paystyleWrap" :class="[alipayNoSecret ? '' : 'paystyleWrap1']">
        <view
          class="paystyle"
          :class="[payWay == 1 ? 'wecahrtActive' : '', alipayNoSecret ? '' : 'payWay1']"
          @tap.stop="$emit('selectPayWay', 1)"
        >
          <image class="select-icon" :src="payWay == 1 ? wechatNoselected : wechatSelected" />
          <image :src="wxICON" class="payICON" />
          <view class="wexin-text"> 微信支付 </view>
        </view>
        <view
          class="paystyle"
          :class="[payWay == 2 ? 'zhifubaoActive' : '', alipayNoSecret ? '' : 'payWay1']"
          @tap.stop="$emit('selectPayWay', 2)"
        >
          <image class="select-icon" :src="payWay == 2 ? zhifubaoNoselected : zhifubaoSelected" />
          <image :src="zfbICON" class="payICON" />
          <view class="zhifubao-text"> 支付宝支付 </view>
        </view>
      </view>

      <view v-if="alipayNoSecret" class="mianmizhifu" @tap="$emit('clickMianmizhifu')">
        <image class="mianmizhifu-image" :src="tradeType == 'MM' ? selected : select" />
        <view class="mianmizhifu-text">
          {{ alipayIsOpen ? "使用支付宝免密支付" : "开通支付宝免密支付" }}
        </view>
      </view>
    </view>

    <!-- 其他 -->
    <view class="other" :class="inputTotalPriceValue ? 'finalPrice' : ''">
      <view class="btn btn1" @tap.stop="$emit('prevStep')"> 上一步 </view>
      <view class="btn" @tap="$emit('confirmOrder')"> 提交订单 </view>
      <view v-if="inputTotalPriceValue" class="finalPrice_text">
        <view class="inputTotalPriceFinal">
          <view class="totalPriceText"> 总金额 </view>
          <view class="totalPrice"> ￥{{ payAmount }} </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: "AmountInfoStep",
  props: {
    isStep1: { type: Boolean, default: true },
    inputTotalPriceValue: { default: null },
    detailData: { type: Object, default: () => ({}) },
    isTuanYou: { type: Boolean, default: false },
    couponList: { type: Array, default: () => [] },
    couponMoney: { type: Number, default: 0 },
    payAmount: { type: Number, default: 0 },
    payWay: { type: [String, Number], default: "1" },
    tradeType: { type: String, default: "SM" },
    alipayNoSecret: { type: Number, default: 0 },
    alipayIsOpen: { type: Number, default: 0 },
    wechatNoselected: { type: String, default: "" },
    wechatSelected: { type: String, default: "" },
    zhifubaoNoselected: { type: String, default: "" },
    zhifubaoSelected: { type: String, default: "" },
    selected: { type: String, default: "" },
    select: { type: String, default: "" },
    wxICON: { type: String, default: "" },
    zfbICON: { type: String, default: "" },
    rightIcon: { type: String, default: "" },
  },
  emits: [
    "openInputMask",
    "setOilPrice",
    "reselectCoupon",
    "selectPayWay",
    "clickMianmizhifu",
    "prevStep",
    "confirmOrder",
  ],
};
</script>