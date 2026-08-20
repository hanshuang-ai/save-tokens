<template>
  <!-- 右侧操作区 -->
  <view class="operationContainer">
    <!-- 加油信息 -->
    <view v-if="isStep1" class="operationMain">
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
      <!-- 选择操作区 -->
      <view>
        <!-- 服务商 -->
        <view
          class="oil-partner-options-container"
          @tap="$emit('open-partner-mask')"
        >
          <view class="oil-partner-text-description">
            <view class="text-select-partner-type avtive">
              {{ partnerName }}
            </view>
          </view>
          <!-- isInvoice==1 则支持电子发票，如果是0则不支持电子发票，不展示发票提示 -->
          <view class="support-invoice-icon">
            <view
              :class="isInvoice == 1 ? '' : 'avtive111'"
              class="is-support-invoice"
            >
              支持开电子发票
            </view>
            <view class="icon-select-type-container">
              <image
                class="icon-select-type"
                :src="themeStyle == 'dark' ? right : rightLight"
              />
            </view>
          </view>
        </view>
        <!-- 油号 -->
        <view class="oil-gun-wrapper">
          <view class="oil-gun-options-container" @tap="$emit('open-oil-mask')">
            <view class="oil-gun-text-description">
              <view class="text-select-gun-type avtive">
                {{ oilName }}-
              </view>
              <view
                class="text-contact111"
                :class="
                  oilGunText == '请与加油员确认油枪号' ? '' : 'avtive'
                "
                style="margin-left: 10Px;"
              >
                {{
                  oilGunText == "请与加油员确认油枪号"
                    ? ""
                    : "" + oilGunText
                }}
              </view>
            </view>
            <view class="ConfirmTheOilGunNumber">
              <view
                :class="
                  oilGunText == '请与加油员确认油枪号' ? '' : 'avtive111'
                "
                class="text-contact"
              >
                请与加油员确认油枪号
              </view>
              <view class="icon-select-type-container">
                <image
                  class="icon-select-type"
                  :src="themeStyle == 'dark' ? right : rightLight"
                />
              </view>
            </view>
          </view>
        </view>
      </view>
      <!-- 下一步 -->
      <view class="nextStep" @tap="$emit('next-step')"> 下一步 </view>
    </view>

    <!-- 金额信息 -->
    <view v-else class="AmountInformation">
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
        <view class="priceInput" @tap="$emit('open-input-mask', 'price')">
          <view> ¥</view>
          <view
            class="inputTotalPriceValue_"
            :class="inputTotalPriceValue ? '' : 'NOVALUE'"
          >
            {{ inputTotalPriceValue ? inputTotalPriceValue : "输入金额" }}
          </view>
        </view>
        <view
          class="priceInputNormal priceInputNormal1"
          @tap="$emit('set-oil-price', 200)"
        >
          <view>¥ 200</view>
          <view class="saveMoney">省 ¥ {{ liangbaiDiscount }}</view>
        </view>
        <view class="priceInputNormal" @tap="$emit('set-oil-price', 300)">
          <view>¥ 300</view>
          <view class="saveMoney">省 ¥ {{ sanbaiDiscount }}</view>
        </view>
      </view>

      <!-- 优惠券（如果不是团油，优惠券选择框就不显示） -->
      <view v-if="isTuanYou" class="couponList" style="display: none">
        <!-- 有优惠券，没有输入金额 -->
        <view
          v-if="
            couponList.length > 0 && isTuanYou && inputTotalPriceValue == 0
          "
          class="alreadyDiscounted"
        >
          你有{{ couponList.length }}张优惠券
        </view>
        <!-- 有优惠券，输入金额 -->
        <view
          v-if="
            couponList.length > 0 &&
            inputTotalPriceValue &&
            isTuanYou &&
            couponMoney > 0
          "
          class="alreadyDiscounted alreadyDiscounted1"
        >
          已优惠{{ couponMoney }}元
        </view>
        <!-- 没有优惠券，输入金额 -->
        <view
          v-if="
            isTuanYou &&
            (couponMoney <= 0 || couponList.length == 0) &&
            payAmount > 0
          "
          class="alreadyDiscounted"
        >
          暂无可用优惠券
        </view>
        <view class="reselect" @tap="$emit('reselect-coupon')">
          {{
            isTuanYou &&
            (couponMoney <= 0 || couponList.length == 0) &&
            payAmount > 0
              ? ""
              : couponList.length > 0 &&
                isTuanYou &&
                inputTotalPriceValue == 0
              ? "去选择"
              : "重新选择"
          }}
          <image
            class="icon-select-type"
            :src="themeStyle == 'dark' ? right : rightLight"
          />
        </view>
      </view>

      <!-- 支付方式 -->
      <view class="paymentMethod">
        <view
          class="paystyleWrap"
          :class="[alipayNoSecret ? '' : 'paystyleWrap1']"
        >
          <view
            class="paystyle"
            :class="[
              payWay == 1 ? 'wecahrtActive' : '',
              alipayNoSecret ? '' : 'payWay1',
            ]"
            @tap.stop="$emit('select-pay-way', 1)"
          >
            <image
              class="select-icon"
              :src="payWay == 1 ? wechatNoselected : wechatSelected"
            />
            <image :src="wxICON" class="payICON" />
            <view class="wexin-text"> 微信支付 </view>
          </view>
          <view
            class="paystyle"
            :class="[
              payWay == 2 ? 'zhifubaoActive' : '',
              alipayNoSecret ? '' : 'payWay1',
            ]"
            @tap.stop="$emit('select-pay-way', 2)"
          >
            <image
              class="select-icon"
              :src="payWay == 2 ? zhifubaoNoselected : zhifubaoSelected"
            />
            <image :src="zfbICON" class="payICON" />
            <view class="zhifubao-text"> 支付宝支付 </view>
          </view>
        </view>

        <view
          v-if="alipayNoSecret"
          class="mianmizhifu"
          @tap="$emit('click-mianmi')"
        >
          <image
            class="mianmizhifu-image"
            :src="tradeType == 'MM' ? selected : select"
          />
          <!-- alipayIsOpen 该用户是否已开通免密 -->
          <view class="mianmizhifu-text">
            {{ alipayIsOpen ? "使用支付宝免密支付" : "开通支付宝免密支付" }}
          </view>
        </view>
      </view>

      <!-- 其他 -->
      <view class="other" :class="inputTotalPriceValue ? 'finalPrice' : ''">
        <view class="btn btn1" @tap.stop="$emit('prev-step')"> 上一步 </view>
        <view class="btn" @tap="$emit('confirm-order')"> 提交订单 </view>
        <view v-if="inputTotalPriceValue" class="finalPrice_text">
          <view class="inputTotalPriceFinal">
            <view class="totalPriceText"> 总金额 </view>
            <view class="totalPrice"> ￥{{ payAmount }} </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import right from "@static/images/right.png";
