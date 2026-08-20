// 油站详情数据：获取油站详情、收藏/取消收藏、导航、卡片收起/展开。
// 说明：本项目为 Vue2 选项式 API，故以「mixin 工厂」形式组织 composable——
// 每个 useXxx() 返回 { data, methods }，与组件实例合并后共享同一个 this，
// 因此本 composable 内可通过 this 访问其它 composable 或父组件声明的状态与方法。

import Taro from "@tarojs/taro";
import base from "@libs/base";
import http from "@libs/http";
import * as wt from "@libs/wt";
import utils from "@libs/utils";
import { commonUtils } from "./lib";

export default function useStationDetail() {
  return {
    data() {
      return {
        // 油站详情
        detailData: {},
        changeDetailData: {},
        detailDataLogo: "",
        detailDataOrigin: {}, // 油站经纬度以及名称，用作导航到该油站
        loadError1: false, // 油站详情接口请求是否成功
        isLoad1: false, // 初始化油站详情是否成功
        isOpen: true, // 油站卡片信息是否显示

        // 请求上下文
        options: {},
        currentLocation: null,
        stationId: "",
        pushNumber: 0,
        isLogin: false,
        initOilNo: null,
      };
    },
    methods: {
      init() {
        // 原代码 `console.log("initoptions", options)` 在声明前引用了 let 变量，
        // 依赖 Babel 降级为 var 时打印 undefined；此处改为 this.options 保留日志意图。
        console.log("initoptions", this.options);
        console.log("init===init==");
        let options = this.options;
        this.initOilNo = options.oilNo || "92";
        this.isLogin = true;
        // 获取油站详情
        this.getStationDetail();
        // 根据梧桐油站id获取对应的服务商，油号价格信息
        this.getPartnerOilList();
      },

      getStationDetail() {
        console.log("getStationDetail==获取油站详情");

        const params = {
          appid: base.apiInfo.appId2,
          sign: "",
          data: {
            longitude: this.currentLocation.longitude,
            latitude: this.currentLocation.latitude,
            oilNo: this.options.oilNo, // 从首页传递过来的油号
            stationId: this.options.wtStationId, // 从首页传递过来的油站id
          },
        };
        const optionsPost = {
          url: base.apiInfo.getStationDetail,
          data: params,
          method: "POST",
        };
        http(optionsPost)
          .then(this.handleDetailInfo)
          .catch((res) => {
            console.log("获取油站详情失败", res);
            commonUtils.showToast("获取油站详情失败");
            this.timeOut = true;
            if (!this.isLoad1) {
              console.log(
                "获取油站详情失败this.isLoad1,loadError1设置为true",
                this.isLoad1
              );
              this.loadError1 = true;
            }
          });
      },

      // 获取油站详情之后
      handleDetailInfo(res) {
        console.log("获取油站详情成功===load1");
        console.log(
          "handleDetailInfo-====handleDetailInfo获取油站详情成功之后的方法",
          res
        );
        this.timeOut = false;
        if (res.data.code === "0000") {
          console.log("油站详情处理方法 res.data.data===", res.data.data);
          if (!res.data.data) {
            console.log("!res.data.data");
            commonUtils.showToast("获取油站详情失败");
            return;
          }
          const detailData = {
            name: res.data.data.name,
            isCollection: res.data.data.isCollection,
            stationId: res.data.data.stationId,
            logo: res.data.data.logo,
            address: res.data.data.address, // 油站地址
            dist:
              res.data.data.dist > 1000
                ? (res.data.data.dist / 1000).toFixed(1) + "km"
                : (res.data.data.dist / 1).toFixed(0) + "m",
            price: res.data.data.price, // 最终价格
            priceGun: res.data.data.priceGun, // 油站价
            liangbaiDiscount: (
              200 -
              (200 / res.data.data.priceGun) * res.data.data.price
            ).toFixed(2),
            sanbaiDiscount: (
              300 -
              (300 / res.data.data.priceGun) * res.data.data.price
            ).toFixed(2),
          };
          var changeDetailData = {
            // 如果选择了其他服务商，这里面的价格，距离，经纬度也需要改变
            price: res.data.data.price, // 最终价格
            priceGun: res.data.data.priceGun, // 油站价
            oilName: res.data.data.oilName,
            oilNo: res.data.data.oilNo,
            latitude: res.data.data.latitude,
            longitude: res.data.data.longitude,
            isInvoice: res.data.data.isInvoice,
          };
          console.log("请求详情的时候this.data.oilNo==", this.oilNo);
          this.detailData = detailData;
          this.detailDataLogo = detailData.logo;
          this.changeDetailData = changeDetailData;
          this.stationId = res.data.data.stationId;
          !this.isLoad1 && this.inited1(); // 油站详情初始化成功
        }

        console.log(
          "获取详情成功之后，根据打开场景进行语音播报this.data.options" +
            JSON.stringify(this.options)
        );
        // 从系统消息弹窗打开
        if (
          typeof this.options !== "undefined" &&
          this.options.arrive !== "arrived" &&
          (this.options.openType == "click" || this.options.openType == "speech")
        ) {
          console.log(
            "如果arrive为空，并且opentype等于click或者speech 详情页符合推送条件，播报"
          );
          // 播报语音
          commonUtils.playTTS("您可以点击导航按钮前往油站享受优惠加油 ");
        } else if (
          typeof this.options !== "undefined" &&
          this.options.arrive === "arrived" &&
          (this.options.openType == "click" || this.options.openType == "speech")
        ) {
          console.log("到达油站围栏送推送打开");
          commonUtils.playTTS(
            "已到达加油站，完成加油后请在车机端输入金额享优惠支付"
          );
        } else {
          console.log("详情页不符合推送条件，不播报");
        }
      },

      inited1() {
        this.isLoad1 = true; // 初始化完成
        console.log("inited=====油站详情===this.isLoad", this.isLoad1);
      },

      storeStation(stationId) {
        console.log("点击收藏后者取消收藏接口", stationId);
        let _this = this;
        const params = {
          appid: base.appInfo.appId2,
          sign: "",
          data: {
            stationId: stationId, // 从首页传递过来的油站id
            type: "refuel",
          },
        };
        http({
          url: base.apiInfo.collectOrCancel,
          data: params,
          isShowLoading: false,
          method: "POST",
        })
          .then((res) => {
            console.log("收藏或取消收藏成功res===", res.data);
            if (res.data.code == "0000") {
              let title = !_this.detailData.isCollection
                ? "收藏成功"
                : "取消收藏";
              console.log("title=====", title);
              commonUtils.showToast(title);
            }
            _this.detailData.isCollection = !_this.detailData.isCollection;
          })
          .catch((err) => {
            console.log("收藏或取消收藏失败err===", err);
            commonUtils.showToast("收藏失败");
          });
      },

      openNavigation: utils.throttle(function () {
        console.log("detail==openNavigation===openNavigation");
        const changeDetailData = this.changeDetailData;
        const detailData = this.detailData;
        let latitude = changeDetailData.latitude + "";
        let longitude = changeDetailData.longitude + "";
        commonUtils.navigateMap({
          latitude: latitude, // gcj02坐标
          longitude: longitude, // gcj02坐标
          address: detailData.name, // 地址名字
        });
        // 上报埋点
        wt.report({
          event_id: "DetailPageNavigate",
          event_label: "openNavigation",
          properties: {
            event_desc: "选择支付方式",
            pushNumber: base.pushNumber,
            openType: base.globalData.openType,
            gps: {
              latitude: this.currentLocation.latitude,
              longitude: this.currentLocation.longitude,
            },
          },
        });
      }, 1500),

      // 收起油站信息
      shrink() {
        console.log("收起油站卡片");
        this.isOpen = false;
      },

      // 展开油站信息
      open() {
        this.isOpen = true;
      },
    },
  };
}
