"use strict";

const $ = id => document.getElementById(id);
const form = $("product-form");
const status = $("admin-status");
const edits = (window.SKINTILLA_PRODUCTS ?? []).filter(SkinLab.validProduct);
let editingId = null;

for (const [key,label] of Object.entries(SkinLab.productTypes)) $("type").add(new Option(label,key));
for (const [key,goal] of Object.entries(SkinLab.goals)) {
  const label = document.createElement("label");
  label.className = "check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = "goal";
  input.value = key;
  label.append(input,goal.label);
  $("goals").append(label);
}

function resetForm() {
  form.reset();
  editingId = null;
  $("cancel").hidden = true;
}

function render() {
  $("empty").hidden = edits.length > 0;
  $("products").replaceChildren();
  for (const item of edits) {
    const row = document.createElement("li");
    const title = document.createElement("span");
    title.textContent = item.name + " · " + SkinLab.productTypes[item.type] + (item.published ? " · 출시" : " · 초안");
    const controls = document.createElement("div");
    const edit = document.createElement("button");
    edit.className = "button plain";
    edit.textContent = "편집";
    edit.setAttribute("aria-label",item.name+" 편집");
    edit.onclick = () => {
      resetForm();
      editingId = item.id;
      $("name").value = item.name;
      $("type").value = item.type;
      $("url").value = item.url;
      $("published").checked = item.published;
      for (const input of form.querySelectorAll("[name=goal]")) input.checked = item.goals.includes(input.value);
      $("cancel").hidden = false;
      $("name").focus();
    };
    const remove = document.createElement("button");
    remove.className = "button plain";
    remove.textContent = "삭제";
    remove.setAttribute("aria-label",item.name+" 삭제");
    remove.onclick = () => {
      if (!window.confirm(item.name+"을 편집 목록에서 삭제할까요?")) return;
      const index = edits.findIndex(entry=>entry.id === item.id);
      if (index !== -1) edits.splice(index,1);
      if (editingId === item.id) resetForm();
      render();
      $("export").focus();
      status.textContent = "목록에서 삭제했어요.";
    };
    controls.append(edit,remove);
    row.append(title,controls);
    $("products").append(row);
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const item = {
    id: editingId ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    name: $("name").value.trim(),
    type: $("type").value,
    url: $("url").value.trim(),
    goals: new FormData(form).getAll("goal"),
    published: $("published").checked,
  };
  if (!SkinLab.validProduct(item)) {
    status.textContent = "제품명과 HTTPS 주소를 확인하고 피부 고민을 한 개 이상 선택해 주세요.";
    return;
  }
  const index = edits.findIndex(entry=>entry.id === item.id);
  if (index === -1) edits.push(item);
  else edits[index] = item;
  resetForm();
  render();
  status.textContent = "목록에 저장했어요. 페이지를 닫기 전에 파일을 내려받아 주세요.";
});

$("cancel").onclick = () => {
  resetForm();
  $("name").focus();
};

$("export").onclick = () => {
  // Drafts remain in the editor. A public catalog only contains released products.
  const data = JSON.stringify(edits.filter(item=>item.published),null,2);
  const url = URL.createObjectURL(new Blob(["window.SKINTILLA_PRODUCTS = "+data+";\n"],{type:"text/javascript"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = "products.js";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
  status.textContent = "출시 상태인 제품만 카탈로그 파일에 담았어요.";
};

render();
