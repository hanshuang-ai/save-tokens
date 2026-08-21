<template>
  <wt-page-animation>
    <view
      class="detail-container"
      :class="[THEME.colorStyle == 'dark' ? 'themeNight' : 'themeDay']"
    >
      <view v-if="!networkDisconnected_ && !timeOut">
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
              :detail-data-logo="detailDataLogo"
              :is-open="isOpen"
              :horizontal-big="horizontalBig"
              :star-icon="starIcon"
              @navigate="openNavigation"
              @store="storeStation"
            />

            <!-- 右侧操作区 -->
            <view class="operationContainer">
              <RefuelInfoStep
                v-if="isStep1"
                :partner-name="partnerName"
                :change-detail-data="changeDetailData"
                :oil-gun-text="oilGunText"
                :right-icon="rightIcon"
                :is-step1="isStep1"
                @open-partner-mask="openPartnerMask"
                @open-oil-mask="openOilMask"
                @next-step="nextStep"
              />

              <AmountInfoStep
                v-else
                :is-step1="isStep1"
                :input-total-price-value="inputTotalPriceValue"
                :detail-data="detailData"
                :is-tuan-you="isTuanYou"
                :coupon-list="couponList"
                :coupon-money="couponMoney"
                :pay-amount="payAmount"
                :pay-way="payWay"
                :trade-type="tradeType"
                :alipay-no-secret="alipayNoSecret"
                :alipay-is-open="alipayIsOpen"
                :wechat-noselected="wechatNoselected"
                :wechat-selected="wechatSelected"
                :zhifubao-noselected="zhifubaoNoselected"
                :zhifubao-selected="zhifubaoSelected"
                :selected="selectedImg"
                :select="selectImg"
                :wx-i-c-o-n="wxICON"
                :zfb-i-c-o-n="zfbICON"
                :right-icon="rightIcon"
                @open-input-mask="openInputMask"
                @set-oil-price="setOilPrice"
                @reselect-coupon="isReselect = true"
                @select-pay-way="selectPayWay"
                @click-mianmizhifu="clickMianmizhifu"
                @prev-step="prevStep"
                @confirm-order="confirmOrder"
              />
            </view>
          </view>

          <!-- 油枪油号选择弹窗 -->
          <OilGunSelector
            v-if="isMask && zindexStatus == 2"
            :oil-options="oilOptions"
            :guns-list="gunsList"
            :current-oil-type="currentOilType"
            :oil-gun-text="oilGunText"
            :theme-class="THEME.colorStyle == 'dark' ? 'themeNight' : 'themeDay'"
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
            <view class="login-input-wrapper">
              <view class="icon-key-close-wrapper">
                <view class="icon-key-close-container" @tap="closeInputMask">
                  <view class="icon-key-close-image" />
                </view>
                <view class="EnterAmount"> 输入金额 </view>
              </view>
              <view class="login-input-title-container">
                <view class="login-input-title-container_">
                  <view class="input-text-container">
                    <view class="input-text-content">{{ keyInputValue }}</view>
                  </view>
                  <view v-show="inputTextClose" class="input-text-close">
                    <view class="input-text-close-image" @tap="clearInputValue" />
                  </view>
                </view>
                <view class="key-confirm-button-wrapper flex-center" @tap="confirmInputValue">
                  确定
                </view>
              </view>
              <view class="tips-wrapper">{{ tipsContent }}</view>
              <view class="keyboard-wrapper">
                <view class="keyboard-container" :class="verticalBig ? 'verticalBig' : 'verticalMini'">
                  <view v-for="(items, i) in keyboardLayout" :key="i">
                    <view
                      v-if="items.value !== 'image'"
                      :class="[
                        items.value === '00' ? 'mt0 ml0 bg4F4F4F'
                        : items.value === '20' ? 'ml22 mt0'
                        : items.value === '01' ? 'ml0 mt14'
                        : items.value === '21' ? 'ml22 mt14'
                        : items.value === 'symbol' ? 'ml0 mt14 bgFFF01'
                        : '',
                      ]"
                      class="keyboard-item-wrapper flex-center bg4F4F4F"
                      @tap="setInputValue(items.value, items.name)"
                    >
                      {{ items.name }}
                    </view>
                    <view
                      v-else
                      class="keyboard-item-wrapper flex-center ml22 mt14 bg4F4F4F"
                      @tap="deleteInputValue"
                    >
                      <view class="icon-delete-wrapper"><view class="icon-delete" /></view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 服务商选择蒙版 -->
        <PartnerSelector
          v-if="isShowPartner && zindexStatus == 1"
          :zuiyoujia="zuiyoujia"
          :partner-lists="partnerLists"
          :select-partner-index="selectPartnerIndex"
          :theme-class="THEME.colorStyle == 'dark' ? 'themeNight' : 'themeDay'"
          @select-zuiyoujia="selectZuiyoujia"
          @select-partner="selectPartner"
          @close="closePartnerMask"
        />

        <!-- 开通支付宝免密支付蒙层 -->
        <view v-if="isShowAlipayIsOpenMask && zindexStatus == 4" class="alipayIsOpenMask">
          <view class="alipayOpenXieYi">
            <view class="alipayOpenXieYiTitle"> 开通免密支付 </view>
            <view class="alipayOpenXieYiContent">
              本次支付将会为您开通免密支付，您将签约授权通过支付宝（杭州）信息技术有限公司（以下简称"支付宝"）为您提供的"支付宝"免密支付服务向第三方服务商付款，若您选择免密支付，则视为您已阅读并同意支付宝《付款授权服务协议》。协议内容请在手机支付宝APP查看。
            </view>
            <view class="alipayOpenXieYiButton">
              <view class="button-agree" @tap="agreeAlipayOpenXieYi"> 同意 </view>
              <view class="Split"> | </view>
              <view class="button-cancel" @tap="cancelAlipayOpenXieYi"> 取消 </view>
            </view>
          </view>
        </view>

        <!-- 重新选择优惠券蒙层 -->
        <view v-if="isReselect && zindexStatus == 5" class="partner-wrap-mask" style="overflow: hidden">
          <view class="partner-mask-close">
            <view class="icon-close">
              <view class="icon-close-image" @tap="isReselect = false" />
            </view>
            <view class="partner-mask-title"> 优惠券 </view>
          </view>
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
                :class="[couponIndex == index ? 'selected' : '', item.optional ? '' : 'disabled']"
                @tap="selectCoupon(index, item.couponId, item.couponMoney, item.optional)"
              >
                <view class="couponListItem_top">
                  <view class="couponMoney"> ¥ {{ item.couponMoney }} </view>
                  <view class="couponDescription"> 满{{ item.couponConditionMoney }}元立减 </view>
                  <view class="border_bottom" />
                </view>
                <view class="couponListItem_bottom">
                  <view>{{ item.expireDateStart }}-{{ item.expireDateEnd }}</view>
                  <view v-if="!item.optional"> 此订单不符合使用条件 </view>
                </view>
              </view>
            </scroll-view>
          </view>
        </view>
      </view>

      <!-- 断网/超时 -->
      <wt-load-error v-show="networkDisconnected_" @networkDisconnected="networkDisconnected" />
      <wt-network-error v-show="timeOut && !networkDisconnected_" @reload="reloadData" />
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

