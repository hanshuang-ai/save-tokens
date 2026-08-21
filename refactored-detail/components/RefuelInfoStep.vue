<template>
  <view class="operationMain">
    <!-- 步骤指示 -->
    <view class="top">
      <view class="icon_container">
        <view :class="!isStep1 ? 'ash' : ''"> 加油信息 </view>
        <view
          class="stepsProgress"
          :class="isStep1 ? 'isStep1' : 'notStep1'"
        />
        <view :class="isStep1 ? 'ash' : ''"> 金额信息 </view>
      </view>
    </view>

    <!-- 选择操作区 -->
    <view>
      <!-- 服务商 -->
      <view class="oil-partner-options-container" @tap="$emit('openPartnerMask')">
        <view class="oil-partner-text-description">
          <view class="text-select-partner-type avtive">
            {{ partnerName }}
          </view>
        </view>
        <view class="support-invoice-icon">
          <view
            :class="changeDetailData.isInvoice == 1 ? '' : 'avtive111'"
            class="is-support-invoice"
          >
            支持开电子发票
          </view>
          <view class="icon-select-type-container">
            <image
              class="icon-select-type"
              :src="rightIcon"
            />
          </view>
        </view>
      </view>

      <!-- 油号 -->
      <view class="oil-gun-wrapper">
        <view class="oil-gun-options-container" @tap="$emit('openOilMask')">
          <view class="oil-gun-text-description">
            <view class="text-select-gun-type avtive">
              {{ changeDetailData.oilName }}-
            </view>
            <view
              class="text-contact111"
              :class="oilGunText == '请与加油员确认油枪号' ? '' : 'avtive'"
              style="margin-left: 10Px;"
            >
              {{ oilGunText == "请与加油员确认油枪号" ? "" : "" + oilGunText }}
            </view>
          </view>
          <view class="ConfirmTheOilGunNumber">
            <view
              :class="oilGunText == '请与加油员确认油枪号' ? '' : 'avtive111'"
              class="text-contact"
            >
              请与加油员确认油枪号
            </view>
            <view class="icon-select-type-container">
              <image
                class="icon-select-type"
                :src="rightIcon"
              />
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 下一步 -->
    <view class="nextStep" @tap="$emit('nextStep')"> 下一步 </view>
  </view>
</template>

<script>
export default {
  name: "RefuelInfoStep",
  props: {
    partnerName: { type: String, default: "" },
    changeDetailData: { type: Object, default: () => ({}) },
    oilGunText: { type: String, default: "请与加油员确认油枪号" },
    rightIcon: { type: String, default: "" },
    isStep1: { type: Boolean, default: true },
  },
  emits: ["openPartnerMask", "openOilMask", "nextStep"],
};
</script>