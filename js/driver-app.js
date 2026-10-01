import {
  getDriver,
  watchDriverOrders,
  fetchZones,
  ORDER_STATUS,
  formatDateLabelParts,
  localDateKey,
} from './admin-service.js';

const { escapeHtml, money } = window.DH?.util || {
  escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; },
  money(n) { return n.toLocaleString('th-TH'); },
};

const DAY_RANGE = 7;

const state = {
  token: new URLSearchParams(window.location.search).get('t') || '',
  driver: null,
  orders: [],
  selectedDate: localDateKey(),
  calendarOffset: 0,
  error: '',
  loading: true,
};

let unsubOrders = null;

function todayKey() {
  return localDateKey();
}

function dateKeys() {
  return Array.from({ length: DAY_RANGE }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + state.calendarOffset + i);
    return localDateKey(d);
  });
}

function ensureSelectedDate() {
  const keys = dateKeys();
  if (!state.selectedDate || !keys.includes(state.selectedDate)) {
    state.selectedDate = keys[0];
  }
}

function statusClass(s) {
  if (s === 'pending_slip_review') return 'pending';
  return s || '';
}

function renderCalendar() {
  ensureSelectedDate();
  const keys = dateKeys();
  const today = todayKey();
  const counts = {};
  state.orders.forEach((o) => {
    if (o.status === 'cancelled' || !o.date) return;
    counts[o.date] = (counts[o.date] || 0) + 1;
  });

  return `
  <div class="cal-head">
    <button type="button" class="btn btn-ghost btn-sm" data-cal-shift="-7">‹ 7 วัน</button>
    <span class="cal-range">${formatDateLabelParts(keys[0]).dayLabel} – ${formatDateLabelParts(keys[keys.length - 1]).dateLabel}</span>
    <button type="button" class="btn btn-ghost btn-sm" data-cal-shift="7">7 วัน ›</button>
    ${state.calendarOffset !== 0 ? '<button type="button" class="btn btn-ghost btn-sm" data-cal-today>วันนี้</button>' : ''}
  </div>
  <div class="cal-strip">
    ${keys.map((dateKey) => {
    const cnt = counts[dateKey] || 0;
    const { dayShort, dayNum, dateLabel } = formatDateLabelParts(dateKey);
    return `
      <button type="button" class="cal-day ${state.selectedDate === dateKey ? 'selected' : ''} ${dateKey === today ? 'today' : ''} ${cnt ? 'has-orders' : ''}" data-cal-day="${dateKey}" title="${dateLabel}">
        <span class="cal-day-name">${dayShort}</span>
        <span class="cal-day-date">${dayNum}</span>
        <span class="cal-count ${cnt ? '' : 'empty'}">${cnt || '—'}</span>
      </button>`;
  }).join('')}
  </div>`;
}

function renderOrderCard(o) {
  const items = (o.items || []).map(i => `${escapeHtml(i.th || i.id)} ×${i.qty}`).join(', ');
  return `
  <article class="job-card ${statusClass(o.status)}">
    <div class="job-head">
      <span class="job-id">#${escapeHtml(o.orderId || '—')}</span>
      <span class="status-pill ${statusClass(o.status)}">${ORDER_STATUS[o.status] || o.status}</span>
    </div>
    <p class="job-customer"><strong>${escapeHtml(o.displayName || '—')}</strong></p>
    <p class="job-meta">${escapeHtml(o.roundTime || '—')} · ฿${money(o.total || 0)}</p>
    ${o.zoneName ? `<p class="job-zone">📍 ${escapeHtml(o.zoneName)}</p>` : ''}
    ${o.address ? `<p class="job-addr">${escapeHtml(o.address)}</p>` : ''}
    ${o.phone ? `<a class="job-phone" href="tel:${escapeHtml(o.phone)}">📞 ${escapeHtml(o.phone)}</a>` : ''}
    ${items ? `<p class="job-items">${items}</p>` : ''}
    ${o.notes ? `<p class="job-notes">หมายเหตุ: ${escapeHtml(o.notes)}</p>` : ''}
  </article>`;
}

function render() {
  const app = document.getElementById('app');
  if (!state.token) {
    app.innerHTML = '<div class="wrap"><p class="err">ลิงก์ไม่ถูกต้อง — ขอลิงก์จากแอดมินร้าน</p></div>';
    return;
  }
  if (state.loading && !state.driver) {
    app.innerHTML = '<div class="wrap"><p class="loading">กำลังโหลด...</p></div>';
    return;
  }
  if (state.error) {
    app.innerHTML = `<div class="wrap"><p class="err">${escapeHtml(state.error)}</p></div>`;
    return;
  }

  ensureSelectedDate();
  const dayOrders = state.orders.filter(o => o.date === state.selectedDate && o.status !== 'cancelled');
  const zones = (state.driver.zoneIds || [])
    .map(id => state.driver.zoneLabels?.[id] || id)
    .join(', ');

  app.innerHTML = `
  <div class="wrap">
    <header class="head">
      <div>
        <p class="brand">DONG<span>HOOD</span></p>
        <h1>${escapeHtml(state.driver.name)}</h1>
        <p class="sub">งานส่ง · ${escapeHtml(zones || 'ทุกโซน')}</p>
      </div>
      <a class="btn btn-ghost btn-sm" href="tel:${escapeHtml(state.driver.phone || '')}">โทรร้าน</a>
    </header>
    ${renderCalendar()}
    <h2 class="section-title">${formatDateLabelParts(state.selectedDate).dayLabel} · ${formatDateLabelParts(state.selectedDate).dateLabel} · ${dayOrders.length} งาน</h2>
    ${!dayOrders.length
    ? '<p class="empty">ไม่มีงานส่งวันนี้</p>'
    : `<div class="job-list">${dayOrders.map(renderOrderCard).join('')}</div>`}
    <p class="foot">ลิงก์ส่วนตัว — อย่าแชร์ให้คนอื่น · อัปเดตแบบเรียลไทม์</p>
  </div>`;

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-cal-shift]').forEach(btn => {
    btn.onclick = () => {
      state.calendarOffset += Number(btn.dataset.calShift);
      ensureSelectedDate();
      render();
    };
  });
  document.querySelector('[data-cal-today]')?.addEventListener('click', () => {
    state.calendarOffset = 0;
    state.selectedDate = todayKey();
    render();
  });
  document.querySelectorAll('[data-cal-day]').forEach(btn => {
    btn.onclick = () => {
      state.selectedDate = btn.dataset.calDay;
      render();
    };
  });
}

export async function startDriverApp() {
  render();
  if (!state.token) return;

  try {
    const driver = await getDriver(state.token);
    if (!driver || driver.active === false) {
      state.error = 'ไม่พบคนส่ง หรือปิดใช้งานแล้ว';
      state.loading = false;
      render();
      return;
    }
    const zones = await fetchZones();
    driver.zoneLabels = Object.fromEntries(zones.map(z => [z.id, z.nameTh]));
    state.driver = driver;
    state.loading = false;

    if (unsubOrders) unsubOrders();
    unsubOrders = watchDriverOrders(state.token, (orders, err) => {
      if (err) state.error = 'โหลดงานไม่สำเร็จ';
      else state.error = '';
      state.orders = orders.filter(o => o.orderType !== 'pickup');
      render();
    });
    render();
  } catch (err) {
    state.error = err.message;
    state.loading = false;
    render();
  }
}
