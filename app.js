"use strict";

const $ = id => document.getElementById(id);
const photo = $("photo");
const preview = $("preview");
const survey = $("survey");
const result = $("result");
const uploadStatus = $("photo-status");
const steps = [...document.querySelectorAll(".steps li")];
const panes = [$("photo-step"), survey, result];
const surveyOptions = [["0","거의 없었어요"],["1","가끔 있었어요"],["2","자주 있었어요"]];
const signalLabels = {tight:"세안 후 당김",shine:"오후 번들거림",sting:"제품 사용 후 따가움",flush:"쉽게 올라오는 붉은 기",rough:"각질·거칠음"};
const demoAnswers = {tight:"2",shine:"0",sting:"0",flush:"0",rough:"1",priority:"hydration"};
let answers = {};
let questionIndex = 0;
let activeStep = 0;
let example = false;
let previewUrl = "";
let photoReading = null;
let photoVersion = 0;

function showStep(index, {focus = true, scroll = true} = {}) {
  panes.forEach((pane,i) => { pane.hidden = i !== index; });
  steps.forEach((step,i) => {
    if (i === index) step.setAttribute("aria-current","step");
    else step.removeAttribute("aria-current");
  });
  if (!example) activeStep = index;
  if (focus) panes[index].querySelector("[tabindex='-1']")?.focus({preventScroll:true});
  if (scroll) document.querySelector(".wizard").scrollIntoView({block:"start"});
}

function clearUpload() {
  photoVersion++;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  preview.removeAttribute("src");
  $("portrait").hidden = true;
  $("upload-icon").hidden = false;
  $("photo-next").hidden = true;
  $("photo-next").textContent = "이 사진으로 계속";
  $("upload-label").textContent = "사진 선택하기";
  uploadStatus.textContent = "";
}

photo.addEventListener("change", async () => {
  clearUpload();
  photoReading = null;
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
    $("upload-icon").hidden = true;
    $("photo-next").hidden = false;
    $("upload-label").textContent = "다른 사진 선택";
    uploadStatus.textContent = "사진을 읽었어요. 얼굴이 타원 안에 들어오는지 확인해 주세요.";
  } catch {
    if (version !== photoVersion) return;
    clearUpload();
    photo.value = "";
    uploadStatus.textContent = "사진을 읽을 수 없어요. 가로·세로 각각 120픽셀 이상인 다른 사진을 선택해 주세요.";
  }
});

function renderQuestion() {
  const [key,prompt,choices = surveyOptions] = SkinLab.questions[questionIndex];
  const total = SkinLab.questions.length;
  $("question-count").textContent = `질문 ${questionIndex + 1} / ${total}`;
  $("question-progress").max = total;
  $("question-progress").value = questionIndex + 1;
  $("question-next").textContent = questionIndex + 1 === total ? "내 루틴 보기" : "다음 질문";
  $("back").textContent = questionIndex === 0 ? "사진 단계로" : "이전 질문";
  $("survey-status").textContent = "";
  const group = document.createElement("fieldset");
  group.className = "question";
  const legend = document.createElement("legend");
  legend.tabIndex = -1;
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
    input.checked = answers[key] === value;
    const caption = document.createElement("span");
    caption.textContent = label;
    option.append(input,caption);
    options.append(option);
  }
  group.append(legend,options);
  $("question").replaceChildren(group);
  showStep(1);
}

survey.addEventListener("change", event => {
  if (event.target.type !== "radio") return;
  answers[event.target.name] = event.target.value;
  $("survey-status").textContent = "";
});
survey.addEventListener("submit", event => {
  event.preventDefault();
  const [key] = SkinLab.questions[questionIndex];
  if (answers[key] === undefined) {
    $("survey-status").textContent = "가장 가까운 답을 하나 골라 주세요.";
    $("question").querySelector("input").focus({preventScroll:true});
    return;
  }
  if (questionIndex + 1 < SkinLab.questions.length) {
    questionIndex++;
    renderQuestion();
    return;
  }
  clearUpload();
  photo.value = "";
  renderResult(answers,photoReading);
});
$("photo-next").onclick = () => { if (photoReading) renderQuestion(); };
$("photo-skip").onclick = () => {
  clearUpload();
  photo.value = "";
  photoReading = null;
  renderQuestion();
};
$("back").onclick = () => {
  if (questionIndex === 0) {
    if (photoReading && !$("preview").hasAttribute("src")) {
      uploadStatus.textContent = "이전에 확인한 사진 관찰값을 이어서 사용할 수 있어요.";
      $("photo-next").textContent = "이전 사진 관찰값 사용";
      $("photo-next").hidden = false;
    }
    showStep(0);
    return;
  }
  questionIndex--;
  renderQuestion();
};

