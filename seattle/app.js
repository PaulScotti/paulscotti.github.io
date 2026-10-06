// Seattle house tours map: base listings from places.json, shared notes/edits from the Worker API.
"use strict";

const API = "https://seattle-tours.scottibrain.workers.dev";
const UTC_OFFSET_HOURS = 7; // Seattle is on PDT for the whole trip (DST ends Nov 1, 2026)
const REFRESH_MS = 30000;

const I18N = {
  en: {
    title: "Seattle house tours",
    subtitle: "Oct 16–26 · Green Lake Airbnb + Bellevue hotel",
    addPlace: "+ Add a place", addPlaceTitle: "Add a place", addToMap: "Add to map", adding: "Adding…",
    showList: "Show list", hideList: "Hide list",
    footer: "Notes and edits are shared with everyone who has this link.",
    st_booked: "Tour booked", st_contacted: "Contacted", st_none: "Not contacted", toured: "Toured",
    sec_booked: "Booked tours", sec_contacted: "Contacted, no tour yet", sec_none: "Not contacted yet", sec_hidden: "Removed from map",
    home: "Our Airbnb", homeSub: "Home base for the trip",
    address: "Address", listingUrl: "Listing link", name: "Name", status: "Status", tourTime: "Tour time",
    requested: "Dates requested / status", rent: "Rent", sqft: "Sq ft", type: "Type", beds: "Beds", baths: "Baths",
    yourName: "Your name", cancel: "Cancel", save: "Save", saving: "Saving…", edit: "Edit",
    namePlaceholder: "Optional, e.g. building name", requestedPlaceholder: "e.g. asked for Oct 19 or 20",
    addNote: "We'll find it on the map and pull a photo from the listing link when the site allows it.",
    f_type: "Type", f_layout: "Beds / baths", f_size: "Size", f_rent: "Rent", f_fees: "Fees", f_lease: "Lease",
    f_available: "Available", f_parking: "Parking", f_laundry: "Laundry", f_ac: "AC", f_pets: "Pets", f_built: "Built",
    highlights: "Highlights", watchOuts: "Check on the tour",
    openListing: "Open listing", directions: "Directions from Airbnb", fromHome: "{d} mi from Airbnb",
    notes: "Notes", noNotes: "No notes yet.", notePlaceholder: "Add a note for everyone…", addNoteBtn: "Add note",
    deleteNote: "Delete this note?", remove: "Remove from map", restore: "Restore",
    removeConfirm: "Remove this place from the map for everyone? You can restore it from the list.",
    photoUrl: "Photo link", noPhoto: "No photo",
    syncOk: "Synced {t}", syncFail: "Can't reach the shared notes right now. Retrying…",
    saved: "Saved for everyone", noteAdded: "Note added", failed: "Couldn't save: {e}",
    beds_baths: "{b} bd · {ba} ba", sqftUnit: "{n} sq ft", requestedLabel: "Asked:",
    nNotes: "{n} notes", oneNote: "1 note", alsoOn: "Also listed on:",
    hoods: "Neighborhoods", sec_hoods: "Neighborhoods", hoodKicker: "Neighborhood · {city}",
    yourPlaces: "Your places here", noPlaces: "None of your places are here yet.",
    cityKicker: "City on the Eastside", moreAreas: "More areas to explore",
    notable: "Notable", pros: "Pros", cons: "Cons", essentials: "Everyday essentials",
    e_groceries: "Groceries", e_transit: "Transit", e_swim: "Swim lessons", e_catholic: "Catholic parish",
    e_movies: "Movies", e_parks: "Parks", e_market: "Farmers market", sources: "Sources:",
    hoodGuide: "{name} neighborhood guide",
    nPlaces: "{n} places", onePlace: "1 place", city_Seattle: "Seattle", city_Bellevue: "Bellevue",
    city_Kirkland: "Kirkland", city_Redmond: "Redmond", "city_Mercer Island": "Mercer Island", city_Issaquah: "Issaquah",
  },
  ko: {
    title: "시애틀 집 투어",
    subtitle: "10월 16–26일 · 그린레이크 에어비앤비 + 벨뷰 호텔",
    addPlace: "+ 장소 추가", addPlaceTitle: "장소 추가", addToMap: "지도에 추가", adding: "추가 중…",
    showList: "목록 보기", hideList: "목록 숨기기",
    footer: "메모와 수정 내용은 이 링크를 가진 모든 사람에게 공유됩니다.",
    st_booked: "투어 확정", st_contacted: "연락함", st_none: "아직 연락 안 함", toured: "투어 완료",
    sec_booked: "확정된 투어", sec_contacted: "연락함 · 투어 미정", sec_none: "아직 연락 안 함", sec_hidden: "지도에서 뺀 곳",
    home: "우리 숙소 (에어비앤비)", homeSub: "여행 기간 숙소",
    address: "주소", listingUrl: "매물 링크", name: "이름", status: "상태", tourTime: "투어 일시",
    requested: "요청한 날짜 / 진행 상황", rent: "월세", sqft: "면적 (sqft)", type: "유형", beds: "침실", baths: "욕실",
    yourName: "이름", cancel: "취소", save: "저장", saving: "저장 중…", edit: "수정",
    namePlaceholder: "선택 사항 (예: 건물 이름)", requestedPlaceholder: "예: 10/19 또는 10/20 요청",
    addNote: "주소로 지도 위치를 찾고, 가능하면 매물 링크에서 사진을 가져옵니다.",
    f_type: "유형", f_layout: "침실 / 욕실", f_size: "면적", f_rent: "월세", f_fees: "추가 비용", f_lease: "계약 조건",
    f_available: "입주 가능일", f_parking: "주차", f_laundry: "세탁", f_ac: "에어컨", f_pets: "반려동물", f_built: "준공",
    highlights: "장점", watchOuts: "투어 때 확인할 점",
    openListing: "매물 보기", directions: "숙소에서 길찾기", fromHome: "숙소에서 {d}마일",
    notes: "메모", noNotes: "아직 메모가 없습니다.", notePlaceholder: "모두가 볼 수 있는 메모를 남겨 주세요…", addNoteBtn: "메모 추가",
    deleteNote: "이 메모를 삭제할까요?", remove: "지도에서 빼기", restore: "되돌리기",
    removeConfirm: "모든 사람의 지도에서 이 장소를 뺄까요? 목록에서 다시 되돌릴 수 있습니다.",
    photoUrl: "사진 링크", noPhoto: "사진 없음",
    syncOk: "{t} 동기화됨", syncFail: "공유 메모에 연결할 수 없습니다. 다시 시도하는 중…",
    saved: "모두에게 저장됨", noteAdded: "메모를 추가했습니다", failed: "저장하지 못했습니다: {e}",
    beds_baths: "침실 {b} · 욕실 {ba}", sqftUnit: "{n} sqft", requestedLabel: "요청:",
    nNotes: "메모 {n}개", oneNote: "메모 1개", alsoOn: "다른 매물 링크:",
    hoods: "동네", sec_hoods: "동네 정보", hoodKicker: "동네 · {city}",
    yourPlaces: "이 동네의 후보 집", noPlaces: "아직 이곳에 있는 후보 집이 없습니다.",
    cityKicker: "이스트사이드 도시", moreAreas: "더 둘러볼 지역",
    notable: "주요 특징", pros: "장점", cons: "단점", essentials: "생활 편의",
    e_groceries: "장보기", e_transit: "대중교통", e_swim: "수영 강습", e_catholic: "가톨릭 성당",
    e_movies: "영화관", e_parks: "공원", e_market: "파머스 마켓", sources: "출처:",
    hoodGuide: "{name} 동네 정보",
    nPlaces: "후보 {n}곳", onePlace: "후보 1곳", city_Seattle: "시애틀", city_Bellevue: "벨뷰",
    city_Kirkland: "커클랜드", city_Redmond: "레드먼드", "city_Mercer Island": "머서 아일랜드", city_Issaquah: "이사콰",
  },
};
const TYPE_KO = {
  "Apartment": "아파트", "Townhouse": "타운하우스", "Single-family house": "단독주택",
  "Duplex / multiplex unit": "다세대 주택 유닛", "Upper unit of house": "주택 위층 유닛", "Condo": "콘도",
};

