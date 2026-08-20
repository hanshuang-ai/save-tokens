<template>
  <view class="login-input-wrapper">
    <view class="icon-key-close-wrapper">
      <view class="icon-key-close-container" @tap="$emit('close')">
        <view class="icon-key-close-image" />
      </view>
      <view class="EnterAmount"> 输入金额 </view>
    </view>

    <view class="login-input-title-container">
      <view class="login-input-title-container_">
        <view class="input-text-container">
          <view class="input-text-content">
            {{ keyInputValue }}
          </view>
        </view>
        <view v-show="inputTextClose" class="input-text-close">
          <view class="input-text-close-image" @tap="$emit('clear')" />
        </view>
      </view>
      <view
        class="key-confirm-button-wrapper flex-center"
        @tap="$emit('confirm')"
      >
        确定
      </view>
    </view>

    <view class="tips-wrapper">
      {{ tipsContent }}
    </view>

    <view class="keyboard-wrapper">
      <view
        class="keyboard-container"
        :class="verticalBig ? 'verticalBig' : 'verticalMini'"
      >
        <view v-for="(items, i) in keyboardValue" :key="i">
          <view
            v-if="items.value !== 'image'"
            :class="[
              items.value === '00'
                ? 'mt0 ml0 bg4F4F4F'
                : items.value === '20'
                ? 'ml22 mt0'
                : items.value === '01'
                ? 'ml0 mt14'
                : items.value === '21'
                ? 'ml22 mt14'
                : items.value === 'symbol'
                ? 'ml0 mt14 bgFFF01'
                : '',
            ]"
            class="keyboard-item-wrapper flex-center bg4F4F4F"
            @tap="$emit('set-input', items.value, items.name)"
          >
            {{ items.name }}
          </view>

          <view
            v-else
            class="keyboard-item-wrapper flex-center ml22 mt14 bg4F4F4F"
            @tap="$emit('delete')"
          >
            <view class="icon-delete-wrapper">
              <view class="icon-delete" />
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: "AmountKeyboard",
  props: {
    keyInputValue: { type: [String, Number], default: "" },
    inputTextClose: { type: Boolean, default: false },
    tipsContent: { type: String, default: "" },
    keyboardValue: { type: Array, default: () => [] },
    verticalBig: { type: Boolean, default: false },
  },
};
</script>