import rightLight from "@static/images/icon_go.png";
import wechatNoselected from "@static/images/button_gouxuan.png";
import wechatSelected from "@static/images/button_weigouxuan.png";
import zhifubaoNoselected from "@static/images/button_gouxuan.png";
import zhifubaoSelected from "@static/images/button_weigouxuan.png";
import selected from "@static/images/selected.png";
import select from "@static/images/select.png";
import wxICON from "@static/images/wechat-noselected.png";
import zfbICON from "@static/images/zhifubao-noselected.png";

export default {
  name: "OrderPanel",
  props: {
    isStep1: { type: Boolean, default: true },
    partnerName: { type: String, default: "" },
    isInvoice: { type: [Number, String], default: 0 },
    oilName: { type: String, default: "" },
    oilGunText: { type: String, default: "请与加油员确认油枪号" },
    inputTotalPriceValue: { type: [Number, String], default: null },
    liangbaiDiscount: { type: [Number, String], default: "" },
    sanbaiDiscount: { type: [Number, String], default: "" },
    isTuanYou: { type: Boolean, default: false },
    couponList: { type: Array, default: () => [] },
    couponMoney: { type: Number, default: 0 },
    payAmount: { type: Number, default: 0 },
    payWay: { type: [Number, String], default: "1" },
    alipayNoSecret: { type: Number, default: 0 },
    alipayIsOpen: { type: Number, default: 0 },
    tradeType: { type: String, default: "SM" },
    themeStyle: { type: String, default: "light" },
  },
  data() {
    return {
      right,
      rightLight,
      wechatNoselected,
      wechatSelected,
      zhifubaoNoselected,
      zhifubaoSelected,
      selected,
      select,
      wxICON,
      zfbICON,
    };
  },
};
</script>