let lang = pickLang();
let base = { home: null, places: [] };
let shared = { notes: [], edits: {} };
let synced = false;
let map;
const markers = new Map();
const homeMarkers = new Map();
const filters = { booked: true, contacted: true, none: true };
let hoodGeo = { features: [] };
let hoodLayer;
const hoodLayers = new Map();
let showHoods = true;
// Areas with candidate places are drawn a little stronger than the ones kept for future tours.
const HOOD_STYLE = { color: "#7a5aa6", weight: 1.5, opacity: 0.8, dashArray: "5 4", fillColor: "#7a5aa6", fillOpacity: 0.08 };
const HOOD_STYLE_EMPTY = { ...HOOD_STYLE, opacity: 0.45, fillOpacity: 0.03 };
const HOOD_HOVER = { weight: 2.5, fillOpacity: 0.16, dashArray: null };
const HOOD_OPEN = { weight: 2.5, opacity: 1, fillOpacity: 0.2, dashArray: null };
const editing = new Set();

const $ = (sel, root = document) => root.querySelector(sel);
const t = (key, vars = {}) => (I18N[lang][key] ?? I18N.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

init();

async function init() {
  applyStaticText();
  [base, hoodGeo] = await Promise.all([
    fetch("places.json?v=13", { cache: "no-cache" }).then((r) => r.json()),
    fetch("neighborhoods.json?v=10", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({ features: [] })),
  ]);
  setupMap();
  setupHoods();
  renderAll();
  fitAll();
  wireUi();
  await refresh();
  openFromHash();
  setInterval(refresh, REFRESH_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  window.addEventListener("hashchange", openFromHash);
}

// ---------- data ----------

function allPlaces() {
  const list = base.places.map((p) => ({ ...p, ...stripMeta(shared.edits[p.id]) }));
  for (const [id, e] of Object.entries(shared.edits)) {
    if (e.added && !base.places.some((p) => p.id === id)) list.push({ id, ...stripMeta(e) });
  }
  return list.map((p) => ({ ...p, status: p.status || "none" }));
}
function stripMeta(e) {
  if (!e) return {};
  const { _updated_at, _updated_by, ...rest } = e;
  return rest;
}
function homes() {
  return [{ ...base.home, id: "home" }, ...(base.additional_homes || [])];
}
function homeName(h) {
  return h.id === "home" ? t("home") : (lang === "ko" ? h.name_ko || h.name : h.name);
}
function placeById(id) {
  return allPlaces().find((p) => p.id === id);
}
function notesFor(id) {
  return shared.notes.filter((n) => n.place_id === id);
}

async function refresh() {
  try {
    const r = await fetch(API + "/api/state", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    shared = await r.json();
    synced = true;
    setSync(t("syncOk", { t: fmtClock(new Date()) }));
    renderAll();
    refreshOpenPopup();
  } catch {
    setSync(t("syncFail"), true);
  }
}

async function api(path, method, body) {
  const r = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "HTTP " + r.status);
  return data;
}

// ---------- map ----------

function setupMap() {
  map = L.map("map", { zoomControl: false, tap: true }).setView([47.64, -122.3], 11);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  for (const h of homes()) {
    const marker = L.marker([h.lat, h.lng], { icon: homeIcon(), zIndexOffset: 1000, title: homeName(h) })
      .addTo(map)
      .bindPopup(() => homePopup(h), popupOpts());
    marker.getPopup()._homeId = h.id;
    homeMarkers.set(h.id, marker);
  }
  // Popup buttons re-render the popup; without this, Leaflet sees the detached button's click as a map click and closes it.
  map.on("popupopen", (e) => {
    e.popup.getElement().addEventListener("click", stopClick);
    positionPopup();
    e.popup._sizeObserver = new ResizeObserver(positionPopup);
    e.popup._sizeObserver.observe(e.popup.getElement());
    e.popup._sig = popupSig(e.popup);
    const hash = e.popup._placeId || e.popup._homeId || (e.popup._hoodId && "hood-" + e.popup._hoodId);
    if (hash) history.replaceState(null, "", "#" + hash);
  });
  // The panel resizes the map on phones (sheet open/closed, list length); keep Leaflet's size in sync.
  new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById("map"));
  map.on("move zoom resize", positionPopup);
  map.on("popupclose", (e) => {
    e.popup._sizeObserver?.disconnect();
    const id = e.popup._placeId;
    if (id) editing.delete(id);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  });
}

// ---------- neighborhoods ----------

function setupHoods() {
  map.createPane("hoods").style.zIndex = 350;
  map.createPane("hoodLabels").style.zIndex = 450;
  hoodLayer = L.geoJSON(hoodGeo, {
    pane: "hoods",
    style: (f) => hoodStyle(f.properties.id),
    onEachFeature: (f, layer) => {
      const id = f.properties.id;
      hoodLayers.set(id, layer);
      layer.bindTooltip(f.properties.name.split(" (")[0], {
        permanent: true, direction: "center", className: "hood-label", pane: "hoodLabels",
      });
      layer.bindPopup(() => hoodPopup(id), popupOpts());
      layer.getPopup()._hoodId = id;
      layer.on("mouseover", () => { if (!layer.isPopupOpen()) layer.setStyle(HOOD_HOVER); });
      layer.on("mouseout", () => { if (!layer.isPopupOpen()) layer.setStyle(hoodStyle(id)); });
      layer.on("popupopen", () => layer.setStyle(HOOD_OPEN));
      layer.on("popupclose", () => layer.setStyle(hoodStyle(id)));
    },
  }).addTo(map);
  const labelZoom = () => map.getContainer().classList.toggle("hide-hood-labels", map.getZoom() < 12);
  map.on("zoomend", labelZoom);
  labelZoom();
}

function hoodStyle(id) {
  return placesInHood(id).length ? HOOD_STYLE : HOOD_STYLE_EMPTY;
}

function restyleHoods() {
  for (const [id, layer] of hoodLayers) if (!layer.isPopupOpen()) layer.setStyle(hoodStyle(id));
}

function toggleHoods(on) {
  showHoods = on;
  if (on) hoodLayer.addTo(map);
  else hoodLayer.remove();
  renderAll();
}

function hoodById(id) {
  return hoodGeo.features.find((f) => f.properties.id === id);
}

function placesInHood(id) {
  const f = hoodById(id);
  if (!f) return [];
  return allPlaces().filter((p) => !p.hidden && p.lat != null && inGeom(p.lat, p.lng, f.geometry));
}

function inGeom(lat, lng, geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.some((rings) => {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  });
}

function hoodPopup(id) {
  const h = hoodById(id)?.properties || {};
  const el = document.createElement("div");
  el.className = "pop pop-hood";
  const here = placesInHood(id);
  const homesHere = homes().filter((home) => hoodById(id) && inGeom(home.lat, home.lng, hoodById(id).geometry));
  const essentials = [
    ["e_groceries", Array.isArray(h.groceries) ? h.groceries.join("; ") : h.groceries],
    ["e_transit", h.transit],
    ["e_swim", h.swim],
    ["e_catholic", h.catholic],
    ["e_movies", h.movies],
    ["e_parks", Array.isArray(h.parks) ? h.parks.join("; ") : h.parks],
    ["e_market", h.farmers_market],
  ].filter(([, v]) => v);
  el.innerHTML = `
    <div class="pop-body">
      <div class="pop-kicker hood-kicker">${esc(h.city === h.name ? t("cityKicker") : t("hoodKicker", { city: t("city_" + h.city) }))}</div>
      <h3>${esc(h.name || id)}</h3>
      ${h.summary ? `<p class="hood-summary">${esc(h.summary)}</p>` : ""}
      <div class="hood-places">
        <h4>${esc(t("yourPlaces"))}${here.length ? ` (${here.length})` : ""}</h4>
        ${homesHere.map((home) => `<button type="button" class="place-chip" data-home-chip="${escAttr(home.id)}"><span class="dot dot-home"></span>${esc(homeName(home))}</button>`).join("")}
        ${here.length
          ? here.map((p) => `<button type="button" class="place-chip" data-place="${escAttr(p.id)}"><span class="dot dot-${p.status}"></span>${esc(p.name)}</button>`).join("")
          : homesHere.length ? "" : `<p class="muted">${esc(t("noPlaces"))}</p>`}
      </div>
      ${listBlock(t("notable"), h.notable, "note")}
      ${listBlock(t("pros"), h.pros, "good")}
      ${listBlock(t("cons"), h.cons, "warn")}
      ${essentials.length ? `<h4 class="ess-title">${esc(t("essentials"))}</h4>
      <dl class="facts essentials">${essentials.map(([k, v]) => `<div class="wide"><dt>${esc(t(k))}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      ${(h.sources || []).length ? `<p class="pop-more">${esc(t("sources"))} ${h.sources.slice(0, 6).map((u) => `<a target="_blank" rel="noopener" href="${escAttr(u)}">${esc(hostOf(u))}</a>`).join(" · ")}</p>` : ""}
      ${notesHtml()}
    </div>`;
  el.querySelectorAll("[data-place]").forEach((b) => b.addEventListener("click", () => openPlace(b.dataset.place)));
  el.querySelectorAll("[data-home-chip]").forEach((b) => b.addEventListener("click", () => openHome(b.dataset.homeChip)));
  wireNotes(el, "hood-" + id);
  return el;
}

function stopClick(e) {
  e.stopPropagation();
}

function popupOpts() {
  const w = Math.min(340, window.innerWidth - 40);
  return {
    maxWidth: w, minWidth: Math.min(300, w),
    autoPan: false,
    className: "place-popup", closeButton: true,
  };
}

// Keep the card inside the map by moving the card, leaving the map and pin in place.
function positionPopup() {
  const popup = map._popup;
  const el = popup?.getElement();
  if (!el || !popup.isOpen()) return;
  el.style.translate = "none";
  const bounds = map.getContainer().getBoundingClientRect();
  let card = el.getBoundingClientRect();
  let x = Math.max(bounds.left + 16 - card.left, Math.min(0, bounds.right - 16 - card.right));
  const zoom = map.getContainer().querySelector(".leaflet-control-zoom").getBoundingClientRect();
  const top = card.right + x > zoom.left && card.left + x < zoom.right
    ? Math.max(bounds.top + 16, zoom.bottom + 12) : bounds.top + 16;
  const height = Math.max(40, bounds.bottom - top - 44);
  if (popup.options.maxHeight !== height) {
    popup.options.maxHeight = height;
    popup.update();
  }
  card = el.getBoundingClientRect();
  x = Math.max(bounds.left + 16 - card.left, Math.min(0, bounds.right - 16 - card.right));
  const y = Math.max(top - card.top, Math.min(0, bounds.bottom - 16 - card.bottom));
  el.style.translate = `${x}px ${y}px`;
  el.classList.toggle("popup-shifted", x !== 0 || y !== 0);
}

function pinIcon(p) {
  const done = isToured(p);
  const label = done ? "✓" : p.status === "booked" && p.tour_at ? String(Number(p.tour_at.slice(8, 10))) : "";
  const n = notesFor(p.id).length;
  return L.divIcon({
    className: "pin-wrap",
    html: `<div class="pin pin-${p.status}${done ? " pin-done" : ""}">
      <svg viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39s13-13.5 13-24A13 13 0 0 0 2 15c0 10.5 13 24 13 24z"/></svg>
      <span class="pin-label">${esc(label)}</span>${n ? `<span class="pin-badge">${n}</span>` : ""}</div>`,
    iconSize: [30, 40], iconAnchor: [15, 39], popupAnchor: [0, -34],
  });
}

function homeIcon() {
  return L.divIcon({
    className: "pin-wrap",
    html: `<div class="home-pin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 11h2.7v9h5.3v-6h3v6h5.3v-9h2.7z"/></svg></div>`,
    iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18],
  });
}

function renderMarkers() {
  const places = allPlaces();
  const seen = new Set();
  for (const p of places) {
    if (p.hidden || p.lat == null) continue;
    seen.add(p.id);
    let m = markers.get(p.id);
    if (!m) {
      m = L.marker([p.lat, p.lng], { title: p.name, riseOnHover: true }).addTo(map);
      m.bindPopup(() => placePopup(m._placeId), popupOpts());
      markers.set(p.id, m);
    }
    m._placeId = p.id;
    m.getPopup()._placeId = p.id;
    m.setLatLng([p.lat, p.lng]);
    m.setIcon(pinIcon(p));
    m.setZIndexOffset(p.status === "booked" ? 300 : p.status === "contacted" ? 200 : 0);
    const visible = filters[p.status];
    if (visible && !map.hasLayer(m)) m.addTo(map);
    if (!visible && map.hasLayer(m)) m.remove();
  }
  for (const [id, m] of markers) {
    if (!seen.has(id)) { m.remove(); markers.delete(id); }
  }
}

function fitAll() {
  const pts = allPlaces().filter((p) => !p.hidden && p.lat != null).map((p) => [p.lat, p.lng]);
  pts.push(...homes().map((h) => [h.lat, h.lng]));
  map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], animate: false });
}

