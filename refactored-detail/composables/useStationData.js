/**
 * useStationData - 油站数据管理
 * 负责油站详情获取、数据处理、收藏操作
 */
import http from "@libs/http";
import base from "@libs/base";
import { commonUtils } from "./utils";

export function useStationData() {
  const state = {
    detailData: {},
    changeDetailData: {},
    detailDataLogo: "",
    loadError1: false,
    isLoad1: false,
    stationId: "",
  };

  /**
   * 获取油站详情
   */
  function getStationDetail(currentLocation, options) {
    const params = {
      appid: base.apiInfo.appId2,
      sign: "",
      data: {
        longitude: currentLocation.longitude,
        latitude: currentLocation.latitude,
        oilNo: options.oilNo,
        stationId: options.wtStationId,
      },
    };
    const optionsPost = {
      url: base.apiInfo.getStationDetail,
      data: params,
      method: "POST",
    };
    return http(optionsPost);
  }

  /**
   * 处理油站详情响应
   */
  function handleDetailInfo(res, callbacks) {
    const { onSuccess, onError, onTTS } = callbacks;

    if (res.data.code === "0000") {
      if (!res.data.data) {
        commonUtils.showToast("获取油站详情失败");
        return;
      }

      const detailData = {
        name: res.data.data.name,
        isCollection: res.data.data.isCollection,
        stationId: res.data.data.stationId,
        logo: res.data.data.logo,
        address: res.data.data.address,
        dist:
          res.data.data.dist > 1000
            ? (res.data.data.dist / 1000).toFixed(1) + "km"
            : (res.data.data.dist / 1).toFixed(0) + "m",
        price: res.data.data.price,
        priceGun: res.data.data.priceGun,
        liangbaiDiscount: (
          200 -
          (200 / res.data.data.priceGun) * res.data.data.price
        ).toFixed(2),
        sanbaiDiscount: (
          300 -
          (300 / res.data.data.priceGun) * res.data.data.price
        ).toFixed(2),
      };

      const changeDetailData = {
        price: res.data.data.price,
        priceGun: res.data.data.priceGun,
        oilName: res.data.data.oilName,
        oilNo: res.data.data.oilNo,
        latitude: res.data.data.latitude,
        longitude: res.data.data.longitude,
        isInvoice: res.data.data.isInvoice,
      };

      state.detailData = detailData;
      state.detailDataLogo = detailData.logo;
      state.changeDetailData = changeDetailData;
      state.stationId = res.data.data.stationId;

      if (onSuccess) onSuccess(detailData, changeDetailData);
      if (onTTS) onTTS(res);
    }
  }

  /**
   * 收藏/取消收藏油站
   */
  function storeStation(stationId, isCollection, onToggle) {
    const params = {
      appid: base.appInfo.appId2,
      sign: "",
      data: {
        stationId: stationId,
        type: "refuel",
      },
    };
    return http({
      url: base.apiInfo.collectOrCancel,
      data: params,
      isShowLoading: false,
      method: "POST",
    })
      .then((res) => {
        if (res.data.code == "0000") {
          const title = !isCollection ? "收藏成功" : "取消收藏";
          commonUtils.showToast(title);
          if (onToggle) onToggle();
        }
      })
      .catch(() => {
        commonUtils.showToast("收藏失败");
      });
  }

  return { state, getStationDetail, handleDetailInfo, storeStation };
}