// 条件导入
let checkAndLogin;
if (window.dsBridge && window.dsBridge.isDsBridge) {
  checkAndLogin = require("@libs/loginnew");
} else {
  checkAndLogin = require("@libs/login");
}
let commonUtils;
if (window.dsBridge && window.dsBridge.isDsBridge) {
  commonUtils = require("@libs/wtNew");
} else {
  commonUtils = require("@libs/common");
}

// 子组件
import StationCard from "./components/StationCard.vue";
import RefuelInfoStep from "./components/RefuelInfoStep.vue";
import AmountInfoStep from "./components/AmountInfoStep.vue";
import OilGunSelector from "./components/OilGunSelector.vue";
import PartnerSelector from "./components/PartnerSelector.vue";

// Composables
import { useStationData } from "./composables/useStationData";
import { usePartnerSelection } from "./composables/usePartnerSelection";
import { usePriceCalculation } from "./composables/usePriceCalculation";
import { usePayment } from "./composables/usePayment";
import { useKeyboardInput } from "./composables/useKeyboardInput";

export default {
  components: {
    WtPageAnimation,
    WtLoadError,
    WtNetworkError,
    StationCard,
    RefuelInfoStep,
    AmountInfoStep,
    OilGunSelector,
    PartnerSelector,
  },

  data() {
    return {
      // --- UI 状态 ---
      scrollTop: 0,
      networkDisconnected_: false,
      zindexStatus: 0,
      timeOut: false,
      THEME: base.themeData,
      horizontalBig: false,
      verticalBig: false,
      isOpen: true,
      isStep1: true,
      isShowPartner: false,
      isMask: false,
      isInputMask: false,
      isShowAlipayIsOpenMask: false,
      isReselect: false,
      tipsContent: "",
      isLogin: false,
      isLoad1: false,
      isLoad2: false,
      loadError: false,

      // --- 油枪相关 ---
      oilGunText: "请与加油员确认油枪号",
      oilNameSelected: "",
      initOilNo: null,

      // --- 图片资源 ---
      star: require("@static/images/star.png"),
      starNormal: require("@static/images/star-normal.png"),
      starNormal_light: require("@static/images/icon_star.png"),
      right: require("@static/images/right.png"),
      right_light: require("@static/images/icon_go.png"),
      wechatNoselected: require("@static/images/button_gouxuan.png"),
      wechatSelected: require("@static/images/button_weigouxuan.png"),
      zhifubaoNoselected: require("@static/images/button_gouxuan.png"),
      zhifubaoSelected: require("@static/images/button_weigouxuan.png"),
      selectedImg: require("@static/images/selected.png"),
      selectImg: require("@static/images/select.png"),
      wxICON: require("@static/images/wechat-noselected.png"),
      zfbICON: require("@static/images/zhifubao-noselected.png"),

      // --- 页面参数 ---
      options: {},
      pushNumber: 0,
      ratio: "",
      currentLocation: null,

      // --- Composable 状态（由 created() 填充引用） ---
      // useStationData
      detailData: {},
      changeDetailData: {},
      detailDataLogo: "",
      loadError1: false,
      stationId: "",

      // usePartnerSelection
      partnerLists: [],
      zuiyoujia: {},
      partnerName: "",
      oilOptions: [],
      gunsList: [],
      currentOilType: 0,
      defaultOilNumber: 0,
      selectPartnerIndex: -1,
      isTuanYou: false,
      wechatNoSecret: 0,
      alipayNoSecret: 0,
      weChatIsOpen: 0,
      alipayIsOpen: 0,
      loadError2: false,

      // usePriceCalculation
      totalPrice: 0,
      inputTotalPriceValue: null,
      inputTotalPriceSheng: "",
      inputTotalPriceFinal: "",
      inputTotalPriceDiscount: "",
      payAmount: 0,

      // usePayment
      payWay: "1",
      payWayName: "微信支付",
      tradeType: "SM",
      couponList: [],
      couponIndex: 0,
      couponMoney: 0,
      couponId: "",

      // useKeyboardInput
      keyInputValue: "",
      currentInputType: null,
      inputTextClose: false,
      keyboardLayout: [
        { name: 1, value: "00" }, { name: 2, value: "20" }, { name: 3, value: "20" },
        { name: 4, value: "01" }, { name: 5, value: "21" }, { name: 6, value: "21" },
        { name: 7, value: "01" }, { name: 8, value: "21" }, { name: 9, value: "21" },
        { name: ".", value: "symbol" }, { name: 0, value: "21" }, { name: 9, value: "image" },
      ],
    };
  },

  computed: {
    starIcon() {
      if (this.THEME.colorStyle == "dark") {
        return this.detailData.isCollection ? this.star : this.starNormal;
      }
      return this.detailData.isCollection ? this.star : this.starNormal_light;
    },
    rightIcon() {
      return this.THEME.colorStyle == "dark" ? this.right : this.right_light;
    },
  },

  created() {
    // 初始化 composables，将状态引用同步到组件 data
    this._station = useStationData();
    this._partner = usePartnerSelection();
    this._price = usePriceCalculation();
    this._payment = usePayment();
    this._keyboard = useKeyboardInput();

    // 建立状态双向同步（composable state ↔ component data）
    this._syncState(this._station.state, [
      "detailData", "changeDetailData", "detailDataLogo", "loadError1", "isLoad1", "stationId",
    ]);
    this._syncState(this._partner.state, [
      "partnerLists", "zuiyoujia", "partnerName", "oilOptions", "gunsList",
      "currentOilType", "defaultOilNumber", "selectPartnerIndex", "isTuanYou",
      "wechatNoSecret", "alipayNoSecret", "weChatIsOpen", "alipayIsOpen", "loadError2", "isLoad2",
    ]);
    this._syncState(this._price.state, [
      "totalPrice", "inputTotalPriceValue", "inputTotalPriceSheng",
      "inputTotalPriceFinal", "inputTotalPriceDiscount", "payAmount",
    ]);
    this._syncState(this._payment.state, [
      "payWay", "payWayName", "tradeType", "couponList", "couponIndex", "couponMoney", "couponId",
    ]);
    this._syncState(this._keyboard.state, [
      "isInputMask", "keyInputValue", "currentInputType", "inputTextClose",
    ]);
  },

  onLoad(options) {
    const _this = this;
    H5AppTabShow("油站详情页", function () {
      const refuelNetwork = Taro.getStorageSync("refuelNetwork");
      _this.loadError = refuelNetwork != 1;
    });

    addWtReportParams(options);
    const res = Taro.getSystemInfoSync();
    this.ratio = res.windowWidth / res.windowHeight;
    base.globalData.openType = options.openType || "list";
    base.pushNumber = options.pushNumber || 0;
    this.options = options;
    this.pushNumber = base.pushNumber;
    this.changeDetailData.oilNo = options.oilNo;

    if (options.bannerCode) {
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

    checkAndLogin.checkAndLogin().then(() => {
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
            bannerCode: this.options.bannerCode || "",
            bannerName: this.options.bannerName || "",
            appletId: this.options.appletId || "",
            BannerPriority: this.options.BannerPriority || "",
            bannerType: this.options.bannerType || "",
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

  onShow() {
    if (window.dsBridge && window.dsBridge.isDsBridge) {
      this.$parent.$parent.$refs.headerLay.init("油站详情");
    }
    isShowtitle(true, "油站详情", 1, 0);
    this.isShowAlipayIsOpenMask = false;
    this.zindexStatus = 0;
    this.getCurrentWidth();
    const that = this;
    window.addEventListener("resize", function () {
      that.getCurrentWidth();
    });
  },

  componentDidHide() {
    console.log("detail.vue=========componentDidHide");
  },

  destroyed() {
    wt.report({
      event_id: "DetailPageHide",
      event_label: "onHide",
      properties: { event_desc: "退出详情页面" },
    });
  },

  onHide() {
    wt.report({
      event_id: "DetailPageHide",
      event_label: "onHide",
      properties: { event_desc: "退出详情页面" },
    });
  },

  onUnload() {
    wt.report({
      event_id: "detail_Hide",
      event_label: "onHide",
      properties: { event_desc: "退出详情页面" },
    });
  },

  methods: {
    // ========== 内部工具 ==========
    _syncState(source, keys) {
      keys.forEach((key) => {
        Object.defineProperty(source, key, {
          get: () => this[key],
          set: (val) => { this[key] = val; },
          enumerable: true,
          configurable: true,
        });
      });
    },

    // ========== 布局/UI 工具 ==========
    getCurrentScrollTop() {
      const dom = document.querySelector(".detail-container");
      this.scrollTop = dom ? dom.scrollTop : 0;
    },

    setScrollTop() {
      const that = this;
      this.$nextTick(() => {
        const dom = document.querySelector(".detail-container");
        if (dom) dom.scrollTop = that.scrollTop;
      });
    },

    getCurrentWidth() {
      const w = document.documentElement.clientWidth || document.body.clientWidth;
      const h = document.documentElement.clientHeight || document.body.clientHeight;
      this.horizontalBig = w >= 1920;
      this.verticalBig = h >= 949;
    },

    networkDisconnected(value) {
      this.networkDisconnected_ = value;
    },

    shrink() { this.isOpen = false; },
    open() { this.isOpen = true; },

    // ========== 初始化 ==========
    init() {
      this.initOilNo = this.options.oilNo || "92";
      this.isLogin = true;
      this.getStationDetail();
      this.getPartnerOilList();
    },

    reloadData: utils.throttle(function () {
      this.init(this.options);
    }, 3000),

    // ========== 油站数据 ==========
    getStationDetail() {
      this._station
        .getStationDetail(this.currentLocation, this.options)
        .then((res) => {
          this.timeOut = false;
          this._station.handleDetailInfo(res, {
            onSuccess: () => { if (!this.isLoad1) this.inited1(); },
            onTTS: () => this._handleTTS(),
          });
        })
        .catch(() => {
          commonUtils.showToast("获取油站详情失败");
          this.timeOut = true;
          if (!this.isLoad1) this.isLoad1 = true;
        });
    },

    _handleTTS() {
      const opts = this.options;
      if (opts && opts.arrive !== "arrived" && (opts.openType == "click" || opts.openType == "speech")) {
        commonUtils.playTTS("您可以点击导航按钮前往油站享受优惠加油 ");
      } else if (opts && opts.arrive === "arrived" && (opts.openType == "click" || opts.openType == "speech")) {
        commonUtils.playTTS("已到达加油站，完成加油后请在车机端输入金额享优惠支付");
      }
    },

    inited1() { this.isLoad1 = true; },

    storeStation(stationId) {
      this._station.storeStation(
        stationId,
        this.detailData.isCollection,
        () => { this.detailData.isCollection = !this.detailData.isCollection; }
      );
    },

    // ========== 服务商 ==========
    getPartnerOilList() {
      this._partner
        .getPartnerOilList(this.options.wtStationId)
        .then((res) => {
          this._partner.handlePartnerInfo(res, this.initOilNo, this.changeDetailData.oilNo);
          this.changeDetailData.isInvoice = res.data.data[0].priceList[0].isInvoice;
          if (!this.isLoad2) this.inited2();
        })
        .catch(() => { if (!this.isLoad2) this.isLoad2 = true; });
    },

    inited2() { this.isLoad2 = true; },

    openPartnerMask() {
      this.getCurrentScrollTop();
      this.isShowPartner = true;
      this.zindexStatus = 1;
    },

    closePartnerMask() {
      this.isShowPartner = false;
      this.zindexStatus = 0;
      this.setScrollTop();
    },

    selectZuiyoujia() {
      const result = this._partner.selectZuiyoujia(this.changeDetailData.oilNo);
      Object.assign(this.changeDetailData, result.changeDetailData);
      this.oilOptions = result.oilOptions;
      this.gunsList = result.gunsList;
      this.oilGunText = "请与加油员确认油枪号";
      this.isShowPartner = false;
      this.zindexStatus = 0;
      this.setScrollTop();
    },

    selectPartner(index) {
      const result = this._partner.selectPartner(index, this.changeDetailData.oilNo);
      Object.assign(this.changeDetailData, result.changeDetailData);
      this.oilOptions = result.oilOptions;
      this.gunsList = result.gunsList;
      this.oilGunText = "请与加油员确认油枪号";
      this.isShowPartner = false;
      this.zindexStatus = 0;
      this.setScrollTop();
    },

    // ========== 油号油枪 ==========
    openOilMask() {
      this.getCurrentScrollTop();
      this.isMask = true;
      this.zindexStatus = 2;
      this.chooseOil(this.defaultOilNumber);
    },

    closeOilMask() {
      this.isMask = false;
      this.zindexStatus = 0;
      this.setScrollTop();
    },

    chooseOil(index) {
      this.currentOilType = index;
      this.defaultOilNumber = index;
      this.gunsList = this.oilOptions[index].gunNos;
    },

    chooseGun(item) {
      const oilOptionSelected = this.oilOptions[this.currentOilType];
      this.isMask = false;
      this.zindexStatus = 0;
      this.oilGunText = item || "请选择油枪号";
      this.changeDetailData.oilName = oilOptionSelected.oilName;
      this.changeDetailData.price = oilOptionSelected.price;
      this.changeDetailData.priceGun = oilOptionSelected.priceGun;
      this.changeDetailData.oilNo = oilOptionSelected.oilNo;
      this.oilNameSelected = oilOptionSelected.oilNo + "#";
      this._price.setPreferential(
        this.totalPrice || 0,
        this.changeDetailData,
        this.detailData
      );
      this.setScrollTop();
    },

    // ========== 价格计算 ==========
    setOilPrice(account) {
      this._price.setOilPrice(account, this.changeDetailData, this.detailData);
    },

    // ========== 键盘输入 ==========
    openInputMask(type) {
      this.getCurrentScrollTop();
      this._keyboard.openInputMask(type, this.inputTotalPriceValue);
      this.isInputMask = true;
      this.zindexStatus = 3;
    },

    setInputValue(value, name) {
      this._keyboard.setInputValue(value, name);
    },

    deleteInputValue() {
      this._keyboard.deleteInputValue();
    },

    clearInputValue() {
      this._keyboard.clearInputValue();
    },

    confirmInputValue() {
      const val = this.keyInputValue;
      if (val == "") {
        commonUtils.showToast("请输入金额");
        return;
      }
      if (val < 5) {
        commonUtils.showToast("支付金额不能小于5元");
        return;
      }
      this._price.confirmInputValue(val, this.changeDetailData, this.detailData);
      this.isInputMask = false;
      this.zindexStatus = 0;
      this.keyInputValue = "";
      this.setScrollTop();
    },

    closeInputMask() {
      this._keyboard.closeInputMask();
      this.isInputMask = false;
      this.zindexStatus = 0;
      this.tipsContent = "";
      this.setScrollTop();
    },

    // ========== 支付与订单 ==========
    confirmOrder() {
      this.getCurrentScrollTop();
      const error = this._payment.validateOrder(
        this.oilGunText,
        this.inputTotalPriceValue,
        this.totalPrice
      );
      if (error) {
        commonUtils.showToast(error);
        return;
      }
      if (this._payment.needsAlipayAuth(this.alipayIsOpen)) {
        this.isShowAlipayIsOpenMask = true;
        this.zindexStatus = 4;
      } else {
        this.orderSubmit();
        if (this.options.bannerCode) this.mainButton_click();
      }
    },

    orderSubmit() {
      const changeDetailData = { ...this.changeDetailData };
      if (this.partnerName == "最优价") {
        const oilOptions = this.zuiyoujia.priceList;
        for (let i = 0; i < oilOptions.length; i++) {
          if (oilOptions[i].oilNo == changeDetailData.oilNo) {
            changeDetailData.partnerCode = oilOptions[i].partnerCode;
            changeDetailData.partnerName = oilOptions[i].partnerName;
            break;
          }
        }
      }

      const jsonOrder = this._payment.buildOrderData({
        changeDetailData,
        detailData: this.detailData,
        oilGunText: this.oilGunText,
        totalPrice: this.totalPrice,
        stationId: this.stationId,
        alipayNoSecret: this.alipayNoSecret,
        alipayIsOpen: this.alipayIsOpen,
        wechatNoSecret: this.wechatNoSecret,
        weChatIsOpen: this.weChatIsOpen,
        oilNameSelected: this.oilNameSelected,
        currentLocation: this.currentLocation,
        couponId: this.couponId,
        couponMoney: this.couponMoney,
        isTuanYou: this.isTuanYou,
      });

      wt.report(this._payment.getPaymentReportParams(this.currentLocation));
      if (this.options.bannerCode) {
        wt.report({
          event_id: "mainButton_click",
          event_label: "confirmOrder",
          properties: {
            event_desc: "运营活动详情-推荐油站详情主button按钮点击",
            pushNumber: base.pushNumber,
            openType: base.globalData.openType,
            gps: { latitude: this.currentLocation.latitude, longitude: this.currentLocation.longitude },
            bannerCode: this.options.code,
            bannerName: this.options.bannerName,
            appletId: this.options.appletId,
            BannerPriority: this.options.priority,
            bannerType: this.options.bannerType,
          },
        });
      }

      this._payment.submitOrder(jsonOrder);
    },

    agreeAlipayOpenXieYi() { this.orderSubmit(); },

    cancelAlipayOpenXieYi() {
      this.isShowAlipayIsOpenMask = false;
      this.zindexStatus = 0;
      this.setScrollTop();
    },

    selectPayWay(type) { this._payment.selectPayWay(type); },
    clickMianmizhifu() { this._payment.clickMianmizhifu(); },
    selectCoupon(index, couponId, couponMoney, canUse) {
      this._payment.selectCoupon(index, couponId, couponMoney, canUse);
    },

    // ========== 步骤导航 ==========
    nextStep() {
      if (this.oilGunText == "请与加油员确认油枪号") {
        commonUtils.showToast("请与加油员确认油枪号");
        return;
      }
      this.isStep1 = false;
      if (this.inputTotalPriceValue == null) this.inputTotalPriceValue = 0;
      this.payAmount = this.inputTotalPriceFinal;
    },

    prevStep() { this.isStep1 = true; },

    // ========== 导航 ==========
    openNavigation: utils.throttle(function () {
      const cd = this.changeDetailData;
      commonUtils.navigateMap({
        latitude: cd.latitude + "",
        longitude: cd.longitude + "",
        address: this.detailData.name,
      });
      wt.report({
        event_id: "DetailPageNavigate",
        event_label: "openNavigation",
        properties: {
          event_desc: "选择支付方式",
          pushNumber: base.pushNumber,
          openType: base.globalData.openType,
          gps: { latitude: this.currentLocation.latitude, longitude: this.currentLocation.longitude },
        },
      });
    }, 1500),

    mainButton_click() {},
  },
};
</script>