function openHome(id) {
  const marker = homeMarkers.get(id);
  if (!marker) return;
  if (window.innerWidth < 720) setSheet(false);
  flyThen(marker.getLatLng(), Math.max(map.getZoom(), 14), () => marker.openPopup());
}

function openPlace(id) {
  const m = markers.get(id);
  if (!m) return;
  const p = placeById(id);
  if (p && !filters[p.status]) { filters[p.status] = true; renderAll(); }
  if (window.innerWidth < 720) setSheet(false);
  flyThen(m.getLatLng(), Math.max(map.getZoom(), 14), () => m.openPopup());
}

function openHood(id) {
  const layer = hoodLayers.get(id);
  if (!layer) return;
  if (!showHoods) toggleHoods(true);
  if (window.innerWidth < 720) setSheet(false);
  const b = layer.getBounds();
  flyThen(b.getCenter(), Math.min(map.getBoundsZoom(b, false, L.point(40, 40)), 15), () => layer.openPopup(layer.getCenter()));
}

// Run fn only after this flight ends; an earlier animation's moveend could open the popup mid-flight.
function flyThen(center, zoom, fn) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    map.off("moveend", onEnd);
    fn();
  };
  const onEnd = () => { if (map.getCenter().distanceTo(center) < 25) finish(); };
  map.on("moveend", onEnd);
  map.flyTo(center, zoom, { duration: 0.6 });
  setTimeout(finish, 1500);
}

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (homeMarkers.has(id)) openHome(id);
  else if (id.startsWith("hood-")) openHood(id.slice(5));
  else if (id && markers.has(id)) openPlace(id);
}

