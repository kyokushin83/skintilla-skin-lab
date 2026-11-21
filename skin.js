"use strict";

const SkinLab = (() => {
  const goals = {
    hydration: {label:"보습", ingredient:"글리세린 · 히알루론산", help:"수분감을 더하고 싶을 때 보습제 전성분에서 찾아보세요.", form:"보습 세럼 또는 로션", summary:"세안 후에는 보습제를 먼저 챙기고, 수분감이 더 필요할 때 아래 제형을 살펴보세요."},
    soothing: {label:"진정", ingredient:"판테놀", help:"피부가 예민하게 느껴질 때는 향료가 없는 단순한 보습 제형부터 살펴보세요.", form:"무향료 보습 로션", summary:"단계가 적은 루틴부터 시작해 보세요. 새 제품은 한 번에 하나씩 추가하면 사용감을 비교하기 쉬워요."},
    barrier: {label:"장벽 케어", ingredient:"세라마이드", help:"건조로 거칠게 느껴지는 부위에 쓰기 좋은 보습 크림을 살펴보세요.", form:"세라마이드 크림", summary:"세안 뒤 건조하거나 거친 부위에 보습제를 챙겨 바르는 것부터 시작해 보세요."},
    oil: {label:"가벼운 보습", ingredient:"글리세린", help:"번들거림이 신경 쓰이는 부위에는 가벼운 로션이나 젤 타입을 얇게 발라 보세요.", form:"가벼운 젤 로션", summary:"번들거리는 부위에는 얇게, 당기는 부위에는 조금 더 바르며 양을 조절해 보세요."},
  };
  const questions = [
    ["tight","세안 후 피부가 당기는 편인가요?"],
    ["shine","오후에 이마나 코가 번들거리나요?"],
    ["sting","새 화장품 사용 후 따갑게 느낀 적이 있나요?"],
    ["flush","피부에 붉은 기가 쉽게 올라오는 편인가요?"],
    ["rough","건조해서 각질이나 거친 부분이 신경 쓰이나요?"],
    ["priority","지금 가장 먼저 관리하고 싶은 고민은 무엇인가요?",[
      ["hydration","세안 후 당김과 수분 부족"],
      ["soothing","쉽게 붉어지거나 예민해지는 느낌"],
      ["barrier","건조한 각질과 거친 피부결"],
      ["oil","오후에 생기는 번들거림"],
    ]],
  ];

  function profile(answers) {
    const concern = answers.priority;
    const scores = {
      hydration: Number(answers.tight) * 2 + Number(answers.rough),
      soothing: Number(answers.sting) * 2 + Number(answers.flush),
      barrier: Number(answers.rough) * 2 + Number(answers.tight),
      oil: Number(answers.shine) * 3,
    };
    const ranked = Object.keys(scores).sort((a,b) => scores[b] - scores[a]);
    const related = ranked.find(key => key !== concern && scores[key] >= 3);
    const keys = related ? [concern, related] : [concern];
    const main = goals[concern];
    const sensitive = keys.includes("soothing") || Number(answers.sting) === 2;
    const dry = keys.includes("barrier") || Number(answers.rough) === 2;
    const oily = keys.includes("oil") || Number(answers.shine) === 2;
    const light = oily && !dry;
    const moisturizer = dry ? "보습 크림" : light ? "가벼운 젤 로션" : "보습 로션";
    const moisturizerType = dry ? "cream" : light ? "gel" : "lotion";
    const optionalSerum = keys.includes("hydration") && !sensitive;
    const base = [moisturizer, light
      ? "아침·저녁 하루 2회. 얼굴에 얇게 펴 바르고 부위별로 양을 조절해 주세요."
      : "아침·저녁 하루 2회. 세안 뒤 건조하게 느껴지는 부위부터 발라 보세요."];
    const serum = ["보습 세럼 (선택)", "추가한다면 저녁 하루 1회부터. 로션이나 크림 전에 사용하세요."];
    return {
      keys,
      main,
      sensitive,
      summary: main.summary,
      am: [["가벼운 세안","아침 1회. 미온수 또는 순한 세안제를 사용하세요."],base,["자외선 차단제","아침 마지막 단계. 야외에서는 제품 사용법에 따라 덧바르세요."]],
      pm: [["순한 세안제","저녁 1회. 선크림이나 메이크업을 부드럽게 씻어내세요."],...(optionalSerum ? [serum] : []),base],
      types: [moisturizerType,"sunscreen",...(optionalSerum ? ["serum"] : [])],
    };
  }

  // The sampled ellipse matches the framing guide shown on the original photo.
  function readPhoto(pixels, width, height) {
    let count = 0;
    let dark = 0;
    let bright = 0;
    let warmth = 0;
    const tones = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = ((x + .5) / width - .5) / .29;
        const dy = ((y + .5) / height - .5) / .34;
        if (dx * dx + dy * dy > 1) continue;
        const offset = (y * width + x) * 4;
        if (pixels[offset + 3] < 224) continue;
        const [r,g,b] = [pixels[offset],pixels[offset+1],pixels[offset+2]];
        const light = .2126*r + .7152*g + .0722*b;
        const tone = r - (g + b) / 2;
        count++;
        if (light < 45) dark++;
        if (light > 235) bright++;
        warmth += tone;
        tones.push(tone);
      }
    }
    if (!count || count < width * height * .2) return {quality:"중앙 영역이 비어 있어 사진을 비교하기 어려워요."};
    if (dark / count > .3) return {quality:"중앙이 어두워 색감을 비교하기 어려워요."};
    if (bright / count > .3) return {quality:"중앙이 밝게 노출되어 색감을 비교하기 어려워요."};
    tones.sort((a,b) => a - b);
    const spread = tones[Math.floor(count * .9)] - tones[Math.floor(count * .1)];
    return {
      quality:"중앙 영역의 밝기 분포를 확인했어요.",
      colors: warmth / count > 22 ? "중앙에 따뜻한 색조가 많이 보여요." : "중앙의 따뜻한 색조가 두드러지지 않아요.",
      variation: spread > 32 ? "샘플 영역 안의 색조 차이가 큰 편이에요." : "샘플 영역 안의 색조 차이가 작은 편이에요.",
    };
  }

  const productTypes = {serum:"세럼",lotion:"로션",gel:"젤 로션",cream:"크림",sunscreen:"자외선 차단제"};
  function validProduct(item) {
    if (!item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim()) return false;
    if (!Object.hasOwn(productTypes,item.type) || !Array.isArray(item.goals) || !item.goals.length ||
        !item.goals.every(key=>Object.hasOwn(goals,key)) || typeof item.published !== "boolean") return false;
    try { return new URL(item.url).protocol === "https:"; }
    catch { return false; }
  }
  function matchProducts(items, result) {
    return items.filter(item => validProduct(item) && item.published &&
      result.types.includes(item.type) && item.goals.some(key => result.keys.includes(key)));
  }
  return {goals,questions,profile,readPhoto,productTypes,validProduct,matchProducts};
})();
