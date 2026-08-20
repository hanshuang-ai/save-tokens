// 服务商 / 油号 / 油枪：获取服务商油号价格列表、选择服务商、选择油号油枪。

import base from "@libs/base";
import http from "@libs/http";

export default function usePartnerOil() {
  return {
    data() {
      return {
        // 服务商
        partnerName: "",
        partnerLists: [], // 服务商列表
        zuiyoujia: {}, // 服务商，油号最优价
        selectPartnerIndex: -1, // 默认是-1，默认选中最优价
        isShowPartner: false, // 是否显示服务商选择蒙版
        isTuanYou: false, // 是否是团油，如果是团油，则可以使用优惠券

        // 油号 / 油枪
        oilOptions: [], // 油枪价格以及油枪对应的油号
        gunsList: [],
        currentOilType: 0, // 当前油号
        defaultOilNumber: 0,
        oilGunText: "请与加油员确认油枪号",
        oilGunSelected: "",
        oilNameSelected: "",
        typeSwiperCurrentIndex: 0,
        gunSwiperCurrentIndex: 0,
        changeOil: 0,
        changeGun: 0,
        oilNo: "", // 当前油号，首页油号选择设置的油号

        // 免密支付能力位
        wechatNoSecret: 0, // 是否支持微信免密支付（1：支持；0：不支持）
        alipayNoSecret: 0, // 是否支持支付宝免密支付（1：支持；0：不支持）
        weChatIsOpen: 0, // 是否开通微信免密支付
        alipayIsOpen: 0, // 是否开通支付宝免密支付

        // 油号选择蒙版
        isMask: false,

        // 服务商接口加载状态
        loadError2: false,
        isLoad2: false,
      };
    },
    methods: {
      // 获取服务商信息
      getPartnerOilList() {
        console.log(
          "getPartnerOilList==根据梧桐油站id获取对应的服务商，油号价格信息"
        );
        const params = {
          appid: base.appInfo.appId2,
          sign: "",
          data: {
            stationId: this.options.wtStationId, // 从首页传递过来的油站id
          },
        };
        const optionsPost = {
          url: base.apiInfo.partnerOilList,
          data: params,
          method: "POST",
        };
        console.log(optionsPost, "油站服务商接口");
        http(optionsPost)
          .then(this.handlePartnerInfo)
          .catch((err) => {
            console.log(err, "油站服务商详情请求失败");
            if (!this.isLoad2) {
              this.loadError2 = true;
            }
          });
      },

      // 自动筛选最优价
      handlePartnerInfo(res) {
        console.log("服务商详情", res);
        if (
          res.data.code === "0000" ||
          (res.data.code === null && res.data.code instanceof Array)
        ) {
          console.log("如果code====0000并且data为数组");
          console.log(
            "服务商列表第一个为最优价，第二个开始为服务商",
            res.data.data
          );

          this.currentOilType = 0;
          let zuiyoujia = res.data.data[0];
          console.log("zuiyoujia==============", zuiyoujia);
          res.data.data &&
            res.data.data.forEach((item) => {
              console.log("item==", item);
              item.priceList &&
                item.priceList.forEach((inneritem, innerindex) => {
                  console.log(inneritem, "inneriteminneriteminneritem");
                  inneritem.gunNos =
                    inneritem.gunNos && inneritem.gunNos.split(",");
                  if (inneritem.oilNo == this.oilNo) {
                    this.currentOilType = innerindex;
                  }
                });
            });
          console.log(" this.data.currentOilType===", this.currentOilType);
          let stationLists = res.data.data;
          let oilOptions = [...res.data.data[0].priceList]; // 油价信息（油号，油价，油枪，经纬度）
          const gunsList = oilOptions[this.currentOilType].gunNos;

          console.log("gunsList====", gunsList);
          console.log("oilOptions====", oilOptions);
          oilOptions.map((item, index) => {
            console.log(item, "item", this.changeDetailData);
            if (item.oilNo == this.changeDetailData.oilNo) {
              this.defaultOilNumber = index;
              console.log(this.defaultOilNumber, "defaultOilNumber");
            }
          });

          console.log("最优价zuiyoujia===", zuiyoujia);
          stationLists = stationLists.filter((item, index) => {
            return index !== 0;
          });
          console.log("stationLists====服务商列表", stationLists);
          this.changeDetailData.isInvoice =
            res.data.data[0].priceList[0].isInvoice;
          this.zuiyoujia = zuiyoujia;
          this.partnerName = zuiyoujia.partnerName;
          this.partnerLists = stationLists;
          this.oilOptions = oilOptions;
          this.gunsList = gunsList;
          this.currentOilType = this.currentOilType;
          this.wechatNoSecret = zuiyoujia.priceList[0].wechatNoSecret;
          this.alipayNoSecret = zuiyoujia.priceList[0].alipayNoSecret;
          this.weChatIsOpen = zuiyoujia.priceList[0].weChatIsOpen;
          this.alipayIsOpen = zuiyoujia.priceList[0].alipayIsOpen;
          !this.isLoad2 && this.inited2(); // 油站服务商渲染完成
          console.log(this.isLoad1, this.isLoad2, "显示页面的条件");
        }
      },

      inited2() {
        this.isLoad2 = true; // 初始化完成
        console.log("inited=====服务商===this.isLoad", this.isLoad2);
      },

      // 筛选服务商
      openPartnerMask() {
        this.getCurrentScrollTop();
        console.log("打开服务商选择蒙版");
        this.isShowPartner = true;
        this.zindexStatus = 1;
      },

      closePartnerMask() {
        this.isShowPartner = false;
        this.zindexStatus = 0;
        this.setScrollTop();
      },

      // 选择最优价
      selectZuiyoujia() {
        console.log("selectZuiyoujia选最优价", this.zuiyoujia);
        this.selectPartnerIndex = -1;
        this.currentOilType = 0;
        this.zindexStatus = 0;
        var changeDetailData = {};
        var oilOptions = this.zuiyoujia.priceList;
        var gunsList = this.zuiyoujia.priceList[this.currentOilType].gunNos;
        console.log("changeDetailData.oilNo===", this.changeDetailData.oilNo);
        for (var i = 0; i < oilOptions.length; i++) {
          if (oilOptions[i].oilNo == this.changeDetailData.oilNo) {
            console.log(
              "如果点击最优价时候，已选择的油号在最优价中的位置，取相关价格信息"
            );
            changeDetailData.oilName = oilOptions[i].oilName;
            changeDetailData.price = oilOptions[i].price;
            changeDetailData.priceGun = oilOptions[i].priceGun;
            changeDetailData.oilNo = oilOptions[i].oilNo;
            changeDetailData.latitude = oilOptions[i].latitude;
            changeDetailData.longitude = oilOptions[i].longitude;
            changeDetailData.isInvoice = oilOptions[i].isInvoice;
            changeDetailData.stationId = oilOptions[i].stationId;

            break;
          } else {
            console.log("最优价里没有选择的油号，价格信息,一般不会出现这种情况");
          }
        }
        console.log("选择最优价oilOptions===", oilOptions);
        console.log("选择最优价changeDetailData===", changeDetailData);
        this.changeDetailData = changeDetailData;
        this.oilOptions = oilOptions;
        this.gunsList = gunsList;
        this.oilGunText = "请与加油员确认油枪号";
        this.partnerName = this.zuiyoujia.partnerName; // 显示最优价服务商名称
        this.isShowPartner = false;
        this.wechatNoSecret = this.zuiyoujia.priceList[0].wechatNoSecret;
        this.alipayNoSecret = this.zuiyoujia.priceList[0].alipayNoSecret;
        this.weChatIsOpen = this.zuiyoujia.priceList[0].weChatIsOpen;
        this.alipayIsOpen = this.zuiyoujia.priceList[0].alipayIsOpen;
        this.isTuanYou = false; // 不能使用优惠券
        this.setScrollTop();
      },

      // 选择服务商
      selectPartner(index) {
        console.log("selectPartner===选择服务商e====");
        let clickPartnerindex = index;
        this.zindexStatus = 0;
        this.selectPartnerIndex = index;
        let clickPartner = this.partnerLists[clickPartnerindex];
        var changeDetailData = {};
        changeDetailData.latitude = clickPartner.latitude;
        changeDetailData.longitude = clickPartner.longitude;
        changeDetailData.isInvoice = clickPartner.isInvoice;
        changeDetailData.partnerCode = clickPartner.partnerCode;
        changeDetailData.partnerName = clickPartner.partnerName;

        console.log("选择服务商的索引===", clickPartnerindex);
        console.log("选择的服务商 === oilOptions是==", clickPartner);
        var isHaveInitOilNo = null; // 该服务商是否有初始化的油号

        // 如果是团油，才可以使用优惠券
        clickPartner.partnerCode == "tuanyou" && clickPartner.partnerId == "1"
          ? (this.isTuanYou = true)
          : (this.isTuanYou = false);

        let clickPartnerOilOptions = clickPartner.priceList;
        for (var i = 0; i < clickPartnerOilOptions.length; i++) {
          if (clickPartnerOilOptions[i].oilNo === this.changeDetailData.oilNo) {
            console.log("该服务商有初始化油号");
            isHaveInitOilNo = true;
            changeDetailData.oilNo = clickPartnerOilOptions[i].oilNo;
            changeDetailData.price = clickPartnerOilOptions[i].price;
            changeDetailData.priceGun = clickPartnerOilOptions[i].priceGun;
            changeDetailData.oilName = clickPartnerOilOptions[i].oilName;
            console.log("changeDetailData====", changeDetailData);
            break;
          } else {
            console.log("该服务商没有初始化油号");
            isHaveInitOilNo = false;
          }
        }
        if (!isHaveInitOilNo) {
          console.log("该服务商没有初始化油号,就使用该服务商下的第一个油号");
          changeDetailData.price = clickPartnerOilOptions[0].price;
          changeDetailData.priceGun = clickPartnerOilOptions[0].priceGun;
          changeDetailData.oilName = clickPartnerOilOptions[0].oilName;
          changeDetailData.oilNo = clickPartnerOilOptions[0].oilNo;
        }
        this.currentOilType = 0;
        const gunsList = clickPartnerOilOptions[this.currentOilType].gunNos;
        this.oilOptions = clickPartnerOilOptions;
        this.changeDetailData = changeDetailData;
        this.gunsList = gunsList;
        this.partnerName = clickPartner.partnerName; // 显示最优价服务商名称
        this.oilGunText = "请与加油员确认油枪号";
        this.isShowPartner = false;
        this.wechatNoSecret = clickPartner.wechatNoSecret;
        this.alipayNoSecret = clickPartner.alipayNoSecret;
        this.weChatIsOpen = clickPartner.weChatIsOpen;
        this.alipayIsOpen = clickPartner.alipayIsOpen;
        this.setScrollTop();
      },

      openOilMask() {
        this.getCurrentScrollTop();
        this.isMask = true;
        this.zindexStatus = 2;
        this.chooseOil(this.defaultOilNumber);
      },

      // 关闭油号选择蒙层
      closeOilMask() {
        this.isMask = false;
        this.zindexStatus = 0;
        this.setScrollTop();
      },

      // 选择油号
      chooseOil(index) {
        console.log(index, "iiiiiiiiiiiiii");
        this.currentOilType = index;
        this.defaultOilNumber = index;
        this.gunsList = this.oilOptions[this.currentOilType].gunNos;
        this.currentOilType = this.currentOilType;
      },

      // 选择油枪
      chooseGun(item) {
        console.log("eee选择油枪ee");
        const oilGunSelected = item;
        console.log("eee选择油抢oilGunSelected", oilGunSelected);
        const oilGunText = oilGunSelected || "请选择油枪号";
        const oilOptionSelected = this.oilOptions[this.currentOilType];
        this.isMask = false;
        this.zindexStatus = 0;
        this.oilGunText = oilGunText;
        this.changeDetailData.oilName = oilOptionSelected.oilName;
        this.changeDetailData.price = oilOptionSelected.price;
        this.changeDetailData.priceGun = oilOptionSelected.priceGun;
        this.changeDetailData.oilNo = oilOptionSelected.oilNo;
        this.oilNameSelected = oilOptionSelected.oilNo + "#"; // 用作埋点
        this.setPreferential();
        console.log(this.gunsList, this.oilGunText);
        this.setScrollTop();
      },
    },
  };
}