// ---------- popups ----------

function homePopup(h) {
  const el = document.createElement("div");
  el.className = "pop pop-home";
  el.innerHTML = `
    <div class="pop-body">
      <div class="pop-kicker">${esc(t("homeSub"))}</div>
      <h3>${esc(homeName(h))}</h3>
      <p class="pop-addr">${esc(h.address)}</p>
      ${h.description ? `<p class="pop-desc">${esc(h.description)}</p>` : ""}
      <div class="pop-links"><a class="btn btn-small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.address)}">Google Maps ↗</a></div>
    </div>`;
  return el;
}

function placePopup(id) {
  const p = placeById(id);
  const el = document.createElement("div");
  el.className = "pop";
  if (!p) return el;
  if (editing.has(id)) {
    el.append(editForm(p));
    return el;
  }
  const done = isToured(p);
  const facts = [
    ["f_type", p.type ? (lang === "ko" ? TYPE_KO[p.type] || p.type : p.type) : null],
    ["f_layout", p.beds != null || p.baths != null ? t("beds_baths", { b: p.beds ?? "?", ba: p.baths ?? "?" }) : null],
    ["f_size", p.sqft ? t("sqftUnit", { n: fmtSqft(p.sqft) }) + (String(p.sqft).includes(" (") ? " (" + String(p.sqft).split(" (")[1] : "") : null],
    ["f_rent", p.rent],
    ["f_fees", p.fees],
    ["f_lease", p.lease],
    ["f_available", p.available],
    ["f_parking", p.parking],
    ["f_laundry", p.laundry],
    ["f_ac", p.ac],
    ["f_pets", p.pets],
    ["f_built", p.year_built],
  ].filter(([, v]) => v != null && v !== "");
  const dist = miles(base.home, p);
  const hood = p.lat != null ? hoodGeo.features.find((f) => inGeom(p.lat, p.lng, f.geometry)) : null;
  const dir = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(base.home.address)}&destination=${encodeURIComponent(p.address || `${p.lat},${p.lng}`)}`;

  el.innerHTML = `
    <div class="pop-photo">${p.photo_url
      ? `<img src="${escAttr(p.photo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="no-photo">${esc(t("noPhoto"))}</div>`}</div>
    <div class="pop-body">
      <div class="pop-status">
        <span class="chip chip-${p.status}${done ? " chip-done" : ""}">${esc(done ? t("toured") : t("st_" + p.status))}</span>
        ${p.status === "booked" && p.tour_at ? `<span class="pop-when">${esc(fmtTour(p.tour_at))}</span>` : ""}
      </div>
      ${p.requested ? `<p class="pop-requested">${esc(p.requested)}</p>` : ""}
      <h3>${esc(p.name)}</h3>
      <p class="pop-addr">${esc(p.address || "")}${p.neighborhood ? ` · ${esc(p.neighborhood)}` : ""}${dist != null ? ` · ${esc(t("fromHome", { d: dist }))}` : ""}</p>
      ${hood ? `<button type="button" class="hood-link" data-hood-link="${escAttr(hood.properties.id)}"><span class="dot dot-hood"></span>${esc(t("hoodGuide", { name: hood.properties.name.split(" (")[0] }))} ›</button>` : ""}
      <dl class="facts">${facts.map(([k, v]) => `<div${String(v).length > 30 ? ' class="wide"' : ""}><dt>${esc(t(k))}</dt><dd>${esc(String(v))}</dd></div>`).join("")}</dl>
      ${listBlock(t("highlights"), p.highlights, "good")}
      ${listBlock(t("watchOuts"), p.watch_outs, "warn")}
      <div class="pop-links">
        ${p.listing_url ? `<a class="btn btn-small btn-primary" target="_blank" rel="noopener" href="${escAttr(p.listing_url)}">${esc(t("openListing"))} ↗</a>` : ""}
        <a class="btn btn-small" target="_blank" rel="noopener" href="${escAttr(dir)}">${esc(t("directions"))} ↗</a>
        <button class="btn btn-small" type="button" data-act="edit">${esc(t("edit"))}</button>
      </div>
      ${(p.other_urls || []).length ? `<p class="pop-more">${esc(t("alsoOn"))} ${p.other_urls.map((u) => `<a target="_blank" rel="noopener" href="${escAttr(u)}">${esc(hostOf(u))}</a>`).join(" · ")}</p>` : ""}
      ${notesHtml()}
    </div>`;

  const img = $(".pop-photo img", el);
  if (img) img.addEventListener("error", () => { img.parentElement.innerHTML = `<div class="no-photo">${esc(t("noPhoto"))}</div>`; });

  wireNotes(el, id);
  $("[data-hood-link]", el)?.addEventListener("click", (e) => openHood(e.currentTarget.dataset.hoodLink));
  $('[data-act="edit"]', el).addEventListener("click", () => { editing.add(id); rerender(id); });
  return el;
}

function notesHtml() {
  return `<section class="notes">
    <h4>${esc(t("notes"))}</h4>
    <ul class="note-list"></ul>
    <form class="note-form">
      <textarea name="body" rows="2" required placeholder="${escAttr(t("notePlaceholder"))}"></textarea>
      <div class="note-row">
        <input name="author" placeholder="${escAttr(t("yourName"))}" value="${escAttr(getName())}" autocomplete="name">
        <button class="btn btn-small btn-primary" type="submit">${esc(t("addNoteBtn"))}</button>
      </div>
    </form>
  </section>`;
}

// id is a place id or "hood-<id>"; both live in the same notes table.
function wireNotes(el, id) {
  const ul = $(".note-list", el);
  const notes = notesFor(id);
  if (!notes.length) ul.innerHTML = `<li class="note-empty">${esc(t("noNotes"))}</li>`;
  for (const n of notes) {
    const li = document.createElement("li");
    li.innerHTML = `<div class="note-meta"><b></b><span></span><button type="button" class="note-del" aria-label="Delete">×</button></div><p></p>`;
    $("b", li).textContent = n.author || "—";
    $("span", li).textContent = fmtStamp(n.created_at);
    $("p", li).textContent = n.body;
    $(".note-del", li).addEventListener("click", async () => {
      if (!confirm(t("deleteNote"))) return;
      try {
        await api("/api/notes/" + n.id, "DELETE");
        shared.notes = shared.notes.filter((x) => x.id !== n.id);
        rerender(id);
      } catch (err) { toast(t("failed", { e: err.message }), true); }
    });
    ul.append(li);
  }

  $(".note-form", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const body = f.body.value.trim();
    if (!body) return;
    const author = f.author.value.trim();
    setName(author);
    const btn = $("button[type=submit]", f);
    btn.disabled = true;
    try {
      const { note } = await api("/api/notes", "POST", { place_id: id, author, body });
      shared.notes.push(note);
      toast(t("noteAdded"));
      f.body.value = "";
      document.activeElement?.blur();
      rerender(id);
    } catch (err) {
      toast(t("failed", { e: err.message }), true);
    } finally { btn.disabled = false; }
  });
}

function editForm(p) {
  const form = document.createElement("form");
  form.className = "edit-form";
  const typeOpts = ["", ...Object.keys(TYPE_KO)];
  form.innerHTML = `
    <div class="pop-body">
      <h3>${esc(p.name)}</h3>
      <fieldset class="seg">
        <legend>${esc(t("status"))}</legend>
        ${["booked", "contacted", "none"].map((s) => `
          <label class="seg-${s}"><input type="radio" name="status" value="${s}" ${p.status === s ? "checked" : ""}><span>${esc(t("st_" + s))}</span></label>`).join("")}
      </fieldset>
      <label>${esc(t("tourTime"))}<input type="datetime-local" name="tour_at" min="2026-10-16T00:00" max="2026-10-26T23:59" value="${escAttr(p.tour_at || "")}"></label>
      <label>${esc(t("requested"))}<input name="requested" value="${escAttr(p.requested || "")}" placeholder="${escAttr(t("requestedPlaceholder"))}"></label>
      <div class="grid-2">
        <label>${esc(t("rent"))}<input name="rent" value="${escAttr(p.rent || "")}"></label>
        <label>${esc(t("sqft"))}<input name="sqft" value="${escAttr(p.sqft ?? "")}"></label>
      </div>
      <div class="grid-3">
        <label>${esc(t("beds"))}<input name="beds" value="${escAttr(p.beds ?? "")}" inputmode="decimal"></label>
        <label>${esc(t("baths"))}<input name="baths" value="${escAttr(p.baths ?? "")}" inputmode="decimal"></label>
        <label>${esc(t("type"))}<select name="type">${typeOpts.map((o) => `<option value="${escAttr(o)}" ${o === (p.type || "") ? "selected" : ""}>${esc(o ? (lang === "ko" ? TYPE_KO[o] : o) : "—")}</option>`).join("")}</select></label>
      </div>
      <label>${esc(t("listingUrl"))}<input type="url" name="listing_url" value="${escAttr(p.listing_url || "")}"></label>
      <label>${esc(t("photoUrl"))}<input type="url" name="photo_url" value="${escAttr(p.photo_url || "")}"></label>
      <label>${esc(t("yourName"))}<input name="by" value="${escAttr(getName())}" autocomplete="name"></label>
      <div class="modal-actions">
        <button type="button" class="btn btn-small btn-ghost-danger" data-act="remove">${esc(t("remove"))}</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-small" data-act="cancel">${esc(t("cancel"))}</button>
        <button type="submit" class="btn btn-small btn-primary">${esc(t("save"))}</button>
      </div>
    </div>`;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const keys = ["status", "tour_at", "requested", "rent", "sqft", "beds", "baths", "type", "listing_url", "photo_url"];
    const fields = {};
    for (const k of keys) {
      const v = (fd.get(k) ?? "").toString().trim();
      const old = p[k] == null ? "" : String(p[k]);
      if (v !== old) fields[k] = v === "" ? null : v;
    }
    // A booked status without a time is allowed; a time implies booked.
    if (fields.tour_at && !("status" in fields) && p.status !== "booked") fields.status = "booked";
    const by = (fd.get("by") || "").toString().trim();
    setName(by);
    editing.delete(p.id);
    if (!Object.keys(fields).length) return rerender(p.id);
    await savePlace(p.id, fields, by);
  });
  $('[data-act="cancel"]', form).addEventListener("click", () => { editing.delete(p.id); rerender(p.id); });
  $('[data-act="remove"]', form).addEventListener("click", async () => {
    if (!confirm(t("removeConfirm"))) return;
    editing.delete(p.id);
    map.closePopup();
    await savePlace(p.id, { hidden: true }, getName());
  });
  return form;
}

async function savePlace(id, fields, by) {
  try {
    const { data } = await api("/api/places/" + id, "PATCH", { fields, by });
    shared.edits[id] = { ...(shared.edits[id] || {}), ...data };
    for (const [k, v] of Object.entries(fields)) if (v === null) delete shared.edits[id][k];
    toast(t("saved"));
  } catch (err) {
    toast(t("failed", { e: err.message }), true);
  }
  rerender(id);
}

function rerender() {
  renderAll();
  refreshOpenPopup(true);
}

function popupSig(pop) {
  if (pop._placeId) {
    const id = pop._placeId;
    return JSON.stringify([placeById(id), notesFor(id), lang, editing.has(id)]);
  }
  if (pop._hoodId) {
    const id = pop._hoodId;
    return JSON.stringify([notesFor("hood-" + id), placesInHood(id).map((p) => [p.id, p.name, p.status]), lang]);
  }
  return lang;
}

// Re-run the open popup's content function when its data changed, keeping the reader's scroll position.
// Background refreshes skip it while someone is editing or typing in it.
function refreshOpenPopup(force = false) {
  const pop = map._popup;
  if (!pop || !pop.isOpen()) return;
  if (!force && (editing.has(pop._placeId) || pop.getElement()?.contains(document.activeElement))) return;
  const sig = popupSig(pop);
  if (!force && pop._sig === sig) return;
  const scroller = () => pop.getElement()?.querySelector(".leaflet-popup-content");
  const top = scroller()?.scrollTop || 0;
  pop.update();
  pop._sig = sig;
  const sc = scroller();
  if (sc) sc.scrollTop = top;
}

function listBlock(title, items, kind) {
  if (!items || !items.length) return "";
  return `<div class="pop-list pop-list-${kind}"><h4>${esc(title)}</h4><ul>${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`;
}

// ---------- side panel ----------

function renderAll() {
  renderMarkers();
  if (hoodLayer) restyleHoods();
  renderLegend();
  renderList();
}

function renderLegend() {
  const places = allPlaces().filter((p) => !p.hidden);
  const count = (s) => places.filter((p) => p.status === s).length;
  const el = $("#legend");
  el.innerHTML = ["booked", "contacted", "none"].map((s) => `
    <button type="button" class="legend-chip ${filters[s] ? "on" : ""}" data-status="${s}" aria-pressed="${filters[s]}">
      <span class="dot dot-${s}"></span>${esc(t("st_" + s))}<b>${count(s)}</b>
    </button>`).join("") + `
    ${homes().map((h) => `<button type="button" class="legend-chip legend-home" data-home="${escAttr(h.id)}"><span class="dot dot-home"></span>${esc(homeName(h))}</button>`).join("")}
    ${hoodGeo.features.length ? `<button type="button" class="legend-chip ${showHoods ? "on" : ""}" data-hoods="1" aria-pressed="${showHoods}"><span class="dot dot-hood"></span>${esc(t("hoods"))}</button>` : ""}`;
}

function renderList() {
  const places = allPlaces();
  const visible = places.filter((p) => !p.hidden);
  const list = $("#list");
  const parts = [];

  const booked = visible.filter((p) => p.status === "booked")
    .sort((a, b) => (a.tour_at || "9").localeCompare(b.tour_at || "9"));
  if (booked.length && filters.booked) {
    parts.push(`<h2 class="sec sec-booked">${esc(t("sec_booked"))}</h2>`);
    let day = null;
    for (const p of booked) {
      const d = p.tour_at ? p.tour_at.slice(0, 10) : "";
      if (d !== day) { day = d; parts.push(`<h3 class="day">${esc(d ? fmtDay(d) : "—")}</h3>`); }
      parts.push(row(p, p.tour_at ? fmtTime(p.tour_at) : ""));
    }
  }
  for (const s of ["contacted", "none"]) {
    const group = visible.filter((p) => p.status === s).sort((a, b) => a.name.localeCompare(b.name));
    if (!group.length || !filters[s]) continue;
    parts.push(`<h2 class="sec sec-${s}">${esc(t("sec_" + s))}</h2>`);
    for (const p of group) parts.push(row(p, ""));
  }
  if (showHoods && hoodGeo.features.length) {
    const withPlaces = hoodGeo.features.filter((f) => placesInHood(f.properties.id).length);
    const others = hoodGeo.features.filter((f) => !placesInHood(f.properties.id).length);
    parts.push(`<h2 class="sec sec-hoods">${esc(t("sec_hoods"))}</h2>`);
    for (const f of [...withPlaces, { divider: true }, ...others]) {
      if (f.divider) {
        if (others.length) parts.push(`<h3 class="day">${esc(t("moreAreas"))}</h3>`);
        continue;
      }
      const { id, name, city } = f.properties;
      const n = placesInHood(id).length;
      const notes = notesFor("hood-" + id).length;
      parts.push(`<button type="button" class="row" data-hood="${escAttr(id)}">
        <span class="dot dot-hood"></span>
        <span class="row-main"><span class="row-name">${esc(name)}</span>
          <span class="row-sub">${esc(city === name ? t("cityKicker") : t("city_" + city))}${n ? " · " + esc(n === 1 ? t("onePlace") : t("nPlaces", { n })) : ""}</span></span>
        <span class="row-side">${notes ? `<span class="row-notes">${esc(notes === 1 ? t("oneNote") : t("nNotes", { n: notes }))}</span>` : ""}</span>
      </button>`);
    }
  }
  const hidden = places.filter((p) => p.hidden);
  if (hidden.length) {
    parts.push(`<details class="hidden-sec"><summary>${esc(t("sec_hidden"))} (${hidden.length})</summary>`);
    for (const p of hidden) {
      parts.push(`<div class="row row-hidden"><span class="row-name">${esc(p.name)}</span>
        <button type="button" class="btn btn-small" data-restore="${escAttr(p.id)}">${esc(t("restore"))}</button></div>`);
    }
    parts.push(`</details>`);
  }
  list.innerHTML = parts.join("");
}

function row(p, when) {
  const n = notesFor(p.id).length;
  const bits = [p.neighborhood, p.beds != null ? t("beds_baths", { b: p.beds, ba: p.baths ?? "?" }) : null, p.sqft ? t("sqftUnit", { n: fmtSqft(p.sqft) }) : null]
    .filter(Boolean).join(" · ");
  const done = isToured(p);
  return `<button type="button" class="row" data-open="${escAttr(p.id)}">
    <span class="dot dot-${p.status}${done ? " dot-done" : ""}"></span>
    <span class="row-main">
      <span class="row-name">${esc(p.name)}</span>
      <span class="row-sub">${esc(bits)}</span>
      ${p.requested && p.status !== "booked" ? `<span class="row-req">${esc(p.requested)}</span>` : ""}
    </span>
    <span class="row-side">
      ${when ? `<span class="row-when">${esc(when)}</span>` : ""}
      ${shortRent(p.rent || "") ? `<span class="row-rent">${esc(shortRent(p.rent))}</span>` : ""}
      ${n ? `<span class="row-notes">${esc(n === 1 ? t("oneNote") : t("nNotes", { n }))}</span>` : ""}
    </span>
  </button>`;
}

function wireUi() {
  $("#legend").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.home) return openHome(b.dataset.home);
    if (b.dataset.hoods) return toggleHoods(!showHoods);
    const s = b.dataset.status;
    filters[s] = !filters[s];
    if (!filters.booked && !filters.contacted && !filters.none) filters[s] = true;
    renderAll();
  });
  $("#list").addEventListener("click", async (e) => {
    const open = e.target.closest("[data-open]");
    if (open) return openPlace(open.dataset.open);
    const hood = e.target.closest("[data-hood]");
    if (hood) return openHood(hood.dataset.hood);
    const restore = e.target.closest("[data-restore]");
    if (restore) await savePlace(restore.dataset.restore, { hidden: null }, getName());
  });
  $("#lang").addEventListener("click", () => {
    lang = lang === "en" ? "ko" : "en";
    try { localStorage.setItem("seattle.lang", lang); } catch {}
    applyStaticText();
    renderAll();
    refreshOpenPopup(true);
  });
  $("#sheet-toggle").addEventListener("click", () => setSheet(!document.body.classList.contains("sheet-open")));

  const dlg = $("#add-dialog");
  const form = $("#add-form");
  $("#add-place").addEventListener("click", () => {
    form.reset();
    form.by.value = getName();
    $("#add-error").textContent = "";
    dlg.showModal();
  });
  form.addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "ok") return; // Cancel closes the dialog
    e.preventDefault();
    const fd = new FormData(form);
    const fields = {};
    for (const k of ["address", "listing_url", "name", "status", "tour_at", "requested", "rent", "sqft", "type", "beds", "baths"]) {
      const v = (fd.get(k) || "").toString().trim();
      if (v) fields[k] = v;
    }
    if (fields.tour_at && fields.status === "none") fields.status = "booked";
    const by = (fd.get("by") || "").toString().trim();
    setName(by);
    const btn = $("#add-submit");
    btn.disabled = true;
    btn.textContent = t("adding");
    $("#add-error").textContent = "";
    try {
      const { place_id, data } = await api("/api/places", "POST", { fields, by });
      shared.edits[place_id] = data;
      dlg.close();
      renderAll();
      toast(t("saved"));
      openPlace(place_id);
    } catch (err) {
      $("#add-error").textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = t("addToMap");
    }
  });
}

function setSheet(open) {
  document.body.classList.toggle("sheet-open", open);
  if (open) $("#list").scrollTop = 0;
  const b = $("#sheet-toggle");
  b.setAttribute("aria-expanded", String(open));
  b.textContent = open ? t("hideList") : t("showList");
}

function applyStaticText() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll("[data-tp]").forEach((el) => { el.placeholder = t(el.dataset.tp); });
  $("#lang").textContent = lang === "en" ? "한국어" : "English";
  $("#sheet-toggle").textContent = document.body.classList.contains("sheet-open") ? t("hideList") : t("showList");
  if (synced) setSync(t("syncOk", { t: fmtClock(new Date()) }));
}

// ---------- helpers ----------

function pickLang() {
  try {
    const saved = localStorage.getItem("seattle.lang");
    if (saved === "en" || saved === "ko") return saved;
  } catch {}
  return (navigator.language || "").toLowerCase().startsWith("ko") ? "ko" : "en";
}
function getName() {
  try { return localStorage.getItem("seattle.name") || ""; } catch { return ""; }
}
function setName(n) {
  if (!n) return;
  try { localStorage.setItem("seattle.name", n); } catch {}
}

// tour_at is Seattle wall-clock time ("2026-10-17T09:30"); format it without timezone shifts.
function wallClock(s) {
  const [d, tm] = s.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = (tm || "00:00").split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, da, h, mi));
}
function locale() { return lang === "ko" ? "ko-KR" : "en-US"; }
function fmtTour(s) {
  return new Intl.DateTimeFormat(locale(), { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(wallClock(s));
}
function fmtDay(d) {
  return new Intl.DateTimeFormat(locale(), { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(wallClock(d + "T00:00"));
}
function fmtTime(s) {
  return new Intl.DateTimeFormat(locale(), { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(wallClock(s));
}
function fmtStamp(iso) {
  return new Intl.DateTimeFormat(locale(), { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function fmtClock(d) {
  return new Intl.DateTimeFormat(locale(), { hour: "numeric", minute: "2-digit" }).format(d);
}
function isToured(p) {
  if (p.status !== "booked" || !p.tour_at) return false;
  return wallClock(p.tour_at).getTime() + UTC_OFFSET_HOURS * 3600e3 + 3600e3 < Date.now();
}
function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}
function fmtSqft(v) {
  return typeof v === "number" ? v.toLocaleString("en-US") : String(v).split(" (")[0];
}
function shortRent(r) {
  const m = String(r).match(/\$[\d,]+(?:\s*[–-]\s*\$?[\d,]+)?/);
  return m ? (/from/i.test(r) && !m[0].includes("–") ? m[0] + "+" : m[0].replace(/\s+/g, "")) : "";
}
function miles(a, b) {
  if (a?.lat == null || b?.lat == null) return null;
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(x))).toFixed(1);
}
function setSync(msg, bad = false) {
  const el = $("#sync");
  el.textContent = msg;
  el.classList.toggle("bad", bad);
}
let toastTimer;
function toast(msg, bad = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("bad", bad);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escAttr(s) {
  const v = String(s ?? "");
  if (/^\s*javascript:/i.test(v)) return "";
  return esc(v);
}
