// 统一的条件依赖注入。
// 原 detail.vue 在模块顶层根据 window.dsBridge.isDsBridge 动态 require 不同实现，
// 抽到此处避免在每个 composable / 组件里重复这段判断逻辑。

let commonUtils;
let checkAndLogin;

if (window.dsBridge.isDsBridge) {
  commonUtils = require("@libs/wtNew");
} else {
  commonUtils = require("@libs/common");
}

if (window.dsBridge.isDsBridge) {
  checkAndLogin = require("@libs/loginnew");
} else {
  checkAndLogin = require("@libs/login");
}

export { commonUtils, checkAndLogin };
