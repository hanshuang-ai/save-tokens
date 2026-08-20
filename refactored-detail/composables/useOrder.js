// 支付方式 + 订单提交：选择支付方式、免密支付、提交订单、步骤切换。

import Taro from "@tarojs/taro";
import base from "@libs/base";
import * as wt from "@libs/wt";
import { commonUtils } from "./lib";

export default function useOrder() {
  return {
    data() {
      return {
        // 支付方式
        payWay: "1",
        payWayName: "微信支付",
        tradeType: "SM", // SM:扫码支付  MM:免密支付
        isShowAlipayIsOpenMask: false,

        // 步骤 / 提交状态
        isStep1: true, // 是否显示的是加油信息
        isSubmitted: false,
        trackphone: "",
        ServiceProvider: "", // 用作埋点
      };
    },
    methods: {
      // 选择支付方式，微信还是支付宝
      selectPayWay(type) {
        console.log("选择支付方式");
        this.payWayName = type == 1 ? "微信支付" : "支付宝支付";
        this.payWay = type;
        this.tradeType = "SM";
        wt.report({
          event_id: "PaymentMethodChoose",
          event_label: "selectPayWay",
          properties: {
            event_desc: "选择支付方式",
            pushNumber: base.pushNumber,
            openType: base.globalData.openType,
            gps: {
              latitude: this.currentLocation.latitude,
              longitude: this.currentLocation.longitude,
            },
            payWayName: this.payWayName,
          },
        });
      },

      // 点击免密支付选择框，将支付方式设置为支付宝，设置为2
      clickMianmizhifu() {
        console.log("点击选择免密支付clickMianmizhifu方法");
        this.payWay = 2; // 点击免密支付选择框，将支付方式设置为支付宝，设置为2
        this.tradeType = this.tradeType == "MM" ? "SM" : "MM";
        if (this.tradeType == "MM") {
          this.payWayName = "支付宝免密支付"; // 用作埋点
        } else {
          this.payWayName = "支付宝支付"; // 用作埋点
        }
      },

      // 提交订单
      confirmOrder() {
        this.getCurrentScrollTop();
        console.log("确认订单confirmOrder");
        const that = this;
        if (this.oilGunText == "请与加油员确认油枪号") {
          commonUtils.showToast("请与加油员确认油枪号");
          return;
        }
        if (!this.inputTotalPriceValue) {
          commonUtils.showToast("请输入金额");
          return;
        }
        if (that.totalPrice < 5) {
          commonUtils.showToast("支付金额不能小于5元");
          return;
        }
        if ((this.tradeType == "MM") & !this.alipayIsOpen) {
          console.log(
            "选择的是支付宝免密支付，并且该用户还没有开通支付宝免密支付，则弹出开通免密支付弹窗"
          );
          this.isShowAlipayIsOpenMask = true;
          this.zindexStatus = 4;
        } else {
          this.orderSubmit();
          if (this.bannerCode) {
            console.log("如果有运营位code，就调用mainButton_click方法");
            this.mainButton_click();
          }
        }
      },

      orderSubmit() {
        console.log("orderSubmit");
        let that = this;
        const changeDetailData = that.changeDetailData;
        const detailData = that.detailData;
        const phone = base.loginInfo.phone;
        if (this.partnerName == "最优价") {
          console.log("选择的最优价");
          var oilOptions = this.zuiyoujia.priceList;
          console.log("changeDetailData.oilNo===", this.changeDetailData.oilNo);
          for (var i = 0; i < oilOptions.length; i++) {
            if (oilOptions[i].oilNo == changeDetailData.oilNo) {
              console.log("iiiiiiiiiiiiiiiiiiiii", i);
              changeDetailData.partnerCode = oilOptions[i].partnerCode;
              changeDetailData.partnerName = oilOptions[i].partnerName;
              break;
            }
          }
          console.log(" that.changeDetailData==", changeDetailData);
        } else {
          console.log("选择的不是最优价。是其他服务商");
        }

        console.log("changeDetailData==", changeDetailData);
        this.ServiceProvider = changeDetailData.partnerName; // 用作埋点
        const jsonOrder = {
          oilNo: changeDetailData.oilNo, // 油号
          gunType: that.oilGunText, // 枪号
          price: that.totalPrice, // 输入金额
          stationId: this.stationId, // 加油站id
          gasName: detailData.name, // 加油站名称
          isInvoice: changeDetailData.isInvoice, // 开票 0：支持油站开票   1：支持线上开票
          priceYfq: changeDetailData.price, // 优惠后价格
          priceGun: changeDetailData.priceGun, // 枪价
          partnerCode: changeDetailData.partnerCode,
          partnerName: changeDetailData.partnerName,
          gasAddress: detailData.address,
          token: "", // 车机端登陆token
          payWay: this.payWay,
          tradeType: this.tradeType,
          alipayNoSecret: this.alipayNoSecret,
          alipayIsOpen: this.alipayIsOpen,
          wechatNoSecret: this.wechatNoSecret,
          weChatIsOpen: this.weChatIsOpen,
          isCollection: this.detailData.isCollection, // 油站是否收藏
          payWayName: this.payWayName,
          totalPrice: this.totalPrice,
          oilNameSelected: this.oilNameSelected,
          ServiceProvider: changeDetailData.partnerName,
          gps: {
            latitude: this.currentLocation.latitude,
            longitude: this.currentLocation.longitude,
          },
          couponId: this.isTuanYou ? this.couponId : "", // 优惠券id
          couponMoney: this.isTuanYou ? this.couponMoney : 0, // 优惠券金额
        };
        console.log("跳转的参数", jsonOrder);
        jsonOrder.price = parseFloat(jsonOrder.price).toFixed(2);
        const jsonString = encodeURIComponent(JSON.stringify(jsonOrder));
        console.log("jsonString == " + jsonString);
        // 上报埋点
        wt.report({
          event_id: "ConfirmOrder",
          event_label: "confirmOrder",
          properties: {
            event_desc: "确认订单",
            pushNumber: base.pushNumber,
            openType: base.globalData.openType,
            gps: {
              latitude: this.currentLocation.latitude,
              longitude: this.currentLocation.longitude,
            },
            payWayName: this.payWayName,
            totalPrice: this.totalPrice,
            oilNameSelected: this.oilNameSelected,
            ServiceProvider: changeDetailData.partnerName,
            trackphone: base.loginInfo.phone,
          },
        });
        if (this.options.bannerCode) {
          wt.report({
            event_id: "mainButton_click",
            event_label: "confirmOrder",
            properties: {
              event_desc: "运营活动详情-推荐油站详情主button按钮点击",
              pushNumber: base.pushNumber,
              openType: base.globalData.openType,
              gps: {
                latitude: this.currentLocation.latitude,
                longitude: this.currentLocation.longitude,
              },
              bannerCode: this.options.code,
              bannerName: this.options.bannerName,
              appletId: this.options.appletId,
              BannerPriority: this.options.priority,
              bannerType: this.options.bannerType,
            },
          });
        }

        Taro.navigateTo({
          url: "/pages/order/order?info=" + jsonString,
        });
      },

      // 同意开通支付宝免密协议
      agreeAlipayOpenXieYi() {
        console.log("同意开通支付宝免密协议");
        this.orderSubmit();
      },

      // 取消开通支付宝免密协议
      cancelAlipayOpenXieYi() {
        this.isShowAlipayIsOpenMask = false;
        this.zindexStatus = 0;
        this.setScrollTop();
      },

      // 从加油信息到金额信息
      nextStep() {
        let that = this;
        console.log(that.oilGunText);
        if (that.oilGunText == "请与加油员确认油枪号") {
          commonUtils.showToast("请与加油员确认油枪号");
        } else {
          that.isStep1 = false;

          // 如果没有输入金额，金额默认为0
          this.inputTotalPriceValue != null
            ? (this.inputTotalPriceValue = this.inputTotalPriceValue)
            : (this.inputTotalPriceValue = 0);
          console.log(
            this.inputTotalPriceValue,
            "输入的加油金额是",
            this.inputTotalPriceValue
          );
          if (this.isTuanYou) {
            this.payAmount = this.inputTotalPriceFinal;
          } else {
            this.payAmount = this.inputTotalPriceFinal;
          }
        }
      },

      // 从金额信息到加油信息
      prevStep() {
        let that = this;
        that.isStep1 = true;
      },

      // 运营位主button
      mainButton_click() {},
    },
  };
}
