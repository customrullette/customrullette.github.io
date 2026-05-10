const STORAGE_KEY = "thecustomRouletteConfig.v1";
const MIN_ROWS = 2;
const MAX_ROWS = 24;
const SPIN_DURATION = 7200;
// 룰렛 조각의 기준 각도입니다.
// CSS conic-gradient, ? 라벨, 당첨 위치 계산이 모두 이 값을 같이 사용해야
// 설정 색상과 실제로 멈춘 칸 색상이 어긋나지 않습니다.
const WHEEL_START_DEG = 0;

const PALETTE = [
  { key: "yellow", color: "#f5c21b", label: "매우 낮은 확률", short: "전설 (노랑)" },
  { key: "red", color: "#d73931", label: "낮은 확률", short: "희귀 (빨강)" },
  { key: "purple", color: "#9145bd", label: "보통 낮은 확률", short: "영웅 (보라)" },
  { key: "navy", color: "#06224c", label: "보통 확률", short: "레어 (남색)" },
  { key: "sky", color: "#55ace3", label: "보통 높은 확률", short: "고급 (하늘색)" },
  { key: "green", color: "#49a832", label: "높은 확률", short: "일반 (초록)" },
  { key: "white", color: "#f4f0e7", label: "매우 높은 확률", short: "일반 (흰색)" },
];

const DEFAULT_CONFIG = {
  updatedAt: null,
  items: [
    { name: "황금 상품권 5만원", probability: 20 },
    { name: "프리미엄 무선 이어폰", probability: 20 },
    { name: "고급 게이밍 키보드", probability: 15 },
    { name: "백화점 상품권 3만원", probability: 15 },
    { name: "스타벅스 기프티콘", probability: 10 },
    { name: "편의점 모바일 상품권", probability: 10 },
    { name: "꽝! 다음 기회에", probability: 10 },
  ],
};

let currentRotation = 0;
let audioContext = null;
let tickTimer = null;
let isSpinning = false;

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function sanitizeProbabilityInput(value) {
  let cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  const [integerPart, decimalPart] = cleaned.split(".");
  const safeInteger = integerPart.slice(0, 3);
  if (decimalPart === undefined) return safeInteger;
  return `${safeInteger}.${decimalPart.slice(0, 2)}`;
}

function sanitizeProbability(value) {
  const cleaned = sanitizeProbabilityInput(value);
  if (cleaned === "" || cleaned === ".") return 0;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number * 100) / 100);
}

function formatPercent(value) {
  const number = sanitizeProbability(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function isTotalValid(total) {
  return Math.abs(total - 100) < 0.0001;
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.items) || parsed.items.length < MIN_ROWS) throw new Error("Invalid config");
    const items = parsed.items.slice(0, MAX_ROWS).map((item, index) => ({
      name: String(item.name || `상품 ${index + 1}`).trim() || `상품 ${index + 1}`,
      probability: clampNumber(sanitizeProbability(item.probability), 0, 100),
    }));
    return { updatedAt: parsed.updatedAt || null, items };
  } catch (error) {
    console.warn("설정 로드 실패, 기본값 사용:", error);
    return structuredClone(DEFAULT_CONFIG);
  }
}

function saveConfig(config) {
  const safeConfig = {
    updatedAt: new Date().toISOString(),
    items: config.items.map((item, index) => ({
      name: String(item.name || `상품 ${index + 1}`).trim(),
      probability: sanitizeProbability(item.probability),
    })),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeConfig));
  return safeConfig;
}

function getTotal(items) {
  return Math.round(items.reduce((sum, item) => sum + sanitizeProbability(item.probability), 0) * 100) / 100;
}

function assignPalette(items) {
  const probabilities = items.map((item) => sanitizeProbability(item.probability));
  const uniqueProbabilities = [...new Set(probabilities)].sort((a, b) => a - b);
  const lastRank = Math.max(1, uniqueProbabilities.length - 1);

  return items.map((item) => {
    const probability = sanitizeProbability(item.probability);
    const rank = uniqueProbabilities.indexOf(probability);
    const paletteIndex = uniqueProbabilities.length === 1
      ? PALETTE.length - 1
      : Math.round((rank * (PALETTE.length - 1)) / lastRank);
    return {
      ...item,
      probability,
      palette: PALETTE[paletteIndex],
    };
  });
}

