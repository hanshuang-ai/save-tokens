/**
 * usePriceCalculation - 价格计算管理
 * 负责金额计算、优惠价格、快捷金额设置
 */
export function usePriceCalculation() {
  const state = {
    totalPrice: 0,
    inputTotalPriceValue: null,
    inputTotalPriceSheng: "",
    inputTotalPriceFinal: "",
    inputTotalPriceDiscount: "",
    payAmount: 0,
  };

  /**
   * 计算优惠价格
   */
  function setPreferential(account, changeDetailData, detailData) {
    const price = changeDetailData.price || 1;
    const priceGun = changeDetailData.priceGun || 1;

    state.totalPrice = account;
    state.inputTotalPriceSheng = (account / price).toFixed(1);
    state.inputTotalPriceFinal = (
      (account / priceGun) *
      price
    ).toFixed(2);
    state.inputTotalPriceDiscount = (
      account -
      (account / priceGun) * price
    ).toFixed(2);

    if (detailData) {
      detailData.liangbaiDiscount = (
        200 -
        (200 / priceGun) * price
      ).toFixed(2);
      detailData.sanbaiDiscount = (
        300 -
        (300 / priceGun) * price
      ).toFixed(2);
    }

    state.payAmount = state.inputTotalPriceFinal;
  }

  /**
   * 快捷金额选择
   */
  function setOilPrice(account, changeDetailData, detailData) {
    state.inputTotalPriceValue = account;
    setPreferential(account, changeDetailData, detailData);
  }

  /**
   * 键盘输入确认金额
   */
  function confirmInputValue(keyInputValue, changeDetailData, detailData) {
    const inputTotalPriceValue = keyInputValue
      ? String(keyInputValue - 0)
      : "";
    const priceGun = detailData.priceGun || 1;
    const price = detailData.price || 1;
    const changePriceGun = changeDetailData.priceGun || 1;
    const changePrice = changeDetailData.price || 1;

    state.inputTotalPriceValue = inputTotalPriceValue;
    state.inputTotalPriceSheng = (inputTotalPriceValue / priceGun).toFixed(1);
    state.inputTotalPriceFinal = (
      (inputTotalPriceValue / changePriceGun) *
      changePrice
    ).toFixed(2);
    state.inputTotalPriceDiscount = (
      inputTotalPriceValue -
      (inputTotalPriceValue / priceGun) * price
    ).toFixed(2);
    state.totalPrice = keyInputValue;
    state.payAmount = state.inputTotalPriceFinal;
  }

  return { state, setPreferential, setOilPrice, confirmInputValue };
}