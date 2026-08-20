// 价格计算 + 金额输入 + 优惠券：根据油号/枪号/输入金额计算优惠价与应付金额，以及键盘输入逻辑。

import base from "@libs/base";
import { commonUtils } from "./lib";

export default function usePriceCalculator() {
  return {
    data() {
      return {
        // 金额计算
        totalPrice: 0,
        inputTotalPriceValue: null, // 输入的金额
        inputTotalPriceSheng: "", // 输入的金额能加多少升油
        inputTotalPriceFinal: "", // 输入的金额，最终优惠的价格需要支付的价格是多少
        inputTotalPriceDiscount: "", // 输入的金额，能优惠多少钱
        payAmount: 0, // 最终支付的金额

        // 优惠券
        couponList: [], // 优惠券列表
        couponIndex: 0, // 选择的优惠券索引
        couponMoney: 0, // 输入金额后返回的优惠
        couponId: "", // 使用的优惠券id
        isReselect: false, // 是否重新显示优惠券

        // 金额键盘
        isInputMask: false,
        keyInputValue: "",
        currentInputType: null,
        inputTextClose: false,
        tipsContent: "",
      };
    },
    methods: {
      // 设置优惠价格
      setPreferential() {
        let account = this.totalPrice;
        // 能加多少升
        this.inputTotalPriceSheng = (
          account / this.changeDetailData.price
        ).toFixed(1);

        // 优惠后最终需要的价格
        this.inputTotalPriceFinal = (
          (account / this.changeDetailData.priceGun) *
          this.changeDetailData.price
        ).toFixed(2);
        console.log("优惠后最终需要的价格", this.inputTotalPriceFinal);

        // 最终优惠多少钱
        this.inputTotalPriceDiscount = (
          account -
          (account / this.changeDetailData.priceGun) * this.changeDetailData.price
        ).toFixed(2);

        this.detailData.liangbaiDiscount = (
          200 -
          (200 / this.changeDetailData.priceGun) * this.changeDetailData.price
        ).toFixed(2);
        this.detailData.sanbaiDiscount = (
          300 -
          (300 / this.changeDetailData.priceGun) * this.changeDetailData.price
        ).toFixed(2);
      },

      // 预置输入金额
      setOilPrice(account) {
        console.log("setOilPrice选择金额");
        this.inputTotalPriceValue = account;
        this.totalPrice = account;
        // fixme:因为不是输入时立即请求接口，所以没有做watch监测，分别在输入框确定按钮 和 快捷输入 内调用
        console.log(this.isTuanYou, "选择的服务商是否是团油");
        if (this.isTuanYou) {
          this.setPreferential();
          this.payAmount = this.inputTotalPriceFinal;
        } else {
          console.log(this.inputTotalPriceValue);
          console.log(
            this.inputTotalPriceFinal,
            "inputTotalPriceFinalinputTotalPriceFinalinputTotalPriceFinal"
          );
          this.setPreferential();
          this.payAmount = this.inputTotalPriceFinal;
        }
      },

      // 自动选择优惠券（当前已禁用，保留原逻辑备查）
      AutomaticallySelectCoupons() {
        let that = this;
        const params = {
          appid: base.appInfo.appId2,
          sign: "",
          data: {
            oilNo: that.changeDetailData.oilName.split("#")[0],
            stationId: that.options.wtStationId,
            originalAmount: that.inputTotalPriceValue,
          },
        };
        // http({
        //   url: base.apiInfo.autoSelectCoupon,
        //   data: params,
        //   methods: "POST",
        //   isShowLoading: true,
        // })
        //   .then((res) => {
        //     that.couponMoney = res.data.data.couponMoney || 0;
        //     res.data.data.couponList.map((item) => {
        //       item.couponMoney = item.couponMoney.toFixed(2);
        //     });
        //     that.couponList = res.data.data.couponList;
        //     if (
        //       res.data.data.couponList.length > 0 &&
        //       res.data.data.couponList[0].optional
        //     ) {
        //       that.couponId = res.data.data.couponList[0].couponId;
        //     } else {
        //       that.couponId = "";
        //     }
        //     that.payAmount = res.data.data.payAmount || 0;
        //   });
      },

      // 打开键盘输入蒙层
      openInputMask(currentInputType) {
        this.getCurrentScrollTop();
        console.log(currentInputType, "currentInputType");
        this.isInputMask = true;
        this.zindexStatus = 3;
        this.currentInputType = currentInputType;
        this.keyInputValue = this.inputTotalPriceValue
          ? this.inputTotalPriceValue
          : "";
        console.log(this.keyInputValue, "this.keyInputValue");
        this.keyInputValue.toString().length > 0
          ? (this.inputTextClose = true)
          : (this.inputTextClose = false);
      },

      // 点击键盘内的数字
      setInputValue(value, name) {
        console.log(value, name);
        const that = this;
        let keyInputValue = that.keyInputValue.toString();

        if (keyInputValue.includes(".") && name == ".") {
          return;
        }

        if (keyInputValue == "0" && name != ".") {
          return;
        }

        if (keyInputValue == "" && name == ".") {
          return;
        }

        if (keyInputValue + name > 10000) {
          commonUtils.showToast("最大输入金额为10000");
          return;
        }

        if (
          keyInputValue.includes(".") &&
          !/^\d+(\.\d{0,1})?$/.test(keyInputValue)
        ) {
          commonUtils.showToast("最大输入金额保留两位小数");
          return;
        }

        this.keyInputValue = keyInputValue + name;
        let len = this.keyInputValue.length;
        console.log(len);
        if (len > 0) {
          this.inputTextClose = true;
        } else {
          this.inputTextClose = false;
        }
      },

      // 删除输入框的值
      deleteInputValue() {
        const that = this;
        const value = that.keyInputValue.toString();
        console.log(value, "目前输入框的值");
        const newValue = value.substring(0, value.length - 1);
        this.keyInputValue = newValue;
        let len = this.keyInputValue.length;
        console.log(len);
        if (len > 0) {
          this.inputTextClose = true;
        } else {
          this.inputTextClose = false;
        }
      },

      // 清空键盘输入框中的值
      clearInputValue() {
        this.keyInputValue = "";
        this.inputTextClose = false;
      },

      // 确定输入框内容（金额）并调用优惠券接口
      confirmInputValue() {
        console.log("confirmInputValue==确定输入框内容");
        const that = this;
        const keyInputValue = that.keyInputValue;

        if (keyInputValue == "") {
          commonUtils.showToast("请输入金额");
          return;
        }
        if (keyInputValue < 5) {
          commonUtils.showToast("支付金额不能小于5元");
          return;
        }
        let inputTotalPriceValue = keyInputValue ? String(keyInputValue - 0) : "";
        let inputTotalPriceSheng = (
          inputTotalPriceValue / this.detailData.priceGun
        ).toFixed(1); // 能加多少升

        let inputTotalPriceFinal = (
          (inputTotalPriceValue / this.changeDetailData.priceGun) *
          this.changeDetailData.price
        ).toFixed(2); // 优惠后最终需要的价格
        console.log(
          inputTotalPriceValue,
          "inputTotalPriceValueinputTotalPriceValue"
        );
        console.log(
          this.detailData.priceGun,
          "this.detailData.priceGunthis.detailData.priceGun"
        );
        console.log(
          this.detailData.price,
          "this.detailData.pricethis.detailData.price"
        );

        let inputTotalPriceDiscount = (
          inputTotalPriceValue -
          (inputTotalPriceValue / this.detailData.priceGun) *
            this.detailData.price
        ).toFixed(2); // 最终优惠多少钱
        this.totalPrice = keyInputValue;
        this.inputTotalPriceValue = inputTotalPriceValue;
        this.inputTotalPriceSheng = inputTotalPriceSheng;
        this.inputTotalPriceFinal = inputTotalPriceFinal;
        this.inputTotalPriceDiscount = inputTotalPriceDiscount;
        this.isInputMask = false;
        this.zindexStatus = 0;
        this.keyInputValue = "";
        if (this.isTuanYou) {
          this.payAmount = this.inputTotalPriceFinal;
        } else {
          this.payAmount = this.inputTotalPriceFinal;
        }
        this.setScrollTop();
      },

      // 关闭键盘输入框
      closeInputMask() {
        console.log("关闭输入框的功能");
        this.isInputMask = false;
        this.zindexStatus = 0;
        this.keyInputValue = "";
        this.tipsContent = "";
        this.setScrollTop();
      },

      // 选择优惠券
      selectCoupon(index, couponId, couponMoney, canUse) {
        let that = this;
        // 如果可以使用，返回该优惠券id和优惠金额
        if (canUse) {
          that.couponIndex = index;
          that.couponMoney = couponMoney;
          that.couponId = couponId;
          that.isReselect = false;
        }

        console.log(index, couponId, canUse);
      },
    },
  };
}
