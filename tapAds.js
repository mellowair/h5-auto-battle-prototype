const AD_UNIT_ID = "1054324";

export function createRewardedAd(getTap = () => globalThis.tap) {
  let ad = null;
  let pending = null;
  const finish = (rewarded) => {
    if (!pending) return;
    const callbacks = pending;
    pending = null;
    if (rewarded) callbacks.onReward();
    else callbacks.onFailure();
  };
  return {
    init() {
      if (ad) return true;
      const tap = getTap();
      if (typeof tap?.createRewardedVideoAd !== "function") return false;
      ad = tap.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
      ad.onClose((result) => finish(result?.isEnded === true));
      ad.onError((error) => console.warn("[TapTap Ads] 激励视频错误", error));
      Promise.resolve().then(() => ad.load()).catch((error) => console.warn("[TapTap Ads] 预加载失败", error));
      return true;
    },
    show(onReward, onFailure) {
      if (!this.init() || pending) return false;
      pending = { onReward, onFailure };
      Promise.resolve().then(() => ad.show()).catch(() =>
        Promise.resolve().then(() => ad.load()).then(() => ad.show()).catch(() => finish(false))
      );
      return true;
    },
  };
}

export const rewardedAd = createRewardedAd();