function routinePanel(label, routine) {
  const items = routine.map(([name,note])=>`<li><strong>${name}</strong><span>${note}</span></li>`).join("");
  return `<article class="result-card"><h4>${label}</h4><ol class="routine">${items}</ol></article>`;
}

function renderProducts(matches) {
  if (!matches.length) {
    const copy = document.createElement("p");
    copy.className = "empty-products";
    copy.textContent = "현재 내 루틴과 연결된 출시 제품이 없어요.";
    $("matches").append(copy);
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

function renderResult(input, reading) {
  const profile = SkinLab.profile(input);
  const ingredients = profile.keys.map(key=>SkinLab.goals[key]);
  const signals = Object.entries(signalLabels)
    .sort(([a],[b])=>Number(input[b])-Number(input[a]))
    .slice(0,3)
    .map(([key,label])=>`<li><strong>${label}</strong><span>${surveyOptions[Number(input[key])][1]}</span></li>`)
    .join("");
  result.innerHTML = `
    <div class="result-banner">
      <p class="eyebrow">${example ? "결과 예시" : "MY SKIN ROUTINE"}</p>
      <h3 id="result-title" tabindex="-1">${profile.main.label} 중심 루틴</h3>
      <p>${profile.summary}</p>
      ${example ? '<p class="caption">가상 응답으로 만든 예시입니다.</p>' : ""}
    </div>
    <section class="result-block" aria-labelledby="signal-title">
      <h4 id="signal-title">설문 응답 요약</h4>
      <ul class="signals">${signals}</ul>
    </section>
    <section class="result-block" aria-labelledby="routine-title">
      <h4 id="routine-title">아침·저녁 루틴</h4>
      <div class="result-grid">${routinePanel("AM · 아침",profile.am)}${routinePanel("PM · 저녁",profile.pm)}</div>
      <p class="caption routine-note">횟수는 시작 가이드예요. 제품에 적힌 사용법을 먼저 확인해 주세요.</p>
    </section>
    <section class="result-block" aria-labelledby="ingredients-title">
      <h4 id="ingredients-title">살펴볼 성분과 제형</h4>
      <div class="result-grid">${ingredients.map(item=>`<article class="result-card"><span class="label">${item.label}</span><h4>${item.ingredient}</h4><p><strong>${item === SkinLab.goals.hydration && profile.sensitive ? "보습 로션 또는 크림" : item.form}</strong></p><p>${item.help}</p></article>`).join("")}</div>
    </section>
    ${reading ? `<details class="result-block result-card photo-details"><summary><strong>사진에서 확인한 내용</strong></summary><p>${[reading.quality,reading.colors,reading.variation].filter(Boolean).join(" ")}</p><p class="caption">조명과 촬영 조건에 따라 달라지는 참고 정보예요. 루틴은 설문을 바탕으로 안내해요.</p></details>` : ""}
    <section class="result-block" aria-labelledby="matches-title"><h4 id="matches-title">SKINTILLA 출시 제품</h4><div id="matches"></div></section>
    <div class="actions">${example
      ? '<a class="button button-dark" id="example-start" href="#lab">내 루틴 찾기</a>'
      : '<button class="button button-outline" id="edit" type="button">응답 수정</button><button class="button button-text" id="restart" type="button">처음부터 다시</button>'}</div>`;
  renderProducts(SkinLab.matchProducts(window.SKINTILLA_PRODUCTS ?? [],profile));
  if (example) $("example-start").onclick = startTest;
  else {
    $("edit").onclick = () => {
      questionIndex = 0;
      renderQuestion();
    };
    $("restart").onclick = () => {
      answers = {};
      questionIndex = 0;
      photoReading = null;
      photo.value = "";
      clearUpload();
      result.replaceChildren();
      showStep(0);
    };
  }
  showStep(2);
}

function startTest(event) {
  event.preventDefault();
  if (location.hash !== "#lab") history.pushState(null,"","#lab");
  if (example) {
    example = false;
    if (activeStep === 2) {
      renderResult(answers,photoReading);
      return;
    }
  }
  showStep(activeStep);
}

for (const control of document.querySelectorAll("[data-start]")) control.onclick = startTest;
$("show-example").onclick = event => {
  event.preventDefault();
  if (location.hash !== "#lab") history.pushState(null,"","#lab");
  example = true;
  renderResult(demoAnswers,null);
};