function buildLegend() {
  const legend = document.getElementById("legendList");
  if (!legend) return;
  legend.innerHTML = PALETTE.map((entry) => `
    <div class="legend-item">
      <span class="color-dot" style="background:${entry.color}"></span>
      <span>${entry.label}</span>
    </div>
  `).join("");
}

function renderItemProbabilityList(config) {
  const list = document.getElementById("itemProbabilityList");
  if (!list) return;

  const colored = assignPalette(config.items);
  const sorted = colored
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => sanitizeProbability(a.probability) - sanitizeProbability(b.probability) || a.index - b.index);

  list.innerHTML = sorted.map((item) => `
    <div class="item-probability-row">
      <span class="color-dot" style="background:${item.palette.color}"></span>
      <strong>${escapeHtml(item.name)}</strong>
      <em>${formatPercent(item.probability)}%</em>
    </div>
  `).join("");
}

function formatSavedTime(iso) {
  if (!iso) return "기본값";
  const saved = new Date(iso);
  if (Number.isNaN(saved.getTime())) return "저장됨";
  const diff = Date.now() - saved.getTime();
  if (diff < 60_000) return "방금 전";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return saved.toLocaleDateString("ko-KR");
}

function renderSummary(config) {
  const countEl = document.getElementById("summaryCount");
  const totalEl = document.getElementById("summaryTotal");
  const statusEl = document.getElementById("summaryStatus");
  const savedEl = document.getElementById("summarySaved");
  if (!countEl || !totalEl || !statusEl) return;

  const total = getTotal(config.items);
  countEl.textContent = config.items.length;
  totalEl.textContent = formatPercent(total);
  savedEl.textContent = formatSavedTime(config.updatedAt);
  statusEl.textContent = isTotalValid(total) ? "준비 완료 ●" : "설정 필요 ●";
  statusEl.style.color = isTotalValid(total) ? "#7ee168" : "#ff9085";
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function makeWheelGradient(items) {
  const colored = assignPalette(items);
  const step = 360 / colored.length;
  const slices = colored.map((item, index) => {
    const start = index * step;
    const end = (index + 1) * step;
    const darkLineStart = Math.max(start, end - 0.7);
    return `${item.palette.color} ${start}deg ${darkLineStart}deg, rgba(0,0,0,.58) ${darkLineStart}deg ${end}deg`;
  });
  return `conic-gradient(from ${WHEEL_START_DEG}deg, ${slices.join(",")})`;
}

function renderWheel(config) {
  const wheel = document.getElementById("wheelFace");
  if (!wheel) return;

  const items = assignPalette(config.items);
  wheel.style.background = makeWheelGradient(items);
  wheel.innerHTML = "";

  const step = 360 / items.length;
  const sectorRadians = (step * Math.PI) / 180;
  const outerRadius = 46;
  const hubRadius = 18;
  const centroidRadius = (2 / 3)
    * ((outerRadius ** 3 - hubRadius ** 3) / (outerRadius ** 2 - hubRadius ** 2))
    * (Math.sin(sectorRadians / 2) / (sectorRadians / 2));
  const labelRadius = Math.min(36, Math.max(30, centroidRadius + 0.8));
  items.forEach((item, index) => {
    const label = document.createElement("div");
    label.className = "wheel-label";
    label.textContent = "?";
    const angleFromTop = WHEEL_START_DEG + index * step + step / 2;
    const radians = (angleFromTop * Math.PI) / 180;
    const x = 50 + Math.sin(radians) * labelRadius;
    const y = 50 - Math.cos(radians) * labelRadius;
    label.style.left = `${x}%`;
    label.style.top = `${y}%`;
    label.style.transform = "translate(-50%, -50%)";
    if (item.palette.key === "white" || item.palette.key === "yellow" || item.palette.key === "sky") {
      label.style.color = "rgba(40,35,29,.68)";
      label.style.textShadow = "0 2px 9px rgba(255,255,255,.35)";
    }
    wheel.appendChild(label);
  });
}

function pickWeightedItem(items) {
  const total = getTotal(items);
  if (total <= 0) return { item: items[0], index: 0 };
  const random = Math.random() * total;
  let cursor = 0;
  for (let index = 0; index < items.length; index += 1) {
    cursor += sanitizeProbability(items[index].probability);
    if (random < cursor) return { item: items[index], index };
  }
  return { item: items[items.length - 1], index: items.length - 1 };
}

function prepareAudio() {
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext = new AudioCtor();
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTickTone(timeOffset = 0, frequency = 880) {
  const ctx = prepareAudio();
  if (!ctx) return;
  const start = ctx.currentTime + timeOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(frequency, start);
  osc.frequency.exponentialRampToValueAtTime(frequency * 1.35, start + 0.035);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.16, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.06);
}

function startRouletteSound() {
  stopRouletteSound();
  prepareAudio();
  let ticks = 0;
  tickTimer = window.setInterval(() => {
    ticks += 1;
    const wave = Math.sin(ticks / 2) * 90;
    playTickTone(0, 820 + wave + (ticks % 4) * 70);
  }, 62);
}

function stopRouletteSound() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function playRevealSound() {
  const ctx = prepareAudio();
  if (!ctx) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
    playTickTone(index * 0.09, freq);
  });
}

