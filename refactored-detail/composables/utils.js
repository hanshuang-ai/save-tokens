/**
 * 条件导入 commonUtils - 兼容 dsBridge 和非 dsBridge 环境
 * 在原始项目中，commonUtils 的导入路径取决于 window.dsBridge.isDsBridge
 */
let commonUtils;
if (typeof window !== "undefined" && window.dsBridge && window.dsBridge.isDsBridge) {
  commonUtils = require("@libs/wtNew");
} else {
  commonUtils = require("@libs/common");
}

export { commonUtils };