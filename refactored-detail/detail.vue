<template>
  <wt-page-animation>
    <view
      class="detail-container"
      :class="[THEME.colorStyle == 'dark' ? 'themeNight' : 'themeDay']"
    >
      <view v-if="!networkDisconnected_ && !timeOut">
        <!-- isLoad1 isLoad2 两个接口全部请求完，并且初始化完成，显示油站详情及服务商信息 -->
        <view
          v-if="isLoad1 && isLoad2 && !isShowPartner"
          class="station-detail-container"
        >
          <view
            v-if="zindexStatus == 0"
            class="station-detail-content-container"
            :class="horizontalBig ? 'horizontalBig' : ''"
          >
            <!-- 左侧油站卡片 -->
            <StationCard
              :detail-data="detailData"
              :change-detail-data="changeDetailData"
              :logo="detailDataLogo"
              :is-open="isOpen"
              :theme-style="THEME.colorStyle"
              :horizontal-big="horizontalBig"
              @navigate="openNavigation"
              @collect="storeStation"
            />

            <!-- 右侧操作区 -->
            <OrderPanel
              :is-step1="isStep1"
              :partner-name="partnerName"
              :is-invoice="changeDetailData.isInvoice"
              :oil-name="changeDetailData.oilName"
              :oil-gun-text="oilGunText"
              :input-total-price-value="inputTotalPriceValue"
              :liangbai-discount="detailData.liangbaiDiscount"
              :sanbai-discount="detailData.sanbaiDiscount"
              :is-tuan-you="isTuanYou"
              :coupon-list="couponList"
              :coupon-money="couponMoney"
              :pay-amount="payAmount"
              :pay-way="payWay"
              :alipay-no-secret="alipayNoSecret"
              :alipay-is-open="alipayIsOpen"
              :trade-type="tradeType"
              :theme-style="THEME.colorStyle"
              @open-partner-mask="openPartnerMask"
              @open-oil-mask="openOilMask"
              @open-input-mask="openInputMask"
              @set-oil-price="setOilPrice"
              @select-pay-way="selectPayWay"
              @click-mianmi="clickMianmizhifu"
              @next-step="nextStep"
              @prev-step="prevStep"
              @confirm-order="confirmOrder"
              @reselect-coupon="isReselect = true"
            />
          </view>

          <!-- 油枪油号选择页面 -->
          <OilGunMask
            v-if="isMask && zindexStatus == 2"
            :oil-options="oilOptions"
            :guns-list="gunsList"
            :current-oil-type="currentOilType"
            :oil-gun-text="oilGunText"
            :theme-style="THEME.colorStyle"
            @choose-oil="chooseOil"
            @choose-gun="chooseGun"
            @close="closeOilMask"
          />

          <!-- 键盘输入蒙版 -->
          <view
            v-if="isInputMask && zindexStatus == 3"
            class="input-key-mask-container"
            :class="{ displayBlock: isInputMask, displayNone: !isInputMask }"
          >
            <AmountKeyboard
              :key-input-value="keyInputValue"
              :input-text-close="inputTextClose"
              :tips-content="tipsContent"
              :keyboard-value="keyboardValue"
              :vertical-big="verticalBig"
              @set-input="setInputValue"
              @delete="deleteInputValue"
              @clear="clearInputValue"
              @confirm="confirmInputValue"
              @close="closeInputMask"
            />
          </view>
        </view>

        <!-- 服务商选择蒙版 -->
        <PartnerMask
          v-if="isShowPartner && zindexStatus == 1"
          :zuiyoujia="zuiyoujia"
          :partner-lists="partnerLists"
          :select-partner-index="selectPartnerIndex"
          :theme-style="THEME.colorStyle"
          @select-zuiyoujia="selectZuiyoujia"
          @select-partner="selectPartner"
          @close="closePartnerMask"
        />

        <!-- 开通支付宝免密支付蒙层 -->
        <view
          v-if="isShowAlipayIsOpenMask && zindexStatus == 4"
          class="alipayIsOpenMask"
        >
          <view class="alipayOpenXieYi">
            <view class="alipayOpenXieYiTitle"> 开通免密支付 </view>
            <view class="alipayOpenXieYiContent">
              本次支付将会为您开通免密支付，您将签约授权通过支付宝（杭州）信息技术有限公司（以下简称“支付宝”）为您提供的“支付宝”免密支付服务向第三方服务商付款，若您选择免密支付，则视为您已阅读并同意支付宝《付款授权服务协议》。协议内容请在手机支付宝APP查看。
            </view>
            <view class="alipayOpenXieYiButton">
              <view class="button-agree" @tap="agreeAlipayOpenXieYi">
                同意
              </view>
              <view class="Split"> | </view>
              <view class="button-cancel" @tap="cancelAlipayOpenXieYi">
                取消
              </view>
            </view>
          </view>
        </view>

        <!-- 重新选择优惠券的蒙层 -->
        <view
          v-if="isReselect && zindexStatus == 5"
          class="partner-wrap-mask"
          style="overflow: hidden"
        >
          <view class="partner-mask-close">
            <view class="icon-close">
              <view class="icon-close-image" @tap="isReselect = false" />
            </view>
            <view class="partner-mask-title"> 优惠券 </view>
          </view>
          <!-- 优惠券缺省 -->
          <view v-if="couponList.length == 0" class="CouponDefault">
            <image class="no-data-image" src="@static/images/no-data.png" />
            <view class="no-data-view"> 暂无优惠券 </view>
          </view>
          <view v-else>
            <scroll-view :scroll-x="true" class="couponListContainer">
              <view
                v-for="(item, index) in couponList"
                :key="index"
                class="couponListItem"
                :class="[
                  couponIndex == index ? 'selected' : '',
                  item.optional ? '' : 'disabled',
                ]"
                @tap="
                  selectCoupon(
                    index,
                    item.couponId,
                    item.couponMoney,
                    item.optional
                  )
                "
              >
                <view class="couponListItem_top">
                  <view class="couponMoney"> ¥ {{ item.couponMoney }} </view>
                  <view class="couponDescription">
                    满{{ item.couponConditionMoney }}元立减
                  </view>
                  <view class="border_bottom" />
                </view>
                <view class="couponListItem_bottom">
                  <view>
                    {{ item.expireDateStart }}-{{ item.expireDateEnd }}
                  </view>
                  <view v-if="!item.optional"> 此订单不符合使用条件 </view>
                </view>
              </view>
            </scroll-view>
          </view>
        </view>
      </view>

      <!-- 断网 -->
      <wt-load-error
        v-show="networkDisconnected_"
        @networkDisconnected="networkDisconnected"
      />
      <!-- 接口超时 -->
      <wt-network-error
        v-show="timeOut && !networkDisconnected_"
        @reload="reloadData"
      />
    </view>
  </wt-page-animation>