function openReveal(result, coloredItem) {
  const layer = document.getElementById("revealLayer");
  const gift = document.getElementById("giftBox");
  const resultCard = document.getElementById("resultCard");
  const nameEl = document.getElementById("resultName");
  const metaEl = document.getElementById("resultMeta");
  if (!layer || !gift || !resultCard || !nameEl || !metaEl) return;

  nameEl.textContent = result.name;
  metaEl.textContent = `${coloredItem.palette.short} · 설정 확률 ${formatPercent(result.probability)}%`;
  resultCard.classList.remove("show");
  gift.classList.remove("open");
  layer.classList.add("active");
  layer.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    gift.classList.add("open");
    playRevealSound();
  }, 540);
  setTimeout(() => {
    resultCard.classList.add("show");
  }, 1120);
}

function closeReveal() {
  const layer = document.getElementById("revealLayer");
  const gift = document.getElementById("giftBox");
  const resultCard = document.getElementById("resultCard");
  if (!layer || !gift || !resultCard) return;
  layer.classList.remove("active");
  layer.setAttribute("aria-hidden", "true");
  gift.classList.remove("open");
  resultCard.classList.remove("show");
}

function spinRoulette(config) {
  if (isSpinning) return;
  const total = getTotal(config.items);
  if (!isTotalValid(total)) {
    alert(`현재 총 확률이 ${formatPercent(total)}%입니다. 설정 페이지에서 총합을 100%로 맞춘 뒤 돌릴 수 있습니다.`);
    return;
  }

  const wheel = document.getElementById("wheelFace");
  const spinButton = document.getElementById("spinButton");
  if (!wheel || !spinButton) return;

  closeReveal();
  isSpinning = true;
  spinButton.disabled = true;
  startRouletteSound();

  const colored = assignPalette(config.items);
  const { item, index } = pickWeightedItem(colored);
  const step = 360 / colored.length;

  // 화면의 조각 색상, 설정표의 색상, 당첨 결과의 색상을 같은 colored 배열 기준으로 맞춥니다.
  // 선택된 조각의 중심각을 포인터(12시 방향)에 오게 회전시켜 실제 멈춘 칸과 결과가 일치합니다.
  const segmentCenter = WHEEL_START_DEG + index * step + step / 2;
  const fullTurns = 7 + Math.floor(Math.random() * 3);
  const randomOffsetWithinSegment = (Math.random() - 0.5) * Math.max(2, step * 0.42);
  const desiredModulo = normalizeDegrees(-(segmentCenter + randomOffsetWithinSegment));
  const currentModulo = normalizeDegrees(currentRotation);
  const moduloDelta = normalizeDegrees(desiredModulo - currentModulo);
  currentRotation += fullTurns * 360 + moduloDelta;
  wheel.style.transform = `rotate(${currentRotation}deg)`;

  window.setTimeout(() => {
    stopRouletteSound();
    isSpinning = false;
    spinButton.disabled = false;
    openReveal(item, item);
  }, SPIN_DURATION + 120);
}

