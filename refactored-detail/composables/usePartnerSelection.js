/**
 * usePartnerSelection - 服务商选择管理
 * 负责服务商列表获取、最优价筛选、服务商切换
 */
import http from "@libs/http";
import base from "@libs/base";

export function usePartnerSelection() {
  const state = {
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
    isLoad2: false,
  };

  /**
   * 获取服务商油号列表
   */
  function getPartnerOilList(stationId) {
    const params = {
      appid: base.appInfo.appId2,
      sign: "",
      data: {
        stationId: stationId,
      },
    };
    const optionsPost = {
      url: base.apiInfo.partnerOilList,
      data: params,
      method: "POST",
    };
    return http(optionsPost);
  }

  /**
   * 处理服务商信息响应
   */
  function handlePartnerInfo(res, initOilNo, currentOilNo) {
    if (
      res.data.code === "0000" ||
      (res.data.code === null && res.data.code instanceof Array)
    ) {
      let targetOilType = 0;
      const zuiyoujia = res.data.data[0];

      res.data.data &&
        res.data.data.forEach((item) => {
          item.priceList &&
            item.priceList.forEach((inneritem, innerindex) => {
              inneritem.gunNos =
                inneritem.gunNos && inneritem.gunNos.split(",");
              if (inneritem.oilNo == initOilNo) {
                targetOilType = innerindex;
              }
            });
        });

      const oilOptions = [...res.data.data[0].priceList];
      const gunsList = oilOptions[targetOilType].gunNos;
      const stationLists = res.data.data.filter((_, index) => index !== 0);

      oilOptions.forEach((item, index) => {
        if (item.oilNo == currentOilNo) {
          state.defaultOilNumber = index;
        }
      });

      state.currentOilType = targetOilType;
      state.zuiyoujia = zuiyoujia;
      state.partnerName = zuiyoujia.partnerName;
      state.partnerLists = stationLists;
      state.oilOptions = oilOptions;
      state.gunsList = gunsList;
      state.wechatNoSecret = zuiyoujia.priceList[0].wechatNoSecret;
      state.alipayNoSecret = zuiyoujia.priceList[0].alipayNoSecret;
      state.weChatIsOpen = zuiyoujia.priceList[0].weChatIsOpen;
      state.alipayIsOpen = zuiyoujia.priceList[0].alipayIsOpen;
      state.selectPartnerIndex = -1;
      state.isTuanYou = false;
    }
  }

  /**
   * 选择最优价
   */
  function selectZuiyoujia(currentOilNo) {
    state.selectPartnerIndex = -1;
    state.currentOilType = 0;
    const oilOptions = state.zuiyoujia.priceList;
    const gunsList = oilOptions[0].gunNos;

    let changeDetailData = {};
    for (let i = 0; i < oilOptions.length; i++) {
      if (oilOptions[i].oilNo == currentOilNo) {
        changeDetailData = {
          oilName: oilOptions[i].oilName,
          price: oilOptions[i].price,
          priceGun: oilOptions[i].priceGun,
          oilNo: oilOptions[i].oilNo,
          latitude: oilOptions[i].latitude,
          longitude: oilOptions[i].longitude,
          isInvoice: oilOptions[i].isInvoice,
          stationId: oilOptions[i].stationId,
        };
        break;
      }
    }

    state.partnerName = state.zuiyoujia.partnerName;
    state.wechatNoSecret = state.zuiyoujia.priceList[0].wechatNoSecret;
    state.alipayNoSecret = state.zuiyoujia.priceList[0].alipayNoSecret;
    state.weChatIsOpen = state.zuiyoujia.priceList[0].weChatIsOpen;
    state.alipayIsOpen = state.zuiyoujia.priceList[0].alipayIsOpen;
    state.isTuanYou = false;

    return { changeDetailData, oilOptions, gunsList };
  }

  /**
   * 选择特定服务商
   */
  function selectPartner(index, currentOilNo) {
    state.selectPartnerIndex = index;
    const clickPartner = state.partnerLists[index];

    const isTuanYou =
      clickPartner.partnerCode == "tuanyou" && clickPartner.partnerId == "1";
    state.isTuanYou = isTuanYou;

    let changeDetailData = {
      latitude: clickPartner.latitude,
      longitude: clickPartner.longitude,
      isInvoice: clickPartner.isInvoice,
      partnerCode: clickPartner.partnerCode,
      partnerName: clickPartner.partnerName,
    };

    const clickPartnerOilOptions = clickPartner.priceList;
    let isHaveInitOilNo = false;

    for (let i = 0; i < clickPartnerOilOptions.length; i++) {
      if (clickPartnerOilOptions[i].oilNo === currentOilNo) {
        isHaveInitOilNo = true;
        changeDetailData.oilNo = clickPartnerOilOptions[i].oilNo;
        changeDetailData.price = clickPartnerOilOptions[i].price;
        changeDetailData.priceGun = clickPartnerOilOptions[i].priceGun;
        changeDetailData.oilName = clickPartnerOilOptions[i].oilName;
        break;
      }
    }

    if (!isHaveInitOilNo) {
      changeDetailData.price = clickPartnerOilOptions[0].price;
      changeDetailData.priceGun = clickPartnerOilOptions[0].priceGun;
      changeDetailData.oilName = clickPartnerOilOptions[0].oilName;
      changeDetailData.oilNo = clickPartnerOilOptions[0].oilNo;
    }

    state.currentOilType = 0;
    const gunsList = clickPartnerOilOptions[0].gunNos;
    state.partnerName = clickPartner.partnerName;
    state.wechatNoSecret = clickPartner.wechatNoSecret;
    state.alipayNoSecret = clickPartner.alipayNoSecret;
    state.weChatIsOpen = clickPartner.weChatIsOpen;
    state.alipayIsOpen = clickPartner.alipayIsOpen;

    return { changeDetailData, oilOptions: clickPartnerOilOptions, gunsList };
  }

  return {
    state,
    getPartnerOilList,
    handlePartnerInfo,
    selectZuiyoujia,
    selectPartner,
  };
}