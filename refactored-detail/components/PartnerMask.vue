<template>
  <!-- 服务商选择蒙版 -->
  <view
    class="partner-wrap-mask"
    :class="[themeStyle == 'dark' ? 'themeNight' : 'themeDay']"
  >
    <view class="partner-mask-close">
      <view class="icon-close">
        <view class="icon-close-image" @tap="$emit('close')" />
      </view>
      <view class="partner-mask-title"> 选择服务商 </view>
    </view>
    <view class="partner-mask-content">
      <view
        class="zuiyuojia-item partner-mask-content_item"
        :class="selectPartnerIndex == -1 ? 'partner-active' : ''"
        @tap="$emit('select-zuiyoujia')"
      >
        <view class="partner-logo-name">
          <view
            style="
              width: 64px;
              height: 64px;
              background: #ff6500;
              color: #fff;
              border-radius: 50%;
              font-size: 40px;
              text-align: center;
            "
          >
            惠
          </view>
          <view class="partner-name">
            {{ zuiyoujia.partnerName }}
          </view>
        </view>
        <view class="partner-item-wrap-out">
          <view
            v-for="(item, i) in zuiyoujia.priceList"
            :key="i"
            class="partner-item-wrap"
          >
            <view class="partner-item-oil">
              <view class="partner-item-oil-text">
                {{ item.oilName }}
              </view>
              <view class="partner-item-oil-text2">
                ({{ item.partnerName }})
              </view>
            </view>
            <view class="partner-item-price">
              <view class="item-price"> ¥{{ item.price }} </view>
              <view class="item-priceGun">
                <view>¥ {{ item.priceGun }}</view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 服务商列表 -->
      <view
        v-for="(partnerItem, partnerIndex) in partnerLists"
        :key="partnerIndex"
        class="partner-mask-item partner-item partner-mask-content_item"
        :class="selectPartnerIndex == partnerIndex ? 'partner-active' : ''"
        @tap="$emit('select-partner', partnerIndex)"
      >
        <view class="partner-logo-name">
          <image class="partner-logo" :src="partnerItem.logo" />
          <view class="partner-name">
            {{ partnerItem.partnerName }}
          </view>
        </view>
        <view class="messageContainer">
          <view v-if="partnerItem.isInvoice == 1" class="fapiao">
            支持电子发票
          </view>
          <view v-if="partnerItem.isInvoice != 1" class="fapiao" />
          <view v-if="partnerItem.couponCount > 0" class="hasCoupon" />
        </view>
        <view
          class="partner-item-wrap-out"
          :class="
            partnerItem.couponCount > 0 || partnerItem.isInvoice == 1
              ? 'partner-item-wrap-out1'
              : ''
          "
        >
          <view
            v-for="(priceItem, i) in partnerItem.priceList"
            :key="i"
            class="partner-item-wrap"
          >
            <view class="partner-item-oil">
              {{ priceItem.oilName }}
            </view>
            <view class="partner-item-price">
              <view class="item-price"> ¥ {{ priceItem.price }} </view>
              <view class="item-priceGun">
                <view>¥ {{ priceItem.priceGun }}</view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: "PartnerMask",
  props: {
    zuiyoujia: { type: Object, default: () => ({}) },
    partnerLists: { type: Array, default: () => [] },
    selectPartnerIndex: { type: Number, default: -1 },
    themeStyle: { type: String, default: "light" },
  },
};
</script>