function initMainPage() {
  const config = loadConfig();
  buildLegend();
  renderItemProbabilityList(config);
  renderWheel(config);
  renderSummary(config);

  const spinButton = document.getElementById("spinButton");
  const previewButton = document.getElementById("previewButton");
  const againButton = document.getElementById("againButton");
  const closeButton = document.getElementById("closeRevealButton");

  spinButton?.addEventListener("click", () => spinRoulette(loadConfig()));
  previewButton?.addEventListener("click", () => spinRoulette(loadConfig()));
  againButton?.addEventListener("click", () => {
    closeReveal();
    setTimeout(() => spinRoulette(loadConfig()), 220);
  });
  closeButton?.addEventListener("click", closeReveal);
}

function defaultNewItem(index) {
  return {
    name: index === 0 ? "새 상품" : `새 상품 ${index + 1}`,
    probability: 0,
  };
}

function normalizeRows(items) {
  const next = items.slice(0, MAX_ROWS).map((item, index) => ({
    name: String(item.name || `상품 ${index + 1}`).trim(),
    probability: sanitizeProbability(item.probability),
  }));
  while (next.length < MIN_ROWS) next.push(defaultNewItem(next.length));
  return next;
}

function readRowsFromDom() {
  const rows = [...document.querySelectorAll("#settingsRows tr")];
  return rows.map((row, index) => {
    const nameInput = row.querySelector(".item-name");
    const probInput = row.querySelector(".item-probability");
    return {
      name: String(nameInput?.value || `상품 ${index + 1}`).trim(),
      probability: sanitizeProbability(probInput?.value),
    };
  });
}

function setSettingsMessage(message, type = "") {
  const messageEl = document.getElementById("settingsMessage");
  if (!messageEl) return;
  messageEl.textContent = message;
  messageEl.className = `settings-message ${type}`.trim();
}

function updateSettingsTotal(items) {
  const total = getTotal(items);
  const totalView = document.getElementById("totalProbabilityView");
  const totalBox = document.getElementById("totalBox");
  if (totalView) totalView.textContent = formatPercent(total);
  if (totalBox) totalBox.classList.toggle("invalid", !isTotalValid(total));
}

