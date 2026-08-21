/**
 * useKeyboardInput - 键盘输入管理
 * 负责自定义数字键盘的输入逻辑
 */
import { commonUtils } from "./utils";

export function useKeyboardInput() {
  const state = {
    isInputMask: false,
    keyInputValue: "",
    currentInputType: null,
    inputTextClose: false,
  };

  const keyboardLayout = [
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
  ];

  /**
   * 打开键盘输入
   */
  function openInputMask(currentInputType, currentValue) {
    state.isInputMask = true;
    state.currentInputType = currentInputType;
    state.keyInputValue = currentValue ? String(currentValue) : "";
    state.inputTextClose = state.keyInputValue.length > 0;
  }

  /**
   * 点击键盘数字
   */
  function setInputValue(value, name) {
    let keyInputValue = String(state.keyInputValue);

    if (keyInputValue.includes(".") && name == ".") return;
    if (keyInputValue == "0" && name != ".") return;
    if (keyInputValue == "" && name == ".") return;

    if (Number(keyInputValue + name) > 10000) {
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

    state.keyInputValue = keyInputValue + name;
    state.inputTextClose = state.keyInputValue.length > 0;
  }

  /**
   * 删除最后一个字符
   */
  function deleteInputValue() {
    const value = String(state.keyInputValue);
    state.keyInputValue = value.substring(0, value.length - 1);
    state.inputTextClose = state.keyInputValue.length > 0;
  }

  /**
   * 清空输入
   */
  function clearInputValue() {
    state.keyInputValue = "";
    state.inputTextClose = false;
  }

  /**
   * 关闭键盘
   */
  function closeInputMask() {
    state.isInputMask = false;
    state.keyInputValue = "";
    state.inputTextClose = false;
  }

  return {
    state,
    keyboardLayout,
    openInputMask,
    setInputValue,
    deleteInputValue,
    clearInputValue,
    closeInputMask,
  };
}