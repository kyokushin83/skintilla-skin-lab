"use strict";

const $ = id => document.getElementById(id);
const photo = $("photo");
const preview = $("preview");
const survey = $("survey");
const result = $("result");
const uploadStatus = $("photo-status");
const steps = [...document.querySelectorAll(".steps li")];
const panes = [$("photo-step"),survey,result];
let previewUrl = "";
let photoReading = null;
let photoVersion = 0;
let includePhoto = false;

function showStep(index) {
  panes.forEach((pane,i) => { pane.hidden = i !== index; });
  steps.forEach((step,i) => {
    if (i === index) step.setAttribute("aria-current","step");
    else step.removeAttribute("aria-current");
  });
  panes[index].querySelector("h3").focus();
}

function clearPhoto() {
  photoVersion++;
  photoReading = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  preview.removeAttribute("src");
  $("portrait").hidden = true;
  $("photo-next").disabled = true;
  uploadStatus.textContent = "";
}

photo.addEventListener("change", async () => {
  clearPhoto();
  const file = photo.files[0];
  if (!file) return;
  if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
    uploadStatus.textContent = "10 MB 이하의 JPG, PNG 또는 WebP 사진을 선택해 주세요.";
    photo.value = "";
    return;
  }
  const version = photoVersion;
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  uploadStatus.textContent = "사진을 확인하고 있어요.";
  try {
    await preview.decode();
    if (version !== photoVersion) return;
    if (Math.min(preview.naturalWidth,preview.naturalHeight) < 120) throw new Error("Small image");
    const canvas = document.createElement("canvas");
    const scale = 144 / Math.max(preview.naturalWidth,preview.naturalHeight);
    canvas.width = Math.max(1,Math.round(preview.naturalWidth * scale));
    canvas.height = Math.max(1,Math.round(preview.naturalHeight * scale));
    const context = canvas.getContext("2d",{willReadFrequently:true});
    context.drawImage(preview,0,0,canvas.width,canvas.height);
    const {data} = context.getImageData(0,0,canvas.width,canvas.height);
    photoReading = SkinLab.readPhoto(data,canvas.width,canvas.height);
    $("portrait").hidden = false;
    $("photo-next").disabled = false;
    uploadStatus.textContent = "사진을 읽었어요. 얼굴이 점선 안에 있는지 확인해 주세요.";
  } catch {
    if (version !== photoVersion) return;
    clearPhoto();
    photo.value = "";
    uploadStatus.textContent = "사진을 읽을 수 없어요. 가로·세로 각각 120픽셀 이상인 다른 사진을 선택해 주세요.";
  }
});

for (const [key,prompt,choices = [["0","거의 없어요"],["1","가끔 있어요"],["2","자주 있어요"]]] of SkinLab.questions) {
  const group = document.createElement("fieldset");
  group.className = "question";
  const legend = document.createElement("legend");
  legend.textContent = prompt;
  const options = document.createElement("div");
  options.className = "choices";
  for (const [value,label] of choices) {
    const option = document.createElement("label");
    option.className = "choice";
    const input = document.createElement("input");
    input.className = "visually-hidden";
    input.type = "radio";
    input.name = key;
    input.value = value;
    input.required = true;
    const caption = document.createElement("span");
    caption.textContent = label;
    option.append(input,caption);
    options.append(option);
  }
  group.append(legend,options);
  $("questions").append(group);
}

$("photo-next").onclick = () => {
  if (!photoReading) return;
  includePhoto = true;
  showStep(1);
};
$("photo-skip").onclick = () => {
  clearPhoto();
  photo.value = "";
  includePhoto = false;
  showStep(1);
};
$("back").onclick = () => showStep(0);

function routine(title, steps) {
  return '<article class="result-card"><h4>'+title+'</h4><ol class="routine">'+steps.map(([name,note])=>'<li><strong>'+name+'</strong><span>'+note+'</span></li>').join("")+'</ol></article>';
}