function renderSettingsRows(items) {
  const tbody = document.getElementById("settingsRows");
  const countView = document.getElementById("slotCountView");
  if (!tbody || !countView) return;

  const rows = normalizeRows(items);
  const colored = assignPalette(rows);
  countView.textContent = rows.length;
  tbody.innerHTML = "";

  colored.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td class="name-cell"><input class="item-name" type="text" maxlength="40" value="${escapeHtml(item.name)}" aria-label="${index + 1}번 상품명" /></td>
      <td class="prob-cell"><input class="item-probability" inputmode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" maxlength="6" value="${formatPercent(item.probability)}" aria-label="${index + 1}번 확률" /></td>
      <td><div class="rarity-preview"><span class="color-dot" style="background:${item.palette.color}"></span><span>${item.palette.short}</span></div></td>
      <td><button class="delete-row" type="button" aria-label="${index + 1}번 항목 삭제">⌫</button></td>
    `;
    tbody.appendChild(tr);
  });

  updateSettingsTotal(rows);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function changeRowCount(delta) {
  const items = readRowsFromDom();
  const nextCount = clampNumber(items.length + delta, MIN_ROWS, MAX_ROWS);
  if (nextCount === items.length) return;
  if (nextCount > items.length) {
    while (items.length < nextCount) items.push(defaultNewItem(items.length));
  } else {
    items.length = nextCount;
  }
  renderSettingsRows(items);
  setSettingsMessage("칸 개수가 변경되었습니다. 저장해야 메인 룰렛에 적용됩니다.");
}

function addRow() {
  const items = readRowsFromDom();
  if (items.length >= MAX_ROWS) {
    setSettingsMessage(`최대 ${MAX_ROWS}개까지만 만들 수 있습니다.`, "error");
    return;
  }
  items.push(defaultNewItem(items.length));
  renderSettingsRows(items);
}

function removeLastRow() {
  const items = readRowsFromDom();
  if (items.length <= MIN_ROWS) {
    setSettingsMessage(`최소 ${MIN_ROWS}개 항목은 필요합니다.`, "error");
    return;
  }
  items.pop();
  renderSettingsRows(items);
}

function validateSettings(items) {
  if (items.length < MIN_ROWS) return `최소 ${MIN_ROWS}개의 룰렛 칸이 필요합니다.`;
  if (items.length > MAX_ROWS) return `최대 ${MAX_ROWS}개까지만 설정할 수 있습니다.`;
  const emptyIndex = items.findIndex((item) => item.name.trim() === "");
  if (emptyIndex !== -1) return `${emptyIndex + 1}번 상품명이 비어 있습니다.`;
  const badIndex = items.findIndex((item) => !Number.isFinite(item.probability) || item.probability < 0 || item.probability > 100);
  if (badIndex !== -1) return `${badIndex + 1}번 확률은 0부터 100까지의 숫자 또는 소수만 가능합니다.`;
  const total = getTotal(items);
  if (!isTotalValid(total)) return `총 확률 합계가 ${formatPercent(total)}%입니다. 정확히 100%가 되어야 저장됩니다.`;
  return null;
}

function initSettingsPage() {
  const config = loadConfig();
  renderSettingsRows(config.items);

  document.getElementById("increaseCount")?.addEventListener("click", () => changeRowCount(1));
  document.getElementById("decreaseCount")?.addEventListener("click", () => changeRowCount(-1));
  document.getElementById("addRowButton")?.addEventListener("click", addRow);
  document.getElementById("removeLastButton")?.addEventListener("click", removeLastRow);

  const tbody = document.getElementById("settingsRows");
  tbody?.addEventListener("input", (event) => {
    const isProbabilityInput = event.target.classList.contains("item-probability");

    if (isProbabilityInput) {
      event.target.value = sanitizeProbabilityInput(event.target.value);
      updateSettingsTotal(readRowsFromDom());
      return;
    }

    if (event.target.classList.contains("item-name")) {
      updateSettingsTotal(readRowsFromDom());
    }
  });

  tbody?.addEventListener("change", (event) => {
    if (event.target.classList.contains("item-probability")) {
      renderSettingsRows(readRowsFromDom());
    }
  });

  tbody?.addEventListener("click", (event) => {
    const button = event.target.closest(".delete-row");
    if (!button) return;
    const items = readRowsFromDom();
    if (items.length <= MIN_ROWS) {
      setSettingsMessage(`최소 ${MIN_ROWS}개 항목은 필요합니다.`, "error");
      return;
    }
    const row = button.closest("tr");
    const index = [...tbody.children].indexOf(row);
    items.splice(index, 1);
    renderSettingsRows(items);
  });

  document.getElementById("saveButton")?.addEventListener("click", () => {
    const items = normalizeRows(readRowsFromDom());
    const error = validateSettings(items);
    if (error) {
      setSettingsMessage(error, "error");
      updateSettingsTotal(items);
      return;
    }
    const saved = saveConfig({ items });
    renderSettingsRows(saved.items);
    setSettingsMessage("저장 완료! 메인으로 돌아가면 이 설정으로 룰렛이 작동합니다.", "success");
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "main") initMainPage();
  if (page === "settings") initSettingsPage();
});
