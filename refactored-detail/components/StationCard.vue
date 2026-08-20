<template>
  <!-- 左侧油站卡片 -->
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
            backgroundImage: 'url(' + logo + ')',
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
            <view class="distance-container" @tap="$emit('navigate')">
              <image
                class="image-open-map"
                src="@static/images/navigation.png"
              />
              <view class="dist_dist">
                {{ detailData.dist }}
              </view>
            </view>
            <view
              class="store_container"
              @tap="$emit('collect', detailData.stationId)"
            >
              <image
                class="image-store"
                :src="
                  themeStyle == 'dark'
                    ? detailData.isCollection
                      ? star
                      : starNormal
                    : detailData.isCollection
                    ? star
                    : starNormalLight
                "
              />
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import star from "@static/images/star.png";
import starNormal from "@static/images/star-normal.png";
import starNormalLight from "@static/images/icon_star.png";

export default {
  name: "StationCard",
  props: {
    detailData: {
      type: Object,
      default: () => ({}),
    },
    changeDetailData: {
      type: Object,
      default: () => ({}),
    },
    logo: {
      type: String,
      default: "",
    },
    isOpen: {
      type: Boolean,
      default: true,
    },
    themeStyle: {
      type: String,
      default: "light",
    },
    horizontalBig: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      star,
      starNormal,
      starNormalLight,
    };
  },
};
</script>