function renderProducts(matches) {
  if (!matches.length) {
    $("matches").textContent = "현재 이 루틴에 연결된 출시 제품이 없어요. 위의 추천 성분과 제형을 참고해 제품을 골라 보세요.";
    return;
  }
  const grid = document.createElement("div");
  grid.className = "result-grid";
  for (const item of matches) {
    const card = document.createElement("article");
    card.className = "result-card";
    const heading = document.createElement("h4");
    heading.textContent = item.name;
    const details = document.createElement("p");
    details.textContent = [SkinLab.productTypes[item.type],...item.goals.map(key=>SkinLab.goals[key].label)].join(" · ");
    const link = document.createElement("a");
    link.href = item.url;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.textContent = "제품 보기 (새 탭)";
    card.append(heading,details,link);
    grid.append(card);
  }
  $("matches").append(grid);
}

survey.addEventListener("submit", event => {
  event.preventDefault();
  const profile = SkinLab.profile(Object.fromEntries(new FormData(survey)));
  const reading = includePhoto ? photoReading : null;
  const ingredients = profile.keys.map(key => SkinLab.goals[key]);
  result.innerHTML =
    '<p class="overline">MY SKIN ROUTINE</p><h3 id="result-title" tabindex="-1">'+profile.main.label+' 중심 루틴</h3>'+
    '<p>선택한 우선 고민과 최근 2주간 느낀 피부 상태를 바탕으로 구성했어요.</p>'+
    '<ul class="tags" aria-label="관리 포인트">'+ingredients.map(item=>'<li>'+item.label+'</li>').join("")+'</ul>'+
    (reading ? '<div class="result-block result-card"><h4>사진에서 확인한 내용</h4><p>'+[reading.quality,reading.colors,reading.variation].filter(Boolean).join(" ")+'</p><p class="small">조명, 촬영 각도, 화장에 따라 달라지는 이미지 관찰값이에요. 루틴은 설문을 바탕으로 안내해요.</p></div>' : '')+
    '<div class="result-block"><h4>살펴볼 성분과 제형</h4><div class="result-grid">'+ingredients.map(item=>'<article class="result-card"><h4>'+item.ingredient+'</h4><p><strong>'+item.form+'</strong></p><p>'+item.help+'</p></article>').join("")+'</div></div>'+
    '<div class="result-block"><h4>아침 · 저녁 사용 순서</h4><div class="result-grid">'+routine("AM · 아침",profile.am)+routine("PM · 저녁",profile.pm)+'</div>'+
    '<p class="small">위 횟수는 시작 가이드예요. 제품 표시를 먼저 확인하고, 새 제품은 작은 부위에서 사용감을 먼저 확인해 보세요.</p></div>'+
    '<div class="result-block result-card"><h4>부산 기장 해양원료</h4><p><strong>'+[...new Set(ingredients.map(item=>item.marine))].join(" · ")+'</strong></p><p>추천 고민과 연결해 살펴볼 SKINTILLA의 보습 제형 연구 후보예요.</p><a href="#marine">기장 해양원료 살펴보기</a></div>'+
    '<div class="result-block"><h4>SKINTILLA 출시 제품</h4><div id="matches"></div></div>'+
    '<div class="actions"><button id="edit" class="button outline">응답 수정</button><button id="restart" class="button plain">처음부터 다시</button></div>';
  renderProducts(SkinLab.matchProducts(window.SKINTILLA_PRODUCTS ?? [],profile));
  // Release the original photo once the observation has been shown.
  const retainedReading = photoReading;
  clearPhoto();
  photo.value = "";
  photoReading = retainedReading;
  $("edit").onclick = () => showStep(1);
  $("restart").onclick = () => {
    survey.reset();
    result.replaceChildren();
    clearPhoto();
    includePhoto = false;
    showStep(0);
  };
  showStep(2);
});
