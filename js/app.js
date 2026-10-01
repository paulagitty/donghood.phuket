window.DH = window.DH || {};

(function () {
  const { config } = DH;
  const { THAI_DAYS, THAI_MONTHS } = DH.data;

  function menu() { return DH.data.MENU; }
  function storeHours() { return DH.data.STORE_HOURS; }
  function cats() { return DH.data.CATS; }
  function catIcon() { return DH.data.CAT_ICON; }
  function menuImage() { return DH.data.MENU_IMAGE; }
  const { dateKey, addDays, money, escapeHtml, isValidThaiPhone, isValidEmail, spiceLabel } = DH.util;

  const ICON_PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/></svg>`;
  const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;
  const ICON_CAL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>`;
  const ICON_SEARCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

  let DELIVERY_SCHEDULE = {};
  let DELIVERY_ZONES = [];
  let guestUserId = '';

  const state = {
    activeCat: 'all',
    search: '',
    cart: {},
    view: 'menu',
    detailItem: null,
    orderType: 'delivery',
    date: null,
    zone: null,
    round: null,
    address: '',
    customerName: '',
    phone: '',
    email: '',
    notes: '',
    slipFile: null,
    paymentMethod: 'promptpay',
    orderId: null,
    lastOrder: null,
    receiptImageUrl: null,
    submitting: false,
    bannerDismissed: localStorage.getItem('dh-banner-dismissed') === '1',
  };

  function itemById(id) { return menu().find(m => m.id === id); }

  function filteredMenu() {
    const q = state.search.trim().toLowerCase();
    if (!q) return menu();
    return menu().filter(m =>
      m.th.toLowerCase().includes(q) ||
      m.en.toLowerCase().includes(q) ||
      (m.desc && m.desc.toLowerCase().includes(q))
    );
  }

  function cartLines() {
    return Object.entries(state.cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ item: itemById(id), qty }));
  }

  function cartCount() { return cartLines().reduce((s, l) => s + l.qty, 0); }
  function cartTotal() { return cartLines().reduce((s, l) => s + l.qty * l.item.price, 0); }

  function todayHours() {
    return storeHours()[new Date().getDay()];
  }

  function minutesNow() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function parseHm(str) {
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m;
  }

  function isOpenNow() {
    const h = todayHours();
    const cur = minutesNow();
    return cur >= parseHm(h.open) && cur < parseHm(h.close);
  }

  /** หลังเวลาปิดร้าน (เช่น สองทุ่ม) — สั่งได้ แต่ส่ง/รับได้ตั้งแต่วันถัดไป */
  function isAfterCloseToday() {
    return minutesNow() >= parseHm(todayHours().close);
  }

  function hoursTodayLabel() {
    const h = todayHours();
    return `วันนี้เปิด ${h.open} – ${h.close} น.`;
  }

  function statusPillMeta() {
    if (isOpenNow()) return { cls: 'open', label: 'เปิดอยู่' };
    if (isAfterCloseToday()) return { cls: 'advance', label: 'สั่งล่วงหน้า' };
    return { cls: 'open', label: 'รับออเดอร์ได้' };
  }

  function closeTimeLabel() {
    return todayHours().close.replace(/^0/, '');
  }

  function zoneBaseFee(zone) {
    if (!zone) return Number(config.deliveryFee) || 0;
    if (zone.deliveryFee != null && zone.deliveryFee !== '') return Number(zone.deliveryFee) || 0;
    return Number(config.deliveryFee) || 0;
  }

  function zoneFreeAbove(zone) {
    if (!zone || zone.freeAbove == null || zone.freeAbove === '') return 0;
    return Number(zone.freeAbove) || 0;
  }

  function zoneFeeAmount(zone, subtotal = cartTotal()) {
    if (!zone) return 0;
    const base = zoneBaseFee(zone);
    const freeAbove = zoneFreeAbove(zone);
    if (freeAbove > 0 && subtotal >= freeAbove) return 0;
    return base;
  }

  function currentDeliveryFee() {
    if (state.orderType !== 'delivery') return 0;
    return zoneFeeAmount(selectedZoneInfo());
  }

  function zoneFeeLabel(zone) {
    const fee = zoneFeeAmount(zone);
    return fee > 0 ? `+฿${money(fee)}` : 'ส่งฟรี';
  }

  function zoneFeeHint(zone) {
    const freeAbove = zoneFreeAbove(zone);
    if (!freeAbove) return '';
    if (cartTotal() >= freeAbove) return `ส่งฟรีเมื่อครบ ฿${money(freeAbove)}`;
    const need = freeAbove - cartTotal();
    return `อีก ฿${money(need)} ส่งฟรี (ตอนนี้ +฿${money(zoneBaseFee(zone))})`;
  }

  function deliveryFeeLabel() {
    if (state.orderType === 'delivery' && state.zone) return zoneFeeLabel(selectedZoneInfo());
    return 'ตามโซน';
  }

  function deliveryFeeSummary() {
    const fee = currentDeliveryFee();
    if (state.orderType === 'delivery' && !state.zone) return '—';
    if (fee > 0) return `฿${money(fee)}`;
    return 'ฟรี';
  }

  function renderItemBadge(m) {
    if (m.badge) return `<span class="tag-badge">${escapeHtml(m.badge)}</span>`;
    if (m.popular) return '<span class="tag-popular">ยอดนิยม</span>';
    return '';
  }

  function upcomingDates() {
    const afterClose = isAfterCloseToday();
    const dayCount = state.orderType === 'delivery' ? 7 : 3;
    return Array.from({ length: dayCount }, (_, n) => {
      const d = addDays(n);
      const key = dateKey(d);
      const day = scheduleDay(key);
      let disabled = false;
      let note = '';
      const pastCloseTime = day.closeAt && n === 0 && minutesNow() >= parseHmToMin(day.closeAt);
      if (day.closed || pastCloseTime) {
        disabled = true;
        note = day.closedReason || 'ปิดรับ';
      } else if (state.orderType === 'delivery') {
        if (!day.enabled) {
          disabled = true;
          note = 'ไม่ส่ง';
        } else if (n === 0 && isPastCutoffToday(day.cutoffTime)) {
          disabled = true;
          note = 'หมดรอบ';
        }
      } else if (n === 0 && afterClose) {
        disabled = true;
      }
      return {
        key,
        dayLabel: n === 0 ? 'วันนี้' : n === 1 ? 'พรุ่งนี้' : THAI_DAYS[d.getDay()],
        numLabel: `${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`,
        isToday: n === 0,
        disabled,
        note,
        cutoffTime: day.cutoffTime,
      };
    });
  }

  function scheduleDay(key) {
    const raw = DELIVERY_SCHEDULE[key];
    if (!raw) return { enabled: false, cutoffTime: '23:00', rounds: [], closed: false, closeAt: '', closedReason: '' };
    if (Array.isArray(raw)) {
      return { enabled: raw.length > 0, cutoffTime: '23:00', rounds: raw, closed: false, closeAt: '', closedReason: '' };
    }
    const rounds = Array.isArray(raw.rounds) ? raw.rounds : [];
    return {
      enabled: raw.enabled !== false && (raw.enabled === true || rounds.length > 0),
      cutoffTime: raw.cutoffTime || '23:00',
      rounds,
      closed: raw.closed === true,
      closeAt: raw.closeAt || '',
      closedReason: raw.closedReason || '',
    };
  }

  function parseHmToMin(str) {
    if (!str) return 0;
    const start = String(str).split('–')[0].trim();
    const [h, m] = start.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function isPastCutoffToday(cutoffTime) {
    return minutesNow() >= parseHmToMin(cutoffTime || '23:00');
  }

  function cutoffLabel(cutoffTime) {
    const t = (cutoffTime || '23:00').replace(/^0/, '');
    return t;
  }

  function ensureValidOrderDate() {
    const dates = upcomingDates();
    const selected = dates.find(d => d.key === state.date);
    if (selected && !selected.disabled) return;
    const next = dates.find(d => !d.disabled);
    if (next) {
      state.date = next.key;
      state.zone = null;
      state.round = null;
    } else {
      state.date = null;
      state.zone = null;
      state.round = null;
    }
  }

  function getZones() {
    return DELIVERY_ZONES.filter(z => z.active !== false);
  }

  function zoneById(id) {
    return getZones().find(z => z.id === id);
  }

  function normalizeRound(r) {
    const zone = r.zoneId ? zoneById(r.zoneId) : null;
    return {
      ...r,
      zoneId: r.zoneId || null,
      zoneName: zone ? zone.nameTh : (r.route || ''),
      route: r.route || (zone ? zone.nameTh : ''),
    };
  }

  function roundsForDate(key) {
    const day = scheduleDay(key);
    if (!day.enabled) return [];
    const rounds = day.rounds || [];
    const isToday = key === dateKey(addDays(0));
    const nowMin = minutesNow();
    const cutoffMin = parseHmToMin(day.cutoffTime);
    return rounds.map(r => {
      const norm = normalizeRound(r);
      let disabled = false;
      if (isToday && norm.time) {
        const startMin = parseHmToMin(norm.time);
        disabled = startMin <= nowMin || startMin > cutoffMin;
      }
      return { ...norm, disabled };
    });
  }

  function zonesForDate(key) {
    const zoneIds = [...new Set(roundsForDate(key).map(r => r.zoneId).filter(Boolean))];
    return getZones()
      .filter(z => zoneIds.includes(z.id))
      .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
  }

  function slotsForZone(key, zoneId) {
    return roundsForDate(key).filter(r => r.zoneId === zoneId);
  }

  function legacyRoundsForDate(key) {
    return roundsForDate(key).filter(r => !r.zoneId);
  }

  function pickupSlotsForDate(key) {
    const d = new Date(key + 'T00:00:00');
    const h = storeHours()[d.getDay()];
    const [oh, om] = h.open.split(':').map(Number);
    const [ch, cm] = h.close.split(':').map(Number);
    const isToday = key === dateKey(addDays(0));
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const start = oh * 60 + om;
    const end = ch * 60 + cm - config.cutoffMinBeforeClose;
    const slots = [];
    for (let t = start; t < end; t += 45) {
      const s = DH.util.fmtMin(t);
      const e = DH.util.fmtMin(Math.min(t + 45, end + config.cutoffMinBeforeClose));
      slots.push({ id: `${s}-${e}`, time: `${s} – ${e}`, disabled: isToday && t < nowMin });
    }
    return slots;
  }

  function selectedDateLabel() {
    const d = upcomingDates().find(x => x.key === state.date);
    return d ? `${d.dayLabel} · ${d.numLabel}` : '';
  }

  function selectedRoundInfo() {
    if (state.orderType === 'delivery') {
      const all = state.date ? roundsForDate(state.date) : [];
      return all.find(r => r.id === state.round) || null;
    }
    return pickupSlotsForDate(state.date).find(s => s.id === state.round);
  }

  function selectedZoneInfo() {
    return state.zone ? zoneById(state.zone) : null;
  }

  function cartCanContinue() {
    if (!cartLines().length) return false;
    if (state.customerName.trim().length < 2) return false;
    if (state.orderType === 'pickup') {
      return !!state.date && !!state.round && isValidThaiPhone(state.phone);
    }
    if (!state.date || !state.round || state.address.trim().length <= 3) return false;
    if (!isValidThaiPhone(state.phone)) return false;
    const hasZones = zonesForDate(state.date).length > 0;
    const hasLegacy = legacyRoundsForDate(state.date).length > 0;
    if (hasZones && !state.zone) return false;
    if (!hasZones && !hasLegacy) return false;
    return true;
  }

  function isLineWebView() {
    return /Line\//i.test(navigator.userAgent || '');
  }

  function checkoutBlockers() {
    const blockers = [];
    if (state.customerName.trim().length < 2) {
      blockers.push({ fieldId: 'customerNameInput', msg: 'กรอกชื่อผู้สั่ง' });
    }
    if (!isValidThaiPhone(state.phone)) {
      blockers.push({ fieldId: 'phoneInput', msg: 'กรอกเบอร์โทร 10 หลัก' });
    }
    const emailTrim = state.email.trim();
    if (emailTrim && !isValidEmail(emailTrim)) {
      blockers.push({ fieldId: 'emailInput', msg: 'แก้ไขรูปแบบอีเมล' });
    }
    if (state.paymentMethod !== 'cod' && !state.slipFile) {
      blockers.push({ fieldId: 'uploadBox', msg: 'แนบสลิปการโอนเงิน' });
    }
    return blockers;
  }

  function scrollToCheckoutField(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof el.focus === 'function') {
      try { el.focus({ preventScroll: true }); } catch { el.focus(); }
    }
  }

  function isLikelyImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    if (!file.type || file.type === 'application/octet-stream') {
      return !file.name || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name);
    }
    return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name || '');
  }

  function compressSlipImage(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const maxSide = 1600;
          const w = img.naturalWidth || img.width || 1;
          const h = img.naturalHeight || img.height || 1;
          const scale = Math.min(1, maxSide / Math.max(w, h));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(objectUrl);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('read-failed'));
        reader.readAsDataURL(file);
      };
      img.src = objectUrl;
    });
  }

  function updateSlipPreview(dataUrl) {
    const box = document.getElementById('uploadBox');
    if (!box) return;
    box.classList.add('has-file');
    const placeholder = box.querySelector('.upload-placeholder');
    if (placeholder) placeholder.hidden = true;
    let img = box.querySelector('.slip-preview');
    if (!img) {
      img = document.createElement('img');
      img.className = 'slip-preview';
      img.alt = 'สลิปการโอนเงิน';
      const actions = box.querySelector('.upload-actions');
      box.insertBefore(img, actions || null);
    }
    img.src = dataUrl;
  }

  async function handleSlipFile(file) {
    if (!isLikelyImageFile(file)) {
      toast('กรุณาเลือกไฟล์รูปภาพสลิป');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast('ไฟล์ใหญ่เกินไป กรุณาเลือกใหม่');
      return;
    }
    toast('กำลังเตรียมรูป...');
    try {
      const dataUrl = await compressSlipImage(file);
      state.slipFile = dataUrl;
      updateSlipPreview(dataUrl);
      syncSubmitState();
      const blockers = checkoutBlockers();
      if (blockers.length) {
        toast('แนบสลิปแล้ว — ' + blockers.map(b => b.msg).join(' และ '), 3200);
      } else {
        toast('แนบสลิปแล้ว พร้อมยืนยันคำสั่งซื้อ');
      }
    } catch {
      toast('อ่านรูปไม่สำเร็จ ลองเลือกใหม่อีกครั้ง');
    }
  }

  function bindSlipPicker(input, button) {
    if (input) {
      input.onchange = () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (file) handleSlipFile(file);
      };
    }
    if (button && input) {
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        input.click();
      };
    }
  }

  function toast(msg, ms) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), ms || 1800);
  }

  function renderThumb(m, size) {
    const cls = size === 'lg' ? 'detail-hero' : 'item-thumb';
    if (m.img) {
      return `<div class="${cls}"><img src="${m.img}" alt="${escapeHtml(m.th)}" loading="lazy" data-fallback-cat="${m.cat}"><div class="fallback" hidden>${catIcon()[m.cat] || ''}</div></div>`;
    }
    return `<div class="${cls}"><div class="fallback">${catIcon()[m.cat] || ''}</div></div>`;
  }

  function renderHeader() {
    const status = statusPillMeta();
    return `
    <header class="top">
      <div class="top-row">
        <div class="brand">
          <h1>DONG<span class="accent">HOOD</span></h1>
          <p class="tag">${escapeHtml(config.storeTagline)}</p>
        </div>
        <div>
          <div class="status-pill ${status.cls}">
            <span class="dot"></span>${status.label}
          </div>
          <div class="hours-note">${hoursTodayLabel()}</div>
        </div>
      </div>
    </header>`;
  }

  function renderSearch() {
    if (state.view !== 'menu') return '';
    return `
    <div class="search-wrap">
      <div class="search-box">
        ${ICON_SEARCH}
        <input type="search" id="searchInput" placeholder="ค้นหาเมนู..." value="${escapeHtml(state.search)}" autocomplete="off">
        <button type="button" class="search-clear ${state.search ? 'show' : ''}" id="searchClear">✕</button>
      </div>
    </div>`;
  }

  function renderTabs() {
    if (state.view !== 'menu') return '';
    return `<div class="tabs">${cats().map(c => `
      <div class="tab ${state.activeCat === c.id ? 'active' : ''}" data-cat="${c.id}">${c.label}</div>
    `).join('')}</div>`;
  }

  function renderItemCard(m) {
    const qty = state.cart[m.id] || 0;
    const disabled = m.soldOut;
    return `
    <div class="item-card ${m.soldOut ? 'soldout' : ''}" data-item="${m.id}">
      ${m.soldOut ? '<div class="soldout-tag">หมดวันนี้</div>' : ''}
      ${renderThumb(m)}
      <div class="item-body">
        <div class="item-tags">
          ${renderItemBadge(m)}
          ${m.spice ? `<span class="tag-spice">${spiceLabel(m.spice)}</span>` : ''}
        </div>
        <div class="item-name-th">${escapeHtml(m.th)}</div>
        <div class="item-name-en">${escapeHtml(m.en)}</div>
        <div class="item-bottom">
          <div class="item-price">฿${money(m.price)}</div>
          ${qty > 0 ? `
            <div class="qty-stepper" onclick="event.stopPropagation()">
              <button data-act="dec" data-id="${m.id}">−</button>
              <span>${qty}</span>
              <button data-act="inc" data-id="${m.id}">+</button>
            </div>
          ` : `<button class="add-btn" data-act="inc" data-id="${m.id}" ${disabled ? 'disabled' : ''} onclick="event.stopPropagation()">+ เพิ่ม</button>`}
        </div>
      </div>
    </div>`;
  }

  function renderDeliveryRates() {
    const zones = getZones().sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    return `
    <div class="section-label"><span class="num">—</span><h2>อัตราค่าจัดส่ง</h2></div>
    <div class="delivery-rates">
      <p class="delivery-rates-note">จัดส่งรอบเย็น (เริ่มหลัง 17:00) · เลือกโซนตอนสั่งซื้อ · ตัวเมืองส่งฟรีเมื่อครบ ฿${money(config.minDeliveryOrder || 200)}</p>
      <div class="delivery-rate-card">
        ${zones.map(z => {
          const freeAbove = zoneFreeAbove(z);
          return `
          <div class="delivery-rate-row">
            <div class="dr-left">
              <span class="dr-pin">${ICON_PIN}</span>
              <div>
                <div class="dr-name">${escapeHtml(z.nameTh)}</div>
                ${freeAbove ? `<div class="dr-note">ส่งฟรีเมื่อสั่งครบ ฿${money(freeAbove)}</div>` : ''}
              </div>
            </div>
            <div class="dr-fee mono">฿${money(zoneBaseFee(z))}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function renderMenu() {
    if (state.view !== 'menu') return '';

    if (state.activeCat === 'delivery') {
      return `<main>${renderDeliveryRates()}${renderContact()}</main>`;
    }

    const items = filteredMenu();
    if (!items.length) {
      return `<main><div class="empty-menu">ไม่พบเมนูที่ค้นหา<br><span style="font-size:12px;opacity:.7">ลองคำอื่นหรือเลือกหมวดหมู่อื่น</span></div></main>`;
    }

    const groups = state.activeCat === 'all'
      ? cats().filter(c => c.id !== 'all' && c.id !== 'delivery')
      : cats().filter(c => c.id === state.activeCat);

    const html = groups.map((c, idx) => {
      const catItems = items.filter(m => m.cat === c.id);
      if (!catItems.length) return '';
      const num = state.activeCat === 'all' ? String(idx + 1).padStart(2, '0') : '01';
      return `
      <div class="section-label" id="cat-${c.id}"><span class="num">${num}</span><h2>${c.label}</h2></div>
      ${catItems.map(renderItemCard).join('')}`;
    }).join('');

    const menuHero = menuImage() && state.activeCat === 'all' && !state.search.trim()
      ? `<div class="menu-hero"><img src="${menuImage()}" alt="เมนู Donghood" loading="eager"></div>`
      : '';

    return `<main>${menuHero}${html || '<div class="empty-menu">ไม่มีเมนูในหมวดนี้</div>'}${renderContact()}</main>`;
  }

  const CONTACT_ICONS = {
    phone: `<svg class="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8Z"/></svg>`,
    instagram: `<svg class="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm10 2H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3Zm-5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5Zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5ZM17.8 6.2a1.1 1.1 0 1 1-1.1 1.1 1.1 1.1 0 0 1 1.1-1.1Z"/></svg>`,
    facebook: `<svg class="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.4v3.2h2.7V22h3.4Z"/></svg>`,
    tiktok: `<svg class="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.6 8.3a6.3 6.3 0 0 1-3.7-1.2v7.1a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v3a3 3 0 1 0 2.1 2.8V2.5h2.9a6.3 6.3 0 0 0 3.7 3.6v2.2Z"/></svg>`,
    line: `<svg class="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.7 9.5c0-3.8-3.8-6.9-8.5-6.9S2.7 5.7 2.7 9.5c0 3.4 3 6.2 7.1 6.8.28.06.66.18.75.42.09.22.06.57.03.8l-.13.8c-.04.22-.18 1.1.95.6 1.13-.5 6.1-3.6 8.33-6.16.85-1.1 1.96-2.7 1.96-4.26Z"/></svg>`,
  };

  function contactLabel(icon, text) {
    return `<span class="contact-label">${CONTACT_ICONS[icon] || ''}<span>${text}</span></span>`;
  }

  function storePhoneNumbers() {
    const listed = Array.isArray(config.storePhones) ? config.storePhones : [];
    const digits = [...listed, config.storePhone]
      .map(p => String(p || '').replace(/\D/g, ''))
      .filter(Boolean);
    return [...new Set(digits)];
  }

  function phoneDisplayLabel(phone) {
    return phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }

  function renderContact() {
    if (state.view !== 'menu') return '';
    const phones = storePhoneNumbers();
    const social = config.social || {};
    const ig = social.instagram || '';
    const fb = social.facebook || '';
    const tt = (social.tiktok || '').replace(/^@/, '');
    const lineId = (social.line || '').replace(/^@/, '');
    return `
    <section class="contact-section">
      <div class="section-label"><span class="num">—</span><h2>ช่องทางติดต่อ</h2></div>
      <div class="contact-card">
        ${phones.map(p => `<a class="contact-row" href="tel:${p}">${contactLabel('phone', 'โทร')}<span class="contact-val">${phoneDisplayLabel(p)}</span></a>`).join('')}
        ${lineId ? `<a class="contact-row" href="https://line.me/R/ti/p/@${encodeURIComponent(lineId)}" target="_blank" rel="noopener noreferrer">${contactLabel('line', 'LINE')}<span class="contact-val">@${escapeHtml(lineId)}</span></a>` : ''}
        ${ig ? `<a class="contact-row" href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener noreferrer">${contactLabel('instagram', 'Instagram')}<span class="contact-val">${escapeHtml(ig)}</span></a>` : ''}
        ${fb ? `<a class="contact-row" href="https://www.facebook.com/search/top?q=${encodeURIComponent(fb)}" target="_blank" rel="noopener noreferrer">${contactLabel('facebook', 'Facebook')}<span class="contact-val">${escapeHtml(fb)}</span></a>` : ''}
        ${social.tiktok ? `<a class="contact-row" href="https://www.tiktok.com/@${encodeURIComponent(tt)}" target="_blank" rel="noopener noreferrer">${contactLabel('tiktok', 'TikTok')}<span class="contact-val">${escapeHtml(social.tiktok)}</span></a>` : ''}
        <p class="contact-note">น้ำจิ้มซีฟู้ด แซ่บ จัดจ้าน · น้ำจิ้มรสเด็ด สูตรเฉพาะทางร้าน</p>
        <a class="admin-link" href="../admin/">Admin</a>
      </div>
    </section>`;
  }

  function renderDetailSheet() {
    if (!state.detailItem) return '';
    const m = state.detailItem;
    const qty = state.cart[m.id] || 0;
    const disabled = m.soldOut;
    return `
    <div class="overlay show" data-close="detail">
      <div class="sheet" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div class="sheet-head"><h2>รายละเอียด</h2><button class="close-x" data-close="detail">✕</button></div>
        <div class="sheet-body">
          ${renderThumb(m, 'lg')}
          <div class="detail-meta">
            <div class="item-tags">
              ${renderItemBadge(m)}
              ${m.spice ? `<span class="tag-spice">${spiceLabel(m.spice)} เผ็ด</span>` : ''}
              ${m.soldOut ? '<span class="soldout-tag" style="position:static">หมดวันนี้</span>' : ''}
            </div>
            <h3>${escapeHtml(m.th)}</h3>
            <div class="en">${escapeHtml(m.en)}</div>
            <div class="desc">${escapeHtml(m.desc || '')}</div>
            <div class="price-row">
              <div class="price">฿${money(m.price)}</div>
              ${qty > 0 ? `
                <div class="qty-stepper">
                  <button data-act="dec" data-id="${m.id}">−</button>
                  <span>${qty}</span>
                  <button data-act="inc" data-id="${m.id}">+</button>
                </div>
              ` : `<button class="add-btn" data-act="inc" data-id="${m.id}" ${disabled ? 'disabled' : ''}>+ เพิ่มลงตะกร้า</button>`}
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderCartBar() {
    const count = cartCount();
    if (!count || state.view !== 'menu') return `<div class="cart-bar hidden"></div>`;
    return `
    <div class="cart-bar" id="cartBar">
      <div class="cb-left"><div class="cart-count">${count}</div><div class="cb-label">ดูตะกร้า</div></div>
      <div class="cb-total mono">฿${money(cartTotal())}</div>
    </div>`;
  }

  function renderCartSheet() {
    const show = state.view === 'cart';
    if (show) ensureValidOrderDate();
    const lines = cartLines();
    const dates = upcomingDates();
    const zones = state.date ? zonesForDate(state.date) : [];
    const legacyRounds = state.date ? legacyRoundsForDate(state.date) : [];
    const slots = state.date && state.zone ? slotsForZone(state.date, state.zone) : [];
    const pickupSlots = state.date ? pickupSlotsForDate(state.date) : [];
    const phoneValid = isValidThaiPhone(state.phone);
    const canContinue = cartCanContinue();
    const afterClose = isAfterCloseToday();

    return `
    <div class="overlay ${show ? 'show' : ''}" data-close="cart">
      <div class="sheet" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div class="sheet-head"><h2>ตะกร้า</h2><button class="close-x" data-close="cart">✕</button></div>
        <div class="sheet-body">
          ${!lines.length ? `<div class="empty-note">ยังไม่มีรายการในตะกร้า</div>` : `
          <div class="ticket">
            ${lines.map(l => `
              <div class="cart-line">
                <div>
                  <div class="cl-name">${escapeHtml(l.item.th)}</div>
                  <div class="cl-sub">${escapeHtml(l.item.en)} · ฿${money(l.item.price)}</div>
                </div>
                <div class="cl-right">
                  <div class="qty-stepper">
                    <button data-act="dec" data-id="${l.item.id}">−</button>
                    <span>${l.qty}</span>
                    <button data-act="inc" data-id="${l.item.id}">+</button>
                  </div>
                  <div class="cl-price mono">฿${money(l.item.price * l.qty)}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="field-group">
            <span class="field-label">รับอาหารแบบไหน</span>
            <div class="toggle-row">
              <div class="toggle-btn ${state.orderType === 'delivery' ? 'active' : ''}" data-order-type="delivery">
                จัดส่ง <span class="tb-sub">${deliveryFeeLabel()}</span>
              </div>
              <div class="toggle-btn ${state.orderType === 'pickup' ? 'active' : ''}" data-order-type="pickup">
                มารับเอง <span class="tb-sub">ที่ร้าน</span>
              </div>
            </div>
          </div>

          <div class="field-group">
            <span class="field-label">${state.orderType === 'delivery' ? 'เลือกวันที่จัดส่ง' : 'เลือกวันที่รับ'}</span>
            <div class="date-row">
              ${dates.map(d => `
                <div class="date-chip ${state.date === d.key ? 'active' : ''} ${d.disabled ? 'disabled' : ''}" data-date="${d.key}">
                  <div class="dc-day">${d.dayLabel}${d.note ? ` · ${d.note}` : ''}</div>
                  <div class="dc-num">${d.numLabel}</div>
                </div>
              `).join('')}
            </div>
            ${state.orderType === 'delivery' && state.date && scheduleDay(state.date).enabled
    ? `<div class="field-hint">รอบจัดส่งเย็น · ส่งได้ถึง ${escapeHtml(cutoffLabel(scheduleDay(state.date).cutoffTime))} น.</div>`
    : ''}
            ${afterClose && state.orderType !== 'delivery' ? `<div class="field-hint">หลัง ${escapeHtml(closeTimeLabel())} น. รับที่ร้านได้ตั้งแต่วันถัดไป — สั่งล่วงหน้าได้เลย</div>` : ''}
            ${state.orderType === 'delivery' && !dates.some(d => !d.disabled)
    ? `<div class="field-error">ช่วงนี้ยังไม่เปิดวันจัดส่ง — ลองใหม่ภายหลังหรือติดต่อร้าน</div>`
    : ''}
          </div>

          ${state.date ? (state.orderType === 'delivery' ? `
          ${zones.length ? `
          <div class="field-group">
            <span class="field-label">เลือกโซนพื้นที่</span>
            <div class="zone-row">
              ${zones.map(z => `
                <div class="zone-chip ${state.zone === z.id ? 'active' : ''}" data-zone="${z.id}">
                  <div class="zc-name">${escapeHtml(z.nameTh)}</div>
                  <div class="zc-fee ${zoneFeeAmount(z) > 0 ? 'paid' : 'free'}">${zoneFeeLabel(z)}</div>
                </div>
              `).join('')}
            </div>
            ${state.zone && zoneFeeHint(selectedZoneInfo()) ? `<div class="field-hint">${escapeHtml(zoneFeeHint(selectedZoneInfo()))}</div>` : ''}
          </div>
          ` : ''}

          ${state.zone ? `
          <div class="field-group">
            <span class="field-label">เลือกรอบจัดส่ง</span>
            ${slots.length ? `
            <div class="slot-grid">
              ${slots.map(s => `
                <div class="slot-btn ${state.round === s.id ? 'active' : ''} ${s.disabled ? 'disabled' : ''}" data-round="${s.id}">${s.time}</div>
              `).join('')}
            </div>
            ` : `<div class="no-rounds">ยังไม่มีรอบจัดส่งในโซนนี้ กรุณาเลือกโซนอื่น</div>`}
          </div>
          ` : legacyRounds.length ? `
          <div class="field-group">
            <span class="field-label">รอบจัดส่ง (ตามพื้นที่)</span>
            ${legacyRounds.map(r => `
              <div class="round-card ${state.round === r.id ? 'active' : ''} ${r.disabled ? 'disabled' : ''}" data-round="${r.id}">
                <div>
                  <div class="rc-time">${r.time}</div>
                  <div class="rc-route">${escapeHtml(r.route)}${r.disabled ? ' · ปิดรับแล้ว' : ''}</div>
                </div>
                <div class="rc-check"></div>
              </div>
            `).join('')}
            <div class="field-hint">เลือกรอบที่ครอบคลุมพื้นที่ของคุณ</div>
          </div>
          ` : `<div class="field-group"><div class="no-rounds">วันนี้ยังไม่เปิดรอบจัดส่ง กรุณาเลือกวันอื่น</div></div>`}

          <div class="field-group">
            <span class="field-label">ที่อยู่จัดส่ง</span>
            <textarea id="addressInput" placeholder="บ้านเลขที่ ถนน ตำบล... จุดสังเกต">${escapeHtml(state.address)}</textarea>
          </div>

          <div class="field-group">
            <span class="field-label">ชื่อผู้สั่ง <span class="req">*</span></span>
            <input type="text" id="customerNameInputCart" placeholder="ชื่อที่ใช้ติดต่อ" value="${escapeHtml(state.customerName)}" autocomplete="name" class="${state.customerName && state.customerName.trim().length < 2 ? 'invalid' : ''}">
            ${state.customerName && state.customerName.trim().length < 2 ? '<div class="field-error">กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร</div>' : ''}
          </div>
          <div class="field-group">
            <span class="field-label">เบอร์โทรติดต่อ <span class="req">*</span></span>
            <input type="tel" id="phoneInputCart" placeholder="08xxxxxxxx" value="${escapeHtml(state.phone)}" inputmode="tel" class="${state.phone && !phoneValid ? 'invalid' : ''}">
            ${state.phone && !phoneValid ? '<div class="field-error">กรุณากรอกเบอร์มือถือไทย 10 หลัก</div>' : ''}
          </div>
          ` : `
          <div class="field-group">
            <span class="field-label">เวลารับอาหาร</span>
            <div class="slot-grid">
              ${pickupSlots.length ? pickupSlots.map(s => `
                <div class="slot-btn ${state.round === s.id ? 'active' : ''} ${s.disabled ? 'disabled' : ''}" data-round="${s.id}">${s.time}</div>
              `).join('') : `<div class="no-rounds">วันนี้หมดเวลาสั่งแล้ว</div>`}
            </div>
          </div>

          <div class="field-group">
            <span class="field-label">ชื่อผู้สั่ง <span class="req">*</span></span>
            <input type="text" id="customerNameInputCart" placeholder="ชื่อที่ใช้ติดต่อ" value="${escapeHtml(state.customerName)}" autocomplete="name" class="${state.customerName && state.customerName.trim().length < 2 ? 'invalid' : ''}">
            ${state.customerName && state.customerName.trim().length < 2 ? '<div class="field-error">กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร</div>' : ''}
          </div>
          <div class="field-group">
            <span class="field-label">เบอร์โทรติดต่อ <span class="req">*</span></span>
            <input type="tel" id="phoneInputCart" placeholder="08xxxxxxxx" value="${escapeHtml(state.phone)}" inputmode="tel" class="${state.phone && !phoneValid ? 'invalid' : ''}">
            ${state.phone && !phoneValid ? '<div class="field-error">กรุณากรอกเบอร์มือถือไทย 10 หลัก</div>' : ''}
          </div>
          `) : ''}

          <div class="summary-row"><span>ยอดรวมอาหาร</span><span class="mono">฿${money(cartTotal())}</span></div>
          ${state.orderType === 'delivery' ? `<div class="summary-row"><span>ค่าจัดส่ง</span><span class="mono">${deliveryFeeSummary()}</span></div>` : ''}
          <div class="summary-row total"><span>รวมทั้งหมด</span><span class="mono">฿${money(cartTotal() + currentDeliveryFee())}</span></div>
          ${state.orderType === 'delivery' && state.zone && zoneFreeAbove(selectedZoneInfo()) && cartTotal() < zoneFreeAbove(selectedZoneInfo())
            ? `<div class="field-hint">${escapeHtml(zoneFeeHint(selectedZoneInfo()))}</div>`
            : ''}
          <button class="primary-btn" id="toCheckout" ${canContinue ? '' : 'disabled'}>ไปต่อ → ยืนยันและชำระเงิน</button>
          `}
        </div>
      </div>
    </div>`;
  }

  function renderCheckoutSheet() {
    const show = state.view === 'checkout';
    const total = cartTotal() + currentDeliveryFee();
    const roundInfo = selectedRoundInfo();
    const zoneInfo = selectedZoneInfo();
    const phoneValid = isValidThaiPhone(state.phone);
    const nameOk = state.customerName.trim().length >= 2;
    const emailTrim = state.email.trim();
    const emailOk = !emailTrim || isValidEmail(emailTrim);
    const isCod = state.paymentMethod === 'cod';
    const canSubmit = nameOk && phoneValid && emailOk && (isCod || state.slipFile) && !state.submitting;
    const codLabel = state.orderType === 'delivery' ? 'จ่ายตอนส่ง' : 'จ่ายตอนรับ';

    return `
    <div class="overlay ${show ? 'show' : ''}" data-close="checkout">
      <div class="sheet" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div class="sheet-head"><h2>ยืนยันคำสั่งซื้อ</h2><button class="close-x" data-close="checkout">✕</button></div>
        <div class="sheet-body">
          <div class="recap-card">
            <div class="recap-row">${ICON_CAL}<div><div class="rr-label">วันที่${state.orderType === 'delivery' ? 'จัดส่ง' : 'รับอาหาร'}</div><div class="rr-val">${selectedDateLabel()}</div></div></div>
            <div class="recap-row">${ICON_CLOCK}<div><div class="rr-label">เวลา</div><div class="rr-val">${roundInfo ? roundInfo.time : '-'}</div></div></div>
            ${state.orderType === 'delivery' ? `
            ${zoneInfo ? `<div class="recap-row">${ICON_PIN}<div><div class="rr-label">โซนพื้นที่</div><div class="rr-val">${escapeHtml(zoneInfo.nameTh)} · ${zoneFeeLabel(zoneInfo)}</div></div></div>` : roundInfo?.route ? `
            <div class="recap-row">${ICON_PIN}<div><div class="rr-label">พื้นที่จัดส่ง</div><div class="rr-val">${escapeHtml(roundInfo.route)}</div></div></div>
            ` : ''}
            <div class="recap-row">${ICON_PIN}<div><div class="rr-label">ที่อยู่จัดส่ง</div><div class="rr-val">${escapeHtml(state.address)}</div></div></div>
            ` : `
            <div class="recap-row">${ICON_PIN}<div><div class="rr-label">รับที่</div><div class="rr-val">${escapeHtml(config.pickupLocation)}</div></div></div>
            `}
          </div>

          <div class="field-group">
            <span class="field-label">ชื่อผู้สั่ง <span class="req">*</span></span>
            <input type="text" id="customerNameInput" placeholder="ชื่อที่ใช้ติดต่อ" value="${escapeHtml(state.customerName)}" autocomplete="name" class="${state.customerName && !nameOk ? 'invalid' : ''}">
            ${state.customerName && !nameOk ? '<div class="field-error">กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร</div>' : ''}
          </div>
          <div class="field-group">
            <span class="field-label">เบอร์โทรติดต่อ</span>
            <input type="tel" id="phoneInput" placeholder="08xxxxxxxx" value="${escapeHtml(state.phone)}" inputmode="tel" class="${state.phone && !phoneValid ? 'invalid' : ''}">
            ${state.phone && !phoneValid ? '<div class="field-error">กรุณากรอกเบอร์มือถือไทย 10 หลัก</div>' : ''}
          </div>
          <div class="field-group">
            <span class="field-label">อีเมล <span class="field-optional">(ไม่บังคับ)</span></span>
            <input type="email" id="emailInput" placeholder="you@email.com" value="${escapeHtml(state.email)}" autocomplete="email" inputmode="email" class="${emailTrim && !emailOk ? 'invalid' : ''}">
            ${emailTrim && !emailOk
      ? '<div class="field-error">รูปแบบอีเมลไม่ถูกต้อง</div>'
      : '<div class="field-hint">ใส่ไว้เพื่อให้แอดมินติดต่อและส่งสำเนาออร์เดอร์ได้ — ไม่ต้องล็อกอิน</div>'}
          </div>
          <div class="field-group">
            <span class="field-label">หมายเหตุ (ถ้ามี)</span>
            <textarea id="notesInput" placeholder="เช่น SET S เลือกกุ้งดอง / แซลมอนดอง / หมายเหตุอื่นๆ">${escapeHtml(state.notes)}</textarea>
          </div>

          <div class="field-group">
            <span class="field-label">วิธีชำระเงิน</span>
            <div class="toggle-row">
              <div class="toggle-btn ${!isCod ? 'active' : ''}" data-payment-method="promptpay">
                โอน PromptPay <span class="tb-sub">แนบสลิป</span>
              </div>
              <div class="toggle-btn ${isCod ? 'active' : ''}" data-payment-method="cod">
                ${codLabel} <span class="tb-sub">เงินสด</span>
              </div>
            </div>
          </div>

          ${!isCod ? `
          <div class="field-group">
            <span class="field-label">ชำระเงินผ่าน PromptPay</span>
            <div class="qr-box">
              <img class="qr-img" src="${escapeHtml(config.promptPayQr || '../assets/promptpay-qr.jpg')}" alt="QR PromptPay Donghood" width="320" height="480">
              <div class="amt">โอน ฿${money(total)}</div>
              <div class="qr-account">
                <div><span>ชื่อบัญชี</span><strong>${escapeHtml(config.promptPayName || '')}</strong></div>
                <div><span>ธนาคาร</span><strong>${escapeHtml(config.promptPayBank || '')}</strong></div>
                <div><span>เลขบัญชี</span><strong class="mono">${escapeHtml(config.promptPayAccount || '')}</strong></div>
              </div>
            </div>
            <div class="qr-note">สแกน QR หรือโอนเข้าบัญชีด้านบน แล้วแนบสลิปด้านล่าง</div>
          </div>

          <div class="field-group">
            <span class="field-label">แนบสลิปการโอนเงิน <span class="req">*</span></span>
            <div class="upload-box ${state.slipFile ? 'has-file' : ''}" id="uploadBox">
              <div class="upload-placeholder" ${state.slipFile ? 'hidden' : ''}>
                <div class="upload-icon">📷</div>
                เลือกสลิปจากคลังรูป หรือถ่ายใหม่
              </div>
              ${state.slipFile ? `<img class="slip-preview" src="${state.slipFile}" alt="สลิปการโอนเงิน">` : ''}
              <div class="upload-actions">
                <button type="button" class="upload-pick-btn" id="pickSlipGallery">เลือกจากคลังรูป</button>
                <button type="button" class="upload-pick-btn" id="pickSlipCamera">ถ่ายรูป</button>
              </div>
            </div>
            <input type="file" id="slipInputGallery" class="visually-hidden-file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif">
            <input type="file" id="slipInputCamera" class="visually-hidden-file" accept="image/*" capture="environment">
            <div class="field-hint">${isLineWebView()
        ? 'เปิดผ่าน LINE: กด «เลือกจากคลังรูป» เพื่อใช้รูปในเครื่อง หากยังเลือกไม่ได้ ให้เปิดหน้านี้ใน Safari หรือ Chrome'
        : 'เลือกจากคลังรูปได้เลย ไม่ต้องถ่ายใหม่'}</div>
          </div>
          ` : `
          <div class="field-group">
            <div class="cod-notice">
              <div class="cod-icon">💵</div>
              <div>
                <strong>${codLabel}</strong>
                <p>เตรียมเงินสด ฿${money(total)} ${state.orderType === 'delivery' ? 'ให้คนส่ง' : 'ตอนมารับอาหาร'}</p>
              </div>
            </div>
          </div>
          `}

          <div class="summary-row"><span>ยอดรวมอาหาร</span><span class="mono">฿${money(cartTotal())}</span></div>
          ${state.orderType === 'delivery' ? `<div class="summary-row"><span>ค่าจัดส่ง</span><span class="mono">${deliveryFeeSummary()}</span></div>` : ''}
          <div class="summary-row total"><span>ยอดที่ต้องชำระ</span><span class="mono">฿${money(total)}</span></div>

          <button type="button" class="primary-btn ${state.submitting ? 'loading' : ''} ${!canSubmit && !state.submitting ? 'is-blocked' : ''}" id="submitOrder">
            ${state.submitting ? '<span class="spinner"></span> กำลังส่ง...' : 'ยืนยันคำสั่งซื้อ'}
          </button>
          ${!canSubmit && !state.submitting ? `<div class="field-error submit-hint" id="submitHint">ยังขาด: ${checkoutBlockers().map(b => b.msg).join(' · ')}</div>` : '<div class="submit-hint" id="submitHint" hidden></div>'}
          <button type="button" class="ghost-btn" data-close="checkout">← กลับไปแก้ไขตะกร้า</button>
        </div>
      </div>
    </div>`;
  }

  function buildOrderReceiptText(order) {
    if (!order) return '';
    const lines = [
      `Donghood — ใบยืนยันออร์เดอร์`,
      `เลขออร์เดอร์: #${order.orderId}`,
      `ชื่อ: ${order.displayName || '-'}`,
      `โทร: ${order.phone || '-'}`,
      order.email ? `อีเมล: ${order.email}` : null,
      `ประเภท: ${order.orderType === 'delivery' ? 'จัดส่ง' : 'รับที่ร้าน'}`,
      `วันที่: ${order.dateLabel || order.date || '-'}`,
      `เวลา: ${order.roundInfo?.time || '-'}`,
      order.orderType === 'delivery'
        ? `ที่อยู่: ${order.address || '-'}${order.zoneName ? ` (${order.zoneName})` : ''}`
        : `รับที่: ${config.pickupLocation}`,
      '',
      'รายการ:',
      ...(order.items || []).map(i => `· ${i.th} × ${i.qty} = ฿${money((i.price || 0) * i.qty)}`),
      '',
      `ยอดอาหาร: ฿${money(order.subtotal || 0)}`,
      order.orderType === 'delivery' ? `ค่าจัดส่ง: ฿${money(order.deliveryFee || 0)}` : null,
      `ยอดรวม: ฿${money(order.total || 0)}`,
      `ชำระ: ${order.paymentMethod === 'cod' ? 'จ่ายปลายทาง' : 'PromptPay'}`,
      order.notes ? `หมายเหตุ: ${order.notes}` : null,
      '',
      'ร้านได้รับออร์เดอร์ในระบบแล้ว',
    ];
    return lines.filter(x => x != null).join('\n');
  }

  function storeLineOfficialUrl() {
    const id = String(config.social?.line || '').replace(/^@/, '').trim();
    if (!id) return null;
    return `https://line.me/R/ti/p/@${encodeURIComponent(id)}`;
  }

  function lineShareTextUrl(text) {
    return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
  }

  function drawOrderReceiptCard(order) {
    const items = order.items || [];
    const W = 720;
    const pad = 36;
    const lineH = 34;
    const extraRows = (order.orderType === 'delivery' ? 2 : 1) + (order.zoneName ? 1 : 0);
    const H = 360 + extraRows * 32 + items.length * lineH + (order.notes ? 56 : 0) + 90;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const cream = '#f2e9d8';
    const creamDim = '#c9bfae';
    const chili = '#d64933';
    const turmeric = '#e8a63d';
    const ink = '#1a1614';
    const inkSoft = '#2a2422';

    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = chili;
    ctx.fillRect(0, 0, W, 8);

    ctx.fillStyle = cream;
    ctx.font = '800 42px "Big Shoulders Display", "Noto Sans Thai", sans-serif';
    const dongW = ctx.measureText('DONG').width;
    ctx.fillText('DONG', pad, 64);
    ctx.fillStyle = chili;
    ctx.fillText('HOOD', pad + dongW, 64);

    ctx.fillStyle = turmeric;
    ctx.font = '700 28px "IBM Plex Mono", monospace';
    ctx.fillText(`#${order.orderId || ''}`, pad, 108);

    ctx.fillStyle = creamDim;
    ctx.font = '500 22px "Noto Sans Thai", sans-serif';
    ctx.fillText('ร้านได้รับออร์เดอร์ในระบบแล้ว', pad, 142);

    ctx.strokeStyle = '#3c3431';
    ctx.beginPath();
    ctx.moveTo(pad, 160);
    ctx.lineTo(W - pad, 160);
    ctx.stroke();

    let y = 198;
    const row = (label, val) => {
      ctx.fillStyle = creamDim;
      ctx.font = '500 18px "Noto Sans Thai", sans-serif';
      ctx.fillText(label, pad, y);
      ctx.fillStyle = cream;
      ctx.font = '600 20px "Noto Sans Thai", sans-serif';
      const maxW = W - pad * 2 - 140;
      let text = String(val || '-');
      while (ctx.measureText(text).width > maxW && text.length > 3) text = text.slice(0, -2) + '…';
      ctx.fillText(text, pad + 140, y);
      y += 32;
    };

    row('ชื่อ', order.displayName);
    row('โทร', order.phone);
    row('วัน/เวลา', `${order.dateLabel || order.date || '-'} · ${order.roundInfo?.time || '-'}`);
    if (order.orderType === 'delivery') {
      row('ที่อยู่', order.address);
      if (order.zoneName) row('โซน', order.zoneName);
    } else {
      row('รับที่', config.pickupLocation);
    }

    y += 8;
    ctx.fillStyle = creamDim;
    ctx.font = '700 16px "Noto Sans Thai", sans-serif';
    ctx.fillText('รายการ', pad, y);
    y += 28;
    items.forEach((i) => {
      ctx.fillStyle = cream;
      ctx.font = '500 20px "Noto Sans Thai", sans-serif';
      ctx.fillText(`${i.th} × ${i.qty}`, pad, y);
      ctx.font = '600 20px "IBM Plex Mono", monospace';
      const price = `฿${money((i.price || 0) * i.qty)}`;
      ctx.fillText(price, W - pad - ctx.measureText(price).width, y);
      y += lineH;
    });

    y += 10;
    ctx.fillStyle = inkSoft;
    ctx.fillRect(pad, y - 28, W - pad * 2, 48);
    ctx.fillStyle = cream;
    ctx.font = '700 22px "Noto Sans Thai", sans-serif';
    ctx.fillText('ยอดรวม', pad + 16, y + 4);
    ctx.fillStyle = turmeric;
    ctx.font = '700 26px "IBM Plex Mono", monospace';
    const total = `฿${money(order.total || 0)}`;
    ctx.fillText(total, W - pad - 16 - ctx.measureText(total).width, y + 4);

    y += 52;
    ctx.fillStyle = creamDim;
    ctx.font = '500 16px "Noto Sans Thai", sans-serif';
    ctx.fillText(
      order.paymentMethod === 'cod' ? 'ชำระ: จ่ายปลายทาง' : 'ชำระ: PromptPay',
      pad,
      y
    );
    if (order.notes) {
      y += 28;
      ctx.fillText(`หมายเหตุ: ${order.notes}`.slice(0, 60), pad, y);
    }

    return canvas;
  }

  function buildOrderReceiptImageUrl(order) {
    try {
      return drawOrderReceiptCard(order).toDataURL('image/png');
    } catch {
      return null;
    }
  }

  async function receiptImageFile(order) {
    const canvas = drawOrderReceiptCard(order);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return new File([blob], `donghood-${order.orderId || 'order'}.png`, { type: 'image/png' });
  }

  function renderConfirmSheet() {
    if (state.view !== 'confirm') return `<div class="overlay"></div>`;
    const order = state.lastOrder || {};
    const roundInfo = order.roundInfo || selectedRoundInfo();
    const zoneInfo = selectedZoneInfo();
    const isCod = order.paymentMethod === 'cod' || state.paymentMethod === 'cod';
    const codLabel = (order.orderType || state.orderType) === 'delivery' ? 'จ่ายตอนส่ง' : 'จ่ายตอนรับ';
    const hasEmail = !!(order.email && isValidEmail(order.email));
    const lineOaUrl = storeLineOfficialUrl();
    const mailTo = hasEmail ? order.email : '';
    const mailtoHref = `mailto:${mailTo}?subject=${encodeURIComponent(`Donghood ออร์เดอร์ #${state.orderId}`)}&body=${encodeURIComponent(buildOrderReceiptText(order))}`;
    const receiptUrl = state.receiptImageUrl;

    return `
    <div class="overlay show">
      <div class="sheet" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div class="confirm-wrap">
          <div class="confirm-check">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8fa31e" stroke-width="2.4"><path d="M4 12l5 5L20 6"/></svg>
          </div>
          <h2>ได้รับคำสั่งซื้อแล้ว</h2>
          <div class="order-id-row">
            <div class="order-id">#${state.orderId}</div>
            <button type="button" class="copy-btn" id="copyOrderId">คัดลอก</button>
          </div>

          <div class="confirm-received">
            <strong>ทางร้านได้รับออร์เดอร์นี้ในระบบแล้ว</strong>
            <p>ไม่ต้องส่ง LINE เพื่อให้ร้านรับออร์เดอร์ — สั่งผ่านเว็บนี้เรียบร้อยแล้ว${isCod
        ? `<br>กรุณาเตรียมเงินสด ${codLabel}`
        : '<br>ร้านกำลังตรวจสลิป จะติดต่อกลับทางเบอร์โทรเมื่อยืนยัน'}</p>
          </div>

          <div class="confirm-tip">
            <strong>แนะนำ</strong>
            <p>แคปหน้าจอนี้ไว้ หรือบันทึก/แชร์ใบออร์เดอร์ด้านล่าง เพื่อติดตามกับแอดมิน (เลข #${state.orderId})</p>
          </div>

          <div class="recap-card">
            <div class="recap-row">${ICON_CAL}<div><div class="rr-label">วันที่${(order.orderType || state.orderType) === 'delivery' ? 'จัดส่ง' : 'รับอาหาร'}</div><div class="rr-val">${order.dateLabel || selectedDateLabel()}</div></div></div>
            <div class="recap-row">${ICON_CLOCK}<div><div class="rr-label">เวลา</div><div class="rr-val">${roundInfo ? roundInfo.time : '-'}</div></div></div>
            ${(order.orderType || state.orderType) === 'delivery' ? `
            ${zoneInfo ? `<div class="recap-row">${ICON_PIN}<div><div class="rr-label">โซน</div><div class="rr-val">${escapeHtml(zoneInfo.nameTh)} · ${zoneFeeLabel(zoneInfo)}</div></div></div>` : (order.zoneName || roundInfo?.route) ? `
            <div class="recap-row">${ICON_PIN}<div><div class="rr-label">พื้นที่</div><div class="rr-val">${escapeHtml(order.zoneName || roundInfo.route)}</div></div></div>
            ` : ''}
            ` : ''}
            ${hasEmail ? `<div class="recap-row"><div style="width:18px"></div><div><div class="rr-label">อีเมลสำรอง</div><div class="rr-val">${escapeHtml(order.email)}</div></div></div>` : ''}
          </div>

          ${receiptUrl ? `
          <div class="receipt-card-preview">
            <div class="receipt-card-label">ร่างใบออร์เดอร์</div>
            <img src="${receiptUrl}" alt="ใบออร์เดอร์ #${escapeHtml(String(state.orderId || ''))}">
          </div>` : ''}

          <div class="confirm-actions">
            <button type="button" class="primary-btn" id="shareOrderToLine">แชร์ใบออร์เดอร์ไป LINE</button>
            <a class="ghost-btn confirm-link-btn" id="emailOrderReceipt" href="${mailtoHref}">ส่งสำเนาทางอีเมล</a>
            <button type="button" class="ghost-btn" id="saveOrderReceiptImage">บันทึกรูปใบออร์เดอร์</button>
            <button type="button" class="ghost-btn" id="copyOrderReceipt">คัดลอกข้อความออร์เดอร์</button>
            ${lineOaUrl ? `<a class="ghost-btn confirm-link-btn" href="${lineOaUrl}" target="_blank" rel="noopener">เปิด LINE ร้าน</a>` : ''}
          </div>
          <p class="confirm-actions-note">การแชร์ LINE / อีเมลเป็นทางเลือกสำหรับบันทึกหรือคุยกับแอดมิน — ออร์เดอร์เข้าสู่ระบบร้านแล้วตั้งแต่กดยืนยัน</p>

          <div class="status-track">
            <div class="st-step done"><div class="st-dot"></div><div class="st-label">รับออร์เดอร์</div></div>
            ${!isCod ? '<div class="st-step"><div class="st-dot"></div><div class="st-label">ตรวจสลิป</div></div>' : ''}
            <div class="st-step"><div class="st-dot"></div><div class="st-label">กำลังทำ</div></div>
            <div class="st-step"><div class="st-dot"></div><div class="st-label">${(order.orderType || state.orderType) === 'delivery' ? 'จัดส่ง' : 'พร้อมรับ'}</div></div>
          </div>
          <button class="primary-btn" id="backToMenu" style="margin-top:26px;">กลับไปหน้าเมนู</button>
        </div>
      </div>
    </div>`;
  }

  function captureOpenSheet() {
    const overlay = document.querySelector('.overlay.show');
    const sheet = overlay?.querySelector('.sheet');
    if (!sheet) return null;
    return {
      view: state.view,
      detailId: state.detailItem?.id || null,
      scrollTop: sheet.scrollTop,
    };
  }

  function restoreOpenSheet(saved) {
    if (!saved) return;
    const sameSheet =
      saved.view === state.view &&
      saved.detailId === (state.detailItem?.id || null);
    if (!sameSheet) return;
    const overlay = document.querySelector('.overlay.show');
    const sheet = overlay?.querySelector('.sheet');
    if (!sheet) return;
    // Skip open animations so re-render does not flicker / jump to top.
    overlay.style.animation = 'none';
    sheet.style.animation = 'none';
    sheet.scrollTop = saved.scrollTop;
  }

  function render() {
    const savedSheet = captureOpenSheet();
    const app = document.getElementById('app');
    app.innerHTML = renderHeader() + renderSearch() + renderTabs() + renderMenu()
      + renderCartBar() + renderDetailSheet() + renderCartSheet()
      + renderCheckoutSheet() + renderConfirmSheet();
    bindEvents();
    restoreOpenSheet(savedSheet);
  }

  function changeQty(id, delta) {
    const item = itemById(id);
    if (item.soldOut) return;
    const cur = state.cart[id] || 0;
    const next = Math.max(0, cur + delta);
    if (next === 0) delete state.cart[id];
    else state.cart[id] = next;
    if (delta > 0) toast(`เพิ่ม ${item.th} แล้ว`);
    render();
  }

  function bindImageFallbacks() {
    document.querySelectorAll('.item-thumb img, .detail-hero img').forEach(img => {
      img.onerror = () => {
        img.hidden = true;
        const fallback = img.nextElementSibling;
        if (fallback) fallback.hidden = false;
      };
    });
  }

  function bindEvents() {
    bindImageFallbacks();

    document.querySelectorAll('[data-cat]').forEach(el => {
      el.onclick = () => { state.activeCat = el.dataset.cat; render(); };
    });

    document.querySelectorAll('[data-item]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-act]')) return;
        state.detailItem = itemById(el.dataset.item);
        render();
      };
    });

    document.querySelectorAll('[data-act]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const delta = el.dataset.act === 'inc' ? 1 : -1;
        changeQty(el.dataset.id, delta);
      };
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.oninput = () => {
        state.search = searchInput.value;
        const clearBtn = document.getElementById('searchClear');
        if (clearBtn) clearBtn.classList.toggle('show', !!state.search);
        renderMenuOnly();
      };
    }

    const searchClear = document.getElementById('searchClear');
    if (searchClear) {
      searchClear.onclick = () => { state.search = ''; render(); };
    }

    const dismissBanner = document.getElementById('dismissBanner');
    if (dismissBanner) {
      dismissBanner.onclick = () => {
        state.bannerDismissed = true;
        localStorage.setItem('dh-banner-dismissed', '1');
        render();
      };
    }

    document.querySelectorAll('[data-close]').forEach(el => {
      el.onclick = (e) => {
        if (e.target !== el && !el.classList.contains('close-x')) return;
        if (el.dataset.close === 'detail') state.detailItem = null;
        else state.view = 'menu';
        render();
      };
    });

    document.querySelectorAll('.close-x[data-close]').forEach(el => {
      el.onclick = () => {
        if (el.dataset.close === 'detail') state.detailItem = null;
        else state.view = 'menu';
        render();
      };
    });

    const cartBar = document.getElementById('cartBar');
    if (cartBar) cartBar.onclick = () => { state.view = 'cart'; render(); };

    document.querySelectorAll('[data-order-type]').forEach(el => {
      el.onclick = () => {
        state.orderType = el.dataset.orderType;
        state.zone = null;
        state.round = null;
        ensureValidOrderDate();
        render();
      };
    });

    document.querySelectorAll('[data-payment-method]').forEach(el => {
      el.onclick = () => {
        state.paymentMethod = el.dataset.paymentMethod;
        if (state.paymentMethod === 'cod') state.slipFile = null;
        render();
      };
    });

    document.querySelectorAll('[data-date]').forEach(el => {
      if (el.classList.contains('disabled')) return;
      el.onclick = () => { state.date = el.dataset.date; state.zone = null; state.round = null; render(); };
    });

    document.querySelectorAll('[data-zone]').forEach(el => {
      el.onclick = () => { state.zone = el.dataset.zone; state.round = null; render(); };
    });

    document.querySelectorAll('[data-round]').forEach(el => {
      if (el.classList.contains('disabled')) return;
      el.onclick = () => { state.round = el.dataset.round; render(); };
    });

    const toCheckout = document.getElementById('toCheckout');
    if (toCheckout) toCheckout.onclick = () => { state.view = 'checkout'; render(); };

    const addressInput = document.getElementById('addressInput');
    if (addressInput) {
      addressInput.oninput = () => { state.address = addressInput.value; syncCartContinueState(); };
    }

    const phoneInputCart = document.getElementById('phoneInputCart');
    if (phoneInputCart) {
      phoneInputCart.oninput = () => { state.phone = phoneInputCart.value; syncCartContinueState(); };
    }

    const customerNameInputCart = document.getElementById('customerNameInputCart');
    if (customerNameInputCart) {
      customerNameInputCart.oninput = () => { state.customerName = customerNameInputCart.value; syncCartContinueState(); };
    }

    const customerNameInput = document.getElementById('customerNameInput');
    if (customerNameInput) {
      customerNameInput.oninput = () => { state.customerName = customerNameInput.value; syncSubmitState(); };
    }

    const phoneInput = document.getElementById('phoneInput');
    if (phoneInput) {
      phoneInput.oninput = () => { state.phone = phoneInput.value; syncSubmitState(); };
    }

    const emailInput = document.getElementById('emailInput');
    if (emailInput) {
      emailInput.oninput = () => { state.email = emailInput.value; syncSubmitState(); };
    }

    const notesInput = document.getElementById('notesInput');
    if (notesInput) {
      notesInput.oninput = () => { state.notes = notesInput.value; };
    }

    bindSlipPicker(document.getElementById('slipInputGallery'), document.getElementById('pickSlipGallery'));
    bindSlipPicker(document.getElementById('slipInputCamera'), document.getElementById('pickSlipCamera'));
    const uploadBox = document.getElementById('uploadBox');
    const galleryInput = document.getElementById('slipInputGallery');
    if (uploadBox && galleryInput) {
      uploadBox.onclick = (e) => {
        if (e.target.closest('button')) return;
        galleryInput.click();
      };
    }

    const submitBtn = document.getElementById('submitOrder');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const blockers = checkoutBlockers();
        if (blockers.length) {
          toast(blockers.map(b => b.msg).join(' · '), 2800);
          scrollToCheckoutField(blockers[0].fieldId);
          return;
        }
        if (state.submitting) return;
        state.submitting = true;
        render();

        const deliveryFee = currentDeliveryFee();
        const roundInfo = selectedRoundInfo();
        const zoneInfo = selectedZoneInfo();
        const order = {
          userId: guestUserId,
          displayName: state.customerName.trim(),
          phone: state.phone,
          email: state.email.trim(),
          notes: state.notes,
          orderType: state.orderType,
          date: state.date,
          dateLabel: selectedDateLabel(),
          zoneId: state.zone || roundInfo?.zoneId || '',
          zoneName: zoneInfo?.nameTh || roundInfo?.zoneName || roundInfo?.route || '',
          round: state.round,
          roundInfo,
          address: state.address,
          items: cartLines().map(l => ({ id: l.item.id, th: l.item.th, qty: l.qty, price: l.item.price })),
          subtotal: cartTotal(),
          deliveryFee,
          total: cartTotal() + deliveryFee,
          paymentMethod: state.paymentMethod,
          slipFile: state.paymentMethod === 'promptpay' ? state.slipFile : null,
        };

        try {
          const result = await DH.submitOrder(order);
          state.orderId = result.orderId;
          state.lastOrder = { ...order, orderId: result.orderId, slipFile: null };
          state.receiptImageUrl = buildOrderReceiptImageUrl(state.lastOrder);
          state.cart = {};
          state.view = 'confirm';
          state.submitting = false;
          render();
          toast('ส่งคำสั่งซื้อเรียบร้อย');
        } catch (err) {
          console.error('submitOrder failed', err);
          state.submitting = false;
          render();
          toast('ส่งไม่สำเร็จ ลองใหม่อีกครั้ง');
        }
      };
    }

    const copyOrderId = document.getElementById('copyOrderId');
    if (copyOrderId) {
      copyOrderId.onclick = async () => {
        try {
          await navigator.clipboard.writeText(state.orderId);
          toast('คัดลอกเลขออร์เดอร์แล้ว');
        } catch {
          toast(state.orderId);
        }
      };
    }

    const copyOrderReceipt = document.getElementById('copyOrderReceipt');
    if (copyOrderReceipt) {
      copyOrderReceipt.onclick = async () => {
        const text = buildOrderReceiptText(state.lastOrder);
        try {
          await navigator.clipboard.writeText(text);
          toast('คัดลอกรายละเอียดแล้ว');
        } catch {
          toast('คัดลอกไม่สำเร็จ');
        }
      };
    }

    const shareOrderToLine = document.getElementById('shareOrderToLine');
    if (shareOrderToLine) {
      shareOrderToLine.onclick = async () => {
        const order = state.lastOrder;
        const text = buildOrderReceiptText(order);
        const shareText = `${text}\n\n(แชร์เพื่อบันทึก/คุยกับแอดมิน — ร้านได้รับออร์เดอร์ในระบบแล้ว)`;
        try {
          const file = await receiptImageFile(order);
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Donghood #${state.orderId}`,
              text: shareText,
            });
            toast('เลือก LINE จากรายการแชร์ได้');
            return;
          }
          if (navigator.share) {
            await navigator.share({ title: `Donghood #${state.orderId}`, text: shareText });
            return;
          }
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
        try {
          await navigator.clipboard.writeText(shareText);
          window.open(lineShareTextUrl(shareText), '_blank', 'noopener');
          toast('คัดลอกข้อความแล้ว — วางใน LINE ได้');
        } catch {
          window.open(lineShareTextUrl(shareText), '_blank', 'noopener');
        }
      };
    }

    const saveOrderReceiptImage = document.getElementById('saveOrderReceiptImage');
    if (saveOrderReceiptImage) {
      saveOrderReceiptImage.onclick = () => {
        const url = state.receiptImageUrl || buildOrderReceiptImageUrl(state.lastOrder);
        if (!url) {
          toast('สร้างรูปไม่สำเร็จ');
          return;
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = `donghood-${state.orderId || 'order'}.png`;
        a.click();
        toast('กำลังบันทึกรูปใบออร์เดอร์');
      };
    }

    const backToMenu = document.getElementById('backToMenu');
    if (backToMenu) {
      backToMenu.onclick = () => {
        state.view = 'menu';
        state.orderType = 'delivery';
        state.address = '';
        state.customerName = '';
        state.phone = '';
        state.email = '';
        state.notes = '';
        state.date = null;
        state.zone = null;
        state.round = null;
        state.slipFile = null;
        state.paymentMethod = 'promptpay';
        state.detailItem = null;
        state.lastOrder = null;
        state.receiptImageUrl = null;
        render();
      };
    }
  }

  function renderMenuOnly() {
    const main = document.querySelector('main');
    const searchWrap = document.querySelector('.search-wrap');
    if (main) main.outerHTML = renderMenu();
    if (searchWrap) {
      const clearBtn = document.getElementById('searchClear');
      if (clearBtn) clearBtn.classList.toggle('show', !!state.search);
    }
    bindMenuEvents();
  }

  function bindMenuEvents() {
    document.querySelectorAll('[data-cat]').forEach(el => {
      el.onclick = () => { state.activeCat = el.dataset.cat; render(); };
    });
    document.querySelectorAll('[data-item]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-act]')) return;
        state.detailItem = itemById(el.dataset.item);
        render();
      };
    });
    document.querySelectorAll('[data-act]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        changeQty(el.dataset.id, el.dataset.act === 'inc' ? 1 : -1);
      };
    });
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.focus();
      const len = searchInput.value.length;
      searchInput.setSelectionRange(len, len);
    }
  }

  function syncCartContinueState() {
    const btn = document.getElementById('toCheckout');
    if (!btn) return;
    btn.disabled = !cartCanContinue();
    const phoneInputCart = document.getElementById('phoneInputCart');
    if (phoneInputCart) {
      const phoneValid = isValidThaiPhone(state.phone);
      phoneInputCart.classList.toggle('invalid', state.phone && !phoneValid);
    }
    const customerNameInputCart = document.getElementById('customerNameInputCart');
    if (customerNameInputCart) {
      customerNameInputCart.classList.toggle('invalid', state.customerName && state.customerName.trim().length < 2);
    }
  }

  function syncSubmitState() {
    const submitBtn = document.getElementById('submitOrder');
    const phoneInput = document.getElementById('phoneInput');
    const customerNameInput = document.getElementById('customerNameInput');
    const emailInput = document.getElementById('emailInput');
    const submitHint = document.getElementById('submitHint');
    if (!submitBtn) return;
    const blockers = checkoutBlockers();
    const phoneValid = isValidThaiPhone(state.phone);
    const nameOk = state.customerName.trim().length >= 2;
    const emailTrim = state.email.trim();
    const emailOk = !emailTrim || isValidEmail(emailTrim);
    if (phoneInput) phoneInput.classList.toggle('invalid', state.phone && !phoneValid);
    if (customerNameInput) customerNameInput.classList.toggle('invalid', state.customerName && !nameOk);
    if (emailInput) emailInput.classList.toggle('invalid', emailTrim && !emailOk);
    const ready = !blockers.length && !state.submitting;
    submitBtn.disabled = false;
    submitBtn.classList.toggle('is-blocked', !ready);
    if (submitHint) {
      if (blockers.length && !state.submitting) {
        submitHint.hidden = false;
        submitHint.textContent = 'ยังขาด: ' + blockers.map(b => b.msg).join(' · ');
      } else {
        submitHint.hidden = true;
        submitHint.textContent = '';
      }
    }
  }

  function init() {
    DELIVERY_SCHEDULE = DH.getDeliverySchedule();
    DELIVERY_ZONES = DH.getDeliveryZones();
    guestUserId = DH.initGuestSession().userId;
    render();
  }

  DH.startApp = init;
})();
