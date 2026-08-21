/**
 * usePayment - 支付与订单管理
 * 负责支付方式选择、免密支付、订单构建与提交
 */
import Taro from "@tarojs/taro";
import base from "@libs/base";
import * as wt from "@libs/wt";

export function usePayment() {
  const state = {
    payWay: "1",
    payWayName: "微信支付",
    tradeType: "SM",
    isShowAlipayIsOpenMask: false,
    couponList: [],
    couponIndex: 0,
    couponMoney: 0,
    couponId: "",
    isReselect: false,
  };

  /**
   * 选择支付方式
   */
  function selectPayWay(type) {
    state.payWayName = type == 1 ? "微信支付" : "支付宝支付";
    state.payWay = type;
    state.tradeType = "SM";
  }

  /**
   * 切换免密支付
   */
  function clickMianmizhifu() {
    state.payWay = 2;
    state.tradeType = state.tradeType == "MM" ? "SM" : "MM";
    state.payWayName =
      state.tradeType == "MM" ? "支付宝免密支付" : "支付宝支付";
  }

  /**
   * 提交订单前的确认
   * @returns {string|null} 错误信息，null表示通过验证
   */
  function validateOrder(oilGunText, inputTotalPriceValue, totalPrice) {
    if (oilGunText == "请与加油员确认油枪号") {
      return "请与加油员确认油枪号";
    }
    if (!inputTotalPriceValue) {
      return "请输入金额";
    }
    if (totalPrice < 5) {
      return "支付金额不能小于5元";
    }
    return null;
  }

  /**
   * 是否需要弹出免密支付开通确认
   */
  function needsAlipayAuth(alipayIsOpen) {
    return state.tradeType == "MM" && !alipayIsOpen;
  }

  /**
   * 构建订单数据
   */
  function buildOrderData(params) {
    const {
      changeDetailData,
      detailData,
      oilGunText,
      totalPrice,
      stationId,
      alipayNoSecret,
      alipayIsOpen,
      wechatNoSecret,
      weChatIsOpen,
      oilNameSelected,
      currentLocation,
      couponId,
      couponMoney,
      isTuanYou,
    } = params;

    // 如果是最优价，需要从zuiyoujia中获取partnerCode和partnerName
    let resolvedChangeDetailData = { ...changeDetailData };

    return {
      oilNo: resolvedChangeDetailData.oilNo,
      gunType: oilGunText,
      price: totalPrice,
      stationId: stationId,
      gasName: detailData.name,
      isInvoice: resolvedChangeDetailData.isInvoice,
      priceYfq: resolvedChangeDetailData.price,
      priceGun: resolvedChangeDetailData.priceGun,
      partnerCode: resolvedChangeDetailData.partnerCode,
      partnerName: resolvedChangeDetailData.partnerName,
      gasAddress: detailData.address,
      token: "",
      payWay: state.payWay,
      tradeType: state.tradeType,
      alipayNoSecret: alipayNoSecret,
      alipayIsOpen: alipayIsOpen,
      wechatNoSecret: wechatNoSecret,
      weChatIsOpen: weChatIsOpen,
      isCollection: detailData.isCollection,
      payWayName: state.payWayName,
      totalPrice: totalPrice,
      oilNameSelected: oilNameSelected,
      ServiceProvider: resolvedChangeDetailData.partnerName,
      gps: {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      },
      couponId: isTuanYou ? couponId : "",
      couponMoney: isTuanYou ? couponMoney : 0,
    };
  }

  /**
   * 执行订单提交（跳转到订单页）
   */
  function submitOrder(jsonOrder) {
    jsonOrder.price = parseFloat(jsonOrder.price).toFixed(2);
    const jsonString = encodeURIComponent(JSON.stringify(jsonOrder));
    Taro.navigateTo({
      url: "/pages/order/order?info=" + jsonString,
    });
  }

  /**
   * 选择优惠券
   */
  function selectCoupon(index, couponId, couponMoney, canUse) {
    if (canUse) {
      state.couponIndex = index;
      state.couponMoney = couponMoney;
      state.couponId = couponId;
      state.isReselect = false;
    }
  }

  /**
   * 获取支付埋点上报参数
   */
  function getPaymentReportParams(currentLocation) {
    return {
      event_id: "ConfirmOrder",
      event_label: "confirmOrder",
      properties: {
        event_desc: "确认订单",
        pushNumber: base.pushNumber,
        openType: base.globalData.openType,
        gps: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
        payWayName: state.payWayName,
        totalPrice: state.totalPrice,
        oilNameSelected: "",
        ServiceProvider: "",
        trackphone: base.loginInfo.phone,
      },
    };
  }

  return {
    state,
    selectPayWay,
    clickMianmizhifu,
    validateOrder,
    needsAlipayAuth,
    buildOrderData,
    submitOrder,
    selectCoupon,
    getPaymentReportParams,
  };
}