</template>

<script>
import Taro from "@tarojs/taro";
import "./detail.less";
import "./detail_light.less";
import base from "@libs/base";
import WtLoadError from "../../component/wt-load-error-local/wt-load-error";
import WtNetworkError from "../../component/wt-network-error/wt-network-error";
import utils from "@libs/utils";
import * as wt from "@libs/wt";
import { isShowtitle } from "../../utils/isShowTitle";
import { addWtReportParams } from "../../utils/addWtReportParams";
import config from "../../utils/config";
import { H5AppTabShow } from "../../utils/testChangeTab";
import WtPageAnimation from "../../../WT-UI/packages/wt-pageAnimation/wt-pageAnimation.vue";

import { checkAndLogin, commonUtils } from "./composables/lib";
import useStationDetail from "./composables/useStationDetail";
import usePartnerOil from "./composables/usePartnerOil";
import usePriceCalculator from "./composables/usePriceCalculator";
import useOrder from "./composables/useOrder";

import StationCard from "./components/StationCard.vue";
import OrderPanel from "./components/OrderPanel.vue";
import OilGunMask from "./components/OilGunMask.vue";
import AmountKeyboard from "./components/AmountKeyboard.vue";
import PartnerMask from "./components/PartnerMask.vue";

export default {
  components: {
    WtPageAnimation,
    WtLoadError,
    WtNetworkError,
    StationCard,
    OrderPanel,
    OilGunMask,
    AmountKeyboard,
    PartnerMask,
  },
  mixins: [
    useStationDetail(),
    usePartnerOil(),
    usePriceCalculator(),
    useOrder(),
  ],
  props: {},
  data() {
    return {
      // 页面级 UI 状态（各 composable 通过 this 共享）
      scrollTop: 0,
      networkDisconnected_: false,
      zindexStatus: 0, // 0 主内容 / 1 服务商 / 2 油号油枪 / 3 金额键盘 / 4 免密协议 / 5 优惠券
      timeOut: false,
      loadError: false,
      THEME: base.themeData,
      ratio: "",
      horizontalBig: false,
      verticalBig: false,

      // 金额键盘布局（静态配置）
      keyboardValue: [
        { name: 1, value: "00" },
        { name: 2, value: "20" },
        { name: 3, value: "20" },
        { name: 4, value: "01" },
        { name: 5, value: "21" },
        { name: 6, value: "21" },
        { name: 7, value: "01" },
        { name: 8, value: "21" },
        { name: 9, value: "21" },
        { name: ".", value: "symbol" },
        { name: 0, value: "21" },
        { name: 9, value: "image" },
      ],

      // 历史遗留的展示配置（当前模板未使用）
      indicatorDots: false,
      vertical: true, // 纵向
      autoplay: false,
      imgUrls: [
        { name: "" },
        { name: "abc1" },
        { name: "abc2" },
        { name: "abc3" },
        { name: "" },
      ],
      value: [0, 0], // picker筛选索引
      isShowSpeechTip: false,
    };
  },
  onLoad(options) {
    let _this = this;

    H5AppTabShow("油站详情页", function () {
      // 监听网络状态
      let refuelNetwork = Taro.getStorageSync("refuelNetwork");
      console.log(refuelNetwork, "检测到的网络状态");
      if (refuelNetwork == 1) {
        console.log("有网络，展示页面");
        _this.loadError = false;
      } else {
        console.log("无网络，隐藏页面");
        _this.loadError = true;
      }
    });
    console.log("onload-页面初次加载");
    addWtReportParams(options);

    console.log("detail onLoad" + (Date.now() - base.globalData.launchTime));
    console.log("收到的参数---" + JSON.stringify(options));
    var res = Taro.getSystemInfoSync();
    console.log("res=======", res);
    this.ratio = res.windowWidth / res.windowHeight;
    base.globalData.openType = options.openType || "list";
    base.pushNumber = options.pushNumber || 0; // 给base中的pushNumber赋值
    this.options = options;
    this.pushNumber = base.pushNumber;
    this.changeDetailData.oilNo = options.oilNo;
    if (options.bannerCode) {
      console.log("有运营位code，上报打开运营位详情页面");
      // 埋点上报
      wt.report({
        event_id: "bannerDetailPageShow",
        event_label: "onLoad",
        properties: {
          event_desc: "显示运营活动-推荐油站详情页面",
          pushNumber: base.pushNumber,
          openType: base.globalData.openType,
          bannerCode: options.code,
          bannerName: options.bannerName,
          appletId: options.appletId,
          BannerPriority: options.priority,
          bannerType: options.bannerType,
        },
      });
    }

    // 因为可以从外面直接跳转到油站详情页，所以要判断登录
    checkAndLogin.checkAndLogin().then(() => {
      console.log("checkAndLogin=====then====");
      commonUtils.getLocation().then((res) => {
        this.currentLocation = res;
        this.init();
        wt.report({
          event_id: "DetailPageShow",
          event_label: "onShow",
          properties: {
            event_desc: "显示详情页面",
            gasId: this.options.wtStationId,
            gasName: this.options.name,
            bannerCode: this.options.bannerCode || "", // 运营位
            bannerName: this.options.bannerName || "", // 运营位
            appletId: this.options.appletId || "", // 运营位
            BannerPriority: this.options.BannerPriority || "", // 运营位
            bannerType: this.options.bannerType || "", // 运营位
            openType: this.options.openType || base.globalData.openType,
            gps: {
              latitude: this.currentLocation.latitude,
              longitude: this.currentLocation.longitude,
            },
          },
        });
      });
    });
  },
  componentDidHide() {
    console.log("detail.vue=========componentDidHide");
  },
  destroyed() {
    console.log("detail.vue=========destroyed");
    wt.report({
      event_id: "DetailPageHide",
      event_label: "onHide",
      properties: {
        event_desc: "退出详情页面",
      },
    });
  },
  onHide() {
    console.log("detail.vue=======onHide======");
    wt.report({
      event_id: "DetailPageHide",
      event_label: "onHide",
      properties: {
        event_desc: "退出详情页面",
      },
    });
  },
  onUnload() {
    console.log("detail.vue======onUnload");
    wt.report({
      event_id: "detail_Hide",
      event_label: "onHide",
      properties: {
        event_desc: "退出详情页面",
      },
    });
  },
  onShow() {
    let that = this;
    window.dsBridge.isDsBridge
      ? this.$parent.$parent.$refs.headerLay.init("油站详情")
      : "";
    console.log(config.globalData.theme.style, "颜色模式");
    let isShowCon = config.globalData.isShowCon;
    console.log(isShowCon, "showOPtion");
    isShowtitle(true, "油站详情", 1, 0);
    console.log("onShow===this.options====onShow", this.options);

    // 从支付页面返回回来，蒙层弹窗依显示，设置isShowAlipayIsOpenMask为false则取消显示
    this.isShowAlipayIsOpenMask = false;
    this.zindexStatus = 0;
    this.getCurrentWidth();
    window.addEventListener("resize", function () {
      that.getCurrentWidth();
    });
  },

  methods: {
    getCurrentScrollTop() {
      let dom = document.querySelector(".detail-container");
      this.scrollTop = dom.scrollTop;
      console.log("getCurrentScrollTop", this.scrollTop);
    },
    setScrollTop() {
      let that = this;
      let dom = document.querySelector(".detail-container");
      console.log("dom", dom);
      this.$nextTick(() => {
        dom.scrollTop = that.scrollTop;
      });
      console.log("setScrollTop", that.scrollTop);
    },
    getCurrentWidth() {
      let w = document.documentElement.clientWidth || document.body.clientWidth;
      let h =
        document.documentElement.clientHeight || document.body.clientHeight;
      console.log(w, "wwwwww");
      console.log(h, "hhhhhh");
      if (w >= 1920) {
        this.horizontalBig = true;
      } else {
        this.horizontalBig = false;
      }
      if (h >= 949) {
        this.verticalBig = true;
      } else if (h < 949) {
        this.verticalBig = false;
      }
    },
    networkDisconnected(value) {
      this.networkDisconnected_ = value;
    },
    reloadData: utils.throttle(function () {
      console.log("油站详情页面==reloadData=====reloadData");
      this.init(this.options);
    }, 3000),
  },
};
</script>
