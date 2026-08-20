<template>
  <!-- 油枪油号选择页面 -->
  <view
    class="choose-gun-oil-wrap"
    :class="[themeStyle == 'dark' ? 'themeNight' : 'themeDay']"
  >
    <!-- 标题 -->
    <view class="oil-condition-title">
      <view class="icon-close">
        <view class="icon-close-image" @tap="$emit('close')" />
      </view>
      <view class="text-title"> 选择油号油枪 </view>
    </view>
    <view class="oil-guns-wrap">
      <!-- 油号 -->
      <view class="choose-oil-wrap">
        <view class="choose-oil-title"> 油号 </view>
        <view class="choose-oil-items">
          <wt-list-scroll-column
            :list-data="oilOptions"
            :is-scroll="false"
            :card-min-width="200"
          >
            <template #cardContent="{ cardData, cardIndex }">
              <view
                class="choose-oil-item"
                :class="[
                  currentOilType == cardIndex ? 'choose-oil-item_' : '',
                ]"
                @tap="$emit('choose-oil', cardIndex)"
              >
                {{ cardData.oilName }}
              </view>
            </template>
          </wt-list-scroll-column>
        </view>
      </view>
      <!-- 油枪 -->
      <view class="choose-gun-wrap">
        <view class="choose-guns-title"> 油枪号 </view>
        <view class="choose-guns-items">
          <wt-list-scroll-column
            :is-scroll="false"
            :list-data="gunsList"
            :card-min-width="200"
          >
            <template #cardContent="{ cardData }">
              <view
                class="choose-guns-item"
                :class="oilGunText == cardData ? 'active123' : ''"
                @tap="$emit('choose-gun', cardData)"
              >
                {{ cardData }}
              </view>
            </template>
          </wt-list-scroll-column>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import WtListScrollColumn from "../../../../WT-UI/packages/wt-list-scroll-column/wt-list-scroll-column.vue";

export default {
  name: "OilGunMask",
  components: {
    WtListScrollColumn,
  },
  props: {
    oilOptions: { type: Array, default: () => [] },
    gunsList: { type: Array, default: () => [] },
    currentOilType: { type: Number, default: 0 },
    oilGunText: { type: String, default: "请与加油员确认油枪号" },
    themeStyle: { type: String, default: "light" },
  },
};
</script>
