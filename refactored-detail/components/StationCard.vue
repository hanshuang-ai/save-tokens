<template>
  <view class="station-item-wrapper">
    <view class="gas-station-item-box">
      <view
        v-if="detailData.name && isOpen"
        class="gas-station-item"
        :class="horizontalBig ? 'gas-station-item-horizontalBig' : ''"
      >
        <view
          class="station-big-image-wrapper"
          :style="{
            backgroundImage: 'url(' + detailDataLogo + ')',
            backgroundSize: 'cover',
          }"
        />
        <view class="gas-station-item-right">
          <view class="gas-station-title">
            <view class="gas-station-name">
              {{ detailData.name }}
            </view>
          </view>
          <view class="oil-price-container">
            <view class="oil-current-price">
              ¥ {{ changeDetailData.price }}
            </view>
            <view class="international-oil-price">
              ¥{{ changeDetailData.priceGun }}
            </view>
          </view>
          <view class="place-distance-container">
            <view class="place-container">
              {{ detailData.address }}
            </view>
          </view>
          <view class="navigate-store">
            <view class="distance-container" @tap="onNavigate">
              <image
                class="image-open-map"
                src="@static/images/navigation.png"
              />
              <view class="dist_dist">
                {{ detailData.dist }}
              </view>
            </view>
            <view class="store_container" @tap="onStore">
              <image
                class="image-store"
                :src="starIcon"
              />
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: "StationCard",
  props: {
    detailData: { type: Object, default: () => ({}) },
    changeDetailData: { type: Object, default: () => ({}) },
    detailDataLogo: { type: String, default: "" },
    isOpen: { type: Boolean, default: true },
    horizontalBig: { type: Boolean, default: false },
    starIcon: { type: String, default: "" },
  },
  methods: {
    onNavigate() {
      this.$emit("navigate");
    },
    onStore() {
      this.$emit("store", this.detailData.stationId);
    },
  },
};
</script>