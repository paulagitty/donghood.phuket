import {
  watchAuth,
  adminSignIn,
  adminSignOut,
  adminLabel,
  watchOrders,
  updateOrderStatus,
  fetchMenu,
  saveMenuItem,
  deleteMenuItem,
  fetchSettings,
  saveSettings,
  uploadPromptPayQr,
  uploadMenuImage,
  resetMenuImage,
  uploadMenuItemImage,
  resetMenuItemToCatalog,
  catalogMenuItem,
  DEFAULT_MENU_IMAGE,
  fetchSchedule,
  saveSchedule,
  fetchZones,
  saveZone,
  deleteZone,
  fetchDrivers,
  saveDriver,
  deleteDriver,
  seedDefaultDrivers,
  updateOrderDriver,
  driverJobUrl,
  driverForZone,
  seedInitialDeliveryData,
  seedInitialMenuData,
  localDateKey,
  upcomingDateKeys,
  formatDateLabel,
  formatDateLabelParts,
  DEFAULT_DELIVERY_TIMES,
  DEFAULT_CUTOFF_TIME,
  ORDER_STATUS,
  PAYMENT_METHOD,
  MENU_CATS,
} from './admin-service.js';

const { escapeHtml, money } = window.DH?.util || {
  escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; },
  money(n) { return n.toLocaleString('th-TH'); },
};

const STATUS_FLOW = ['pending_slip_review', 'confirmed', 'preparing', 'ready', 'completed'];
const ADMIN_STATUS_LABELS = {
  pending_slip_review: 'ออร์เดอร์ใหม่',
  confirmed: 'ยืนยันแล้ว',
  preparing: 'กำลังทำ',
  ready: 'พร้อมส่ง/รับ',
  completed: 'ส่งแล้ว',
  cancelled: 'ยกเลิก',
};
const ORDERS_DAY_RANGE = 7; // แสดงทีละ 7 วัน
const DEFAULT_CLOSE_TIME = '15:00';

const state = {
  user: null,
  view: 'orders',
  orders: [],
  ordersFilter: 'all',
  ordersDate: localDateKey(),
  ordersCalendarOffset: 0,
  selectedOrder: null,
  menu: [],
  editingItem: null,
  settings: null,
  zones: [],
  drivers: [],
  editingZone: null,
  editingDriver: null,
  scheduleDate: upcomingDateKeys(1)[0],
  scheduleZone: null,
  scheduleRounds: [],
  scheduleEnabled: true,
  scheduleCutoff: DEFAULT_CUTOFF_TIME,
  scheduleCloseOn: false,
  scheduleCloseMode: 'now',
  scheduleCloseAt: DEFAULT_CLOSE_TIME,
  scheduleClosedReason: '',
  modal: null,
  loading: false,
  loginError: '',
  navOpen: false,
  pendingQrFile: null,
  pendingQrPreviewUrl: '',
};

let unsubOrders = null;
let ordersWatchReady = false;
const unseenOrderIds = new Set();

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2000);
}

function pendingCount() {
  return state.orders.filter(o => o.status === 'pending_slip_review').length;
}

const VIEW_TITLES = {
  orders: 'ออร์เดอร์',
  menu: 'เมนู',
  zones: 'โซนจัดส่ง',
  drivers: 'คนส่ง',
  schedule: 'ตารางจัดส่ง',
  settings: 'ตั้งค่าร้าน',
};

function setNavOpen(open) {
  state.navOpen = !!open;
  const shell = document.querySelector('.admin-shell');
  shell?.classList.toggle('nav-open', state.navOpen);
  document.body.classList.toggle('nav-lock', state.navOpen);
  const toggle = document.getElementById('navToggle');
  if (toggle) toggle.setAttribute('aria-expanded', state.navOpen ? 'true' : 'false');
}

function orderCreatedTime(o) {
  return o.createdAt?.toDate?.()?.getTime() || 0;
}

function sortOrders(list) {
  return [...list].sort((a, b) => {
    const aNew = a.status === 'pending_slip_review' ? 1 : 0;
    const bNew = b.status === 'pending_slip_review' ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    return orderCreatedTime(b) - orderCreatedTime(a);
  });
}

function isNewOrder(o) {
  return o.status === 'pending_slip_review';
}

function isUnseenOrder(o) {
  return isNewOrder(o) && unseenOrderIds.has(o.firestoreId);
}

function markOrderSeen(firestoreId) {
  unseenOrderIds.delete(firestoreId);
}

function markOrderSeenIfPending(o) {
  if (o?.firestoreId && isNewOrder(o)) markOrderSeen(o.firestoreId);
}

function statusClass(s) {
  if (s === 'pending_slip_review') return 'pending';
  return s;
}

function orderZoneLabel(o) {
  if (o.orderType === 'pickup') return 'รับที่ร้าน';
  return o.zoneName || o.roundRoute || '—';
}

function paymentMethodLabel(o) {
  return PAYMENT_METHOD[o.paymentMethod] || PAYMENT_METHOD.promptpay;
}

function isCodOrder(o) {
  return o.paymentMethod === 'cod';
}

function nextOrderStatus(status) {
  const idx = STATUS_FLOW.indexOf(status);
  if (idx < 0 || idx >= STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}

function renderStatusSelect(o) {
  return `
    <select class="status-select ${statusClass(o.status)} ${isUnseenOrder(o) ? 'unseen' : ''}" data-order-status="${o.firestoreId}" ${state.loading ? 'disabled' : ''} aria-label="เปลี่ยนสถานะออร์เดอร์">
      ${Object.entries(ADMIN_STATUS_LABELS).map(([k, v]) => `
        <option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>
      `).join('')}
    </select>`;
}

function zoneNameById(zoneId) {
  return state.zones.find(z => z.id === zoneId)?.nameTh || zoneId || '';
}

function renderDriverSelect(o) {
  if (o.orderType === 'pickup') {
    return '<span class="driver-muted">รับที่ร้าน</span>';
  }
  const active = state.drivers.filter(d => d.active !== false);
  const suggested = driverForZone(active, o.zoneId);
  return `
    <select class="driver-select" data-order-driver="${o.firestoreId}" ${state.loading ? 'disabled' : ''} aria-label="จัดคนส่ง">
      <option value="">— ยังไม่จัด —</option>
      ${active.map(d => `
        <option value="${d.id}" ${o.driverId === d.id ? 'selected' : ''}>
          ${escapeHtml(d.name)}${suggested?.id === d.id && !o.driverId ? ' ★' : ''}
        </option>
      `).join('')}
    </select>`;
}

function formatTime(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

function todayKey() {
  return localDateKey();
}

function orderDateKeys() {
  return Array.from({ length: ORDERS_DAY_RANGE }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + state.ordersCalendarOffset + i);
    return localDateKey(d);
  });
}

function ensureOrdersDate() {
  const keys = orderDateKeys();
  if (!state.ordersDate || !keys.includes(state.ordersDate)) {
    state.ordersDate = keys[0];
  }
}

function orderCountsByDate() {
  const map = {};
  state.orders.forEach((o) => {
    if (o.status === 'cancelled' || !o.date) return;
    map[o.date] = (map[o.date] || 0) + 1;
  });
  return map;
}

function ordersForDeliveryDate(dateKey) {
  return state.orders.filter(o => o.date === dateKey);
}

function renderOrdersCalendar() {
  ensureOrdersDate();
  const counts = orderCountsByDate();
  const keys = orderDateKeys();
  const today = todayKey();

  return `
  <div class="card orders-calendar">
    <div class="cal-head">
      <button type="button" class="btn btn-ghost btn-sm" data-cal-shift="-7">‹ 7 วันก่อน</button>
      <p class="cal-head-label">วันรับ/ส่ง · ${formatDateLabel(keys[0])} – ${formatDateLabel(keys[keys.length - 1])}</p>
      <button type="button" class="btn btn-ghost btn-sm" data-cal-shift="7">7 วันถัดไป ›</button>
      ${state.ordersCalendarOffset !== 0 ? '<button type="button" class="btn btn-ghost btn-sm" data-cal-today>วันนี้</button>' : ''}
    </div>
    <div class="cal-strip">
      ${keys.map((dateKey) => {
    const cnt = counts[dateKey] || 0;
    const pending = ordersForDeliveryDate(dateKey).filter(o => o.status === 'pending_slip_review').length;
    const selected = state.ordersDate === dateKey;
    const isToday = dateKey === today;
    const { dayShort, dayNum, dateLabel } = formatDateLabelParts(dateKey);
    return `
        <button type="button"
          class="cal-day ${selected ? 'selected' : ''} ${isToday ? 'today' : ''} ${cnt ? 'has-orders' : ''}"
          data-cal-day="${dateKey}"
          title="${dateLabel}">
          <span class="cal-day-name">${dayShort}</span>
          <span class="cal-day-date">${dayNum}</span>
          <span class="cal-count ${cnt ? '' : 'empty'}">${cnt || '—'}</span>
          ${pending ? '<span class="cal-dot" title="รอตรวจสลิป"></span>' : ''}
        </button>`;
  }).join('')}
    </div>
    <p class="cal-hint">เลื่อนดูย้อนหลัง/ล่วงหน้าทีละ 7 วัน · กดวันเพื่อดูออร์เดอร์ที่จองไว้</p>
  </div>`;
}

function renderLogin() {
  return `
  <div class="login-wrap">
    <div class="login-card">
      <h1>DONG<span>HOOD</span></h1>
      <p>Admin Backoffice — เข้าสู่ระบบด้วยบัญชี Firebase</p>
      <form id="loginForm">
        <div class="field"><label>ชื่อผู้ใช้</label><input type="text" id="loginEmail" required autocomplete="username" placeholder="admin"></div>
        <div class="field"><label>รหัสผ่าน</label><input type="password" id="loginPass" required autocomplete="current-password"></div>
        ${state.loginError ? `<div class="err">${escapeHtml(state.loginError)}</div>` : ''}
        <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px;" ${state.loading ? 'disabled' : ''}>
          ${state.loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  </div>`;
}

function renderSidebar() {
  const pending = pendingCount();
  return `
  <aside class="sidebar" id="adminSidebar">
    <div class="sidebar-head">
      <div>
        <div class="brand">DONG<span>HOOD</span></div>
        <div class="sub">Admin Backoffice</div>
      </div>
      <button type="button" class="sidebar-close" id="navClose" aria-label="ปิดเมนู">×</button>
    </div>
    <nav class="sidebar-nav">
      <button class="nav-btn ${state.view === 'orders' ? 'active' : ''}" data-view="orders">
        ออร์เดอร์ ${pending ? `<span class="badge">${pending}</span>` : ''}
      </button>
      <button class="nav-btn ${state.view === 'menu' ? 'active' : ''}" data-view="menu">เมนู</button>
      <button class="nav-btn ${state.view === 'zones' ? 'active' : ''}" data-view="zones">โซนจัดส่ง</button>
      <button class="nav-btn ${state.view === 'drivers' ? 'active' : ''}" data-view="drivers">คนส่ง</button>
      <button class="nav-btn ${state.view === 'schedule' ? 'active' : ''}" data-view="schedule">ตารางจัดส่ง</button>
      <button class="nav-btn ${state.view === 'settings' ? 'active' : ''}" data-view="settings">ตั้งค่าร้าน</button>
    </nav>
    <div class="sidebar-foot">
      <div class="email">${escapeHtml(adminLabel(state.user))}</div>
      <button class="btn btn-ghost btn-sm" id="logoutBtn" style="width:100%;">ออกจากระบบ</button>
      <a href="/customer/" style="display:block;margin-top:10px;font-size:11px;color:var(--cream-dim);">← หน้าลูกค้า</a>
    </div>
  </aside>`;
}

function renderOrders() {
  ensureOrdersDate();
  const scoped = state.orders.filter(o => o.date === state.ordersDate);

  const filtered = sortOrders(
    state.ordersFilter === 'all'
      ? scoped
      : scoped.filter(o => o.status === state.ordersFilter),
  );

  const stats = {
    pending: scoped.filter(o => o.status === 'pending_slip_review').length,
    unseen: scoped.filter(o => isUnseenOrder(o)).length,
    active: scoped.filter(o => o.status !== 'cancelled').length,
    total: scoped.length,
  };

  const dateLabel = formatDateLabel(state.ordersDate);

  return `
  <div class="page-head">
    <div><h2>ออร์เดอร์</h2><p>อัปเดตแบบเรียลไทม์ · วันรับ/ส่ง: ${dateLabel}</p></div>
  </div>
  ${renderOrdersCalendar()}
  <div class="stats">
    <div class="stat ${stats.unseen ? 'stat-alert' : ''}"><div class="num">${stats.pending}</div><div class="lbl">ออร์เดอร์ใหม่</div></div>
    <div class="stat"><div class="num">${stats.active}</div><div class="lbl">${state.ordersDate === todayKey() ? 'ออร์เดอร์วันนี้' : 'ออร์เดอร์วันรับ/ส่ง'}</div></div>
    <div class="stat"><div class="num">${stats.total}</div><div class="lbl">ทั้งหมด</div></div>
  </div>
  <div class="filter-tabs">
    <button class="filter-tab ${state.ordersFilter === 'all' ? 'active' : ''}" data-filter="all">ทั้งหมด</button>
    <button class="filter-tab ${state.ordersFilter === 'pending_slip_review' ? 'active' : ''}" data-filter="pending_slip_review">ออร์เดอร์ใหม่ ${stats.pending ? `(${stats.pending})` : ''}</button>
    ${Object.entries(ADMIN_STATUS_LABELS).filter(([k]) => k !== 'pending_slip_review').map(([k, v]) => `
      <button class="filter-tab ${state.ordersFilter === k ? 'active' : ''}" data-filter="${k}">${v}</button>
    `).join('')}
  </div>
  ${!filtered.length ? `<div class="empty">ไม่มีออร์เดอร์วันรับ/ส่ง ${dateLabel}</div>` : `
  <div class="card table-wrap orders-wrap">
    <table class="stack-table orders-table">
      <thead><tr>
        <th>เลขออร์เดอร์</th><th>ลูกค้า</th><th>ยอด</th><th>โซน</th><th>คนส่ง</th><th>วันที่รับ/ส่ง</th><th>สถานะ</th><th></th>
      </tr></thead>
      <tbody>
        ${filtered.map(o => {
          const dp = o.date ? formatDateLabelParts(o.date) : null;
          const dateShort = dp ? dp.dateLabel : (o.date || '—');
          return `
          <tr class="${isNewOrder(o) ? 'order-row-new' : ''} ${isUnseenOrder(o) ? 'order-row-unseen' : ''}">
            <td class="oc-id mono" data-label="เลขออร์เดอร์">
              #${escapeHtml(o.orderId || '—')}
              ${isUnseenOrder(o) ? '<span class="new-dot" title="เพิ่งเข้ามา"></span>' : ''}
            </td>
            <td class="oc-cust" data-label="ลูกค้า">
              <span class="cust-name">${escapeHtml(o.displayName || '—')}</span>
              <span class="cust-phone">${escapeHtml(o.phone || '')}</span>
              ${isCodOrder(o) ? '<span class="cust-cod">💵 จ่ายปลายทาง</span>' : ''}
            </td>
            <td class="oc-amt mono" data-label="ยอด">฿${money(o.total || 0)}</td>
            <td class="oc-zone" data-label="โซน">${escapeHtml(orderZoneLabel(o))}</td>
            <td class="oc-drv" data-label="คนส่ง">${renderDriverSelect(o)}</td>
            <td class="oc-date" data-label="วันที่รับ/ส่ง">
              <span class="d">${escapeHtml(dateShort)}</span>
              ${o.roundTime ? `<span class="t">${escapeHtml(o.roundTime)}</span>` : ''}
            </td>
            <td class="oc-st" data-label="สถานะ">${renderStatusSelect(o)}</td>
            <td class="oc-act stack-actions"><button class="btn btn-ghost btn-sm" data-order="${o.firestoreId}">ดู</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`}
  ${state.selectedOrder ? renderOrderDetail() : ''}`;
}

function renderOrderDetail() {
  const o = state.selectedOrder;
  const nextStatus = nextOrderStatus(o.status);
  return `
  <div class="overlay" id="orderOverlay">
    <div class="panel">
      <div class="panel-head">
        <h3>#${escapeHtml(o.orderId)}</h3>
        <button class="btn btn-ghost btn-sm" id="closeOrder">✕</button>
      </div>
      <div class="order-detail-grid">
        <div>
          <p><strong>${escapeHtml(o.displayName)}</strong> · ${escapeHtml(o.phone)}</p>
          ${o.email ? `<p style="font-size:13px;margin:4px 0 0;">✉️ <a href="mailto:${escapeHtml(o.email)}" style="color:var(--turmeric);">${escapeHtml(o.email)}</a></p>` : ''}
          <p style="color:var(--cream-dim);font-size:13px;margin:8px 0;">
            ${o.orderType === 'delivery' ? 'จัดส่ง' : 'รับที่ร้าน'} · ${escapeHtml(o.date)} · ${escapeHtml(o.roundTime || '')}
            ${o.zoneName ? `<br>โซน: ${escapeHtml(o.zoneName)}` : o.roundRoute ? `<br>พื้นที่: ${escapeHtml(o.roundRoute)}` : ''}
            <br>ชำระ: ${escapeHtml(paymentMethodLabel(o))}
          </p>
          ${o.address ? `<p style="font-size:13px;">📍 ${escapeHtml(o.address)}</p>` : ''}
          ${o.notes ? `<p style="font-size:13px;color:var(--cream-dim);">หมายเหตุ: ${escapeHtml(o.notes)}</p>` : ''}
          <ul class="order-items" style="margin-top:14px;">
            ${(o.items || []).map(i => `<li><span>${escapeHtml(i.th || i.id)} × ${i.qty}</span><span class="mono">฿${money((i.price || 0) * i.qty)}</span></li>`).join('')}
          </ul>
          <p style="margin-top:12px;font-weight:700;">รวม ฿${money(o.total || 0)}</p>
          <p style="font-size:12px;color:var(--cream-dim);">สั่งเมื่อ ${formatTime(o.createdAt)}</p>
          ${o.orderType === 'delivery' ? `
          <div style="margin-top:12px;">
            <p style="font-size:11px;text-transform:uppercase;color:var(--cream-dim);font-weight:700;margin-bottom:6px;">คนส่ง</p>
            ${renderDriverSelect(o)}
          </div>` : ''}
          <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
            ${nextStatus ? `<button class="btn btn-primary btn-sm" data-status="${nextStatus}">→ ${ADMIN_STATUS_LABELS[nextStatus] || ORDER_STATUS[nextStatus]}</button>` : ''}
            ${o.status !== 'cancelled' ? `<button class="btn btn-danger btn-sm" data-status="cancelled">ยกเลิก</button>` : ''}
          </div>
        </div>
        <div>
          <p style="font-size:11px;text-transform:uppercase;color:var(--cream-dim);font-weight:700;">${isCodOrder(o) ? 'การชำระเงิน' : 'สลิปโอนเงิน'}</p>
          ${isCodOrder(o)
      ? `<div style="padding:16px;background:var(--ink-soft);border-radius:10px;text-align:center;">
          <div style="font-size:28px;margin-bottom:8px;">💵</div>
          <p style="font-weight:700;margin:0 0 4px;">จ่ายปลายทาง</p>
          <p style="color:var(--cream-dim);font-size:13px;margin:0;">ลูกค้าจ่ายเงินสด ฿${money(o.total || 0)} ${o.orderType === 'delivery' ? 'ตอนจัดส่ง' : 'ตอนมารับ'}</p>
        </div>`
      : o.slipUrl
      ? `<a href="${o.slipUrl}" target="_blank" rel="noopener"><img class="slip-img" src="${o.slipUrl}" alt="slip"></a>`
      : '<p style="color:var(--cream-dim);font-size:13px;">ไม่มีสลิป</p>'}
        </div>
      </div>
    </div>
  </div>`;
}

function currentMenuImage() {
  return state.settings?.menuImage || DEFAULT_MENU_IMAGE;
}

function renderMenuHero() {
  const custom = !!state.settings?.menuImage;
  const src = currentMenuImage();
  return `
  <div class="card menu-hero-admin">
    <a href="${escapeHtml(src)}" target="_blank" rel="noopener" class="menu-hero-thumb" title="เปิดดูรูปเต็ม">
      <img id="menuHeroPreview" src="${escapeHtml(src)}" alt="รูปเมนูหน้าลูกค้า">
    </a>
    <div class="menu-hero-info">
      <h3>รูปเมนูหน้าลูกค้า</h3>
      <p class="qr-hint">รูปแฟลเยอร์ที่ลูกค้าเห็นบนสุดของหน้าเมนู · ${custom ? 'ใช้รูปที่อัปโหลดเอง' : 'ใช้รูปตามแคตตาล็อก'} · JPG/PNG ไม่เกิน 5MB</p>
      <div class="menu-hero-actions">
        <label class="btn btn-primary btn-sm file-btn ${state.loading ? 'disabled' : ''}">
          📤 อัปโหลดรูปใหม่
          <input type="file" id="menuHeroFile" accept="image/*" hidden ${state.loading ? 'disabled' : ''}>
        </label>
        <button type="button" class="btn btn-ghost btn-sm" id="menuHeroCopy">🔗 คัดลอกลิงก์รูป</button>
        <a class="btn btn-ghost btn-sm" href="${escapeHtml(src)}" target="_blank" rel="noopener" download>⬇ ดาวน์โหลด / เปิดรูป</a>
        <button type="button" class="btn btn-ghost btn-sm" id="menuHeroReset" ${custom && !state.loading ? '' : 'disabled'}>↺ ใช้รูปตามแคตตาล็อก</button>
      </div>
    </div>
  </div>`;
}

function renderMenu() {
  return `
  <div class="page-head">
    <div><h2>เมนู</h2><p>${state.menu.length} รายการ · ราคาตามแคตตาล็อกล่าสุด</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-ghost" id="seedMenuBtn" ${state.loading ? 'disabled' : ''}>⚡ Sync เมนูจากแคตตาล็อก</button>
      <button class="btn btn-primary" id="addMenuBtn">+ เพิ่มเมนู</button>
    </div>
  </div>
  ${renderMenuHero()}
  <div class="menu-grid">
    ${state.menu.map(m => {
      const inCatalog = !!catalogMenuItem(m.id);
      return `
      <div class="menu-card">
        ${m.img ? `<img src="${escapeHtml(m.img)}" alt="" onerror="this.style.display='none'">` : ''}
        <div class="body">
          <h3>${escapeHtml(m.th)} ${m.soldOut ? '<span style="color:var(--chili);font-size:11px;">(หมด)</span>' : ''}</h3>
          <div class="meta">${escapeHtml(m.en)} · ฿${money(m.price)} · ${MENU_CATS.find(c => c.id === m.cat)?.label || m.cat}</div>
          <div class="actions">
            <button class="btn btn-ghost btn-sm" data-edit="${m.id}">แก้ไข</button>
            <button class="btn btn-ghost btn-sm" data-toggle-soldout="${m.id}">${m.soldOut ? 'เปิดขาย' : 'หมดวันนี้'}</button>
            <button class="btn btn-danger btn-sm" data-delete="${m.id}">ลบ</button>
          </div>
          <div class="actions actions-secondary">
            <label class="btn btn-ghost btn-sm file-btn ${state.loading ? 'disabled' : ''}" title="อัปโหลดรูปของเมนูนี้">
              📷 เปลี่ยนรูป
              <input type="file" accept="image/*" hidden data-item-image="${m.id}" ${state.loading ? 'disabled' : ''}>
            </label>
            <button class="btn btn-ghost btn-sm" data-reset-item="${m.id}" ${inCatalog && !state.loading ? '' : 'disabled'}
              title="${inCatalog ? 'สร้างรูปและข้อมูลใหม่ให้ตรงกับเมนูหลัก' : 'เมนูนี้ไม่อยู่ในแคตตาล็อกหลัก'}">↺ รีเจนตามเมนูหลัก</button>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>
  ${state.editingItem !== null ? renderMenuForm() : ''}`;
}

function renderMenuForm() {
  const m = state.editingItem || {
    id: '', cat: 'menu', th: '', en: '', price: 0, desc: '', img: '', badge: '', soldOut: false, sortOrder: state.menu.length + 1,
  };
  const isNew = !m.id || !state.menu.find(x => x.id === m.id);
  return `
  <div class="overlay" id="menuOverlay">
    <div class="panel">
      <div class="panel-head"><h3>${isNew ? 'เพิ่มเมนู' : 'แก้ไขเมนู'}</h3><button class="btn btn-ghost btn-sm" id="closeMenuForm">✕</button></div>
      <form id="menuForm" class="form-grid">
        <div class="field"><label>ID (ไม่ซ้ำ)</label><input name="id" value="${escapeHtml(m.id)}" ${!isNew ? 'readonly' : ''} required></div>
        <div class="field"><label>หมวด</label>
          <select name="cat">${MENU_CATS.map(c => `<option value="${c.id}" ${m.cat === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
        </div>
        <div class="field"><label>ชื่อไทย</label><input name="th" value="${escapeHtml(m.th)}" required></div>
        <div class="field"><label>ชื่ออังกฤษ</label><input name="en" value="${escapeHtml(m.en)}"></div>
        <div class="field"><label>ราคา (บาท)</label><input name="price" type="number" value="${m.price}" required></div>
        <div class="field"><label>ลำดับแสดง</label><input name="sortOrder" type="number" value="${m.sortOrder || 999}"></div>
        <div class="field full"><label>คำอธิบาย</label><textarea name="desc">${escapeHtml(m.desc || '')}</textarea></div>
        <div class="field full"><label>URL รูปภาพ</label><input name="img" value="${escapeHtml(m.img || '')}" placeholder="../assets/menu-items/..."></div>
        <div class="field"><label>ป้าย (badge)</label><input name="badge" value="${escapeHtml(m.badge || '')}" placeholder="ขายดี!"></div>
        <div class="field check-row" style="align-self:end;"><label><input type="checkbox" name="soldOut" ${m.soldOut ? 'checked' : ''}> หมดวันนี้</label></div>
        <div class="field full"><button type="submit" class="btn btn-primary" ${state.loading ? 'disabled' : ''}>บันทึก</button></div>
      </form>
    </div>
  </div>`;
}

function formatZoneFeeCell(z) {
  const n = Number(z?.deliveryFee ?? z) || 0;
  const freeAbove = Number(z?.freeAbove) || 0;
  const fee = n > 0 ? `฿${money(n)}` : '<span class="fee-free">ฟรี</span>';
  if (freeAbove > 0) return `${fee}<div class="fee-note">ฟรีเมื่อครบ ฿${money(freeAbove)}</div>`;
  return fee;
}

function formatZoneFeeShort(z) {
  const n = Number(z?.deliveryFee ?? z) || 0;
  const freeAbove = Number(z?.freeAbove) || 0;
  if (freeAbove > 0) return `฿${money(n)} / ฟรี≥${money(freeAbove)}`;
  return n > 0 ? `฿${money(n)}` : 'ฟรี';
}

function renderZones() {
  return `
  <div class="page-head">
    <div><h2>โซนจัดส่ง</h2><p>แก้ราคาค่าจัดส่งแต่ละพื้นที่ได้ที่นี่ — ขึ้นหน้าลูกค้าทันที</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-ghost" id="seedDeliveryBtn" ${state.loading ? 'disabled' : ''}>⚡ Seed ข้อมูลเริ่มต้น</button>
      <button class="btn btn-primary" id="addZoneBtn">+ เพิ่มโซน</button>
    </div>
  </div>
  <div class="card table-wrap">
    <table class="stack-table">
      <thead><tr>
        <th>ID</th><th>ชื่อไทย</th><th>ชื่ออังกฤษ</th><th>ค่าส่ง</th><th>ลำดับ</th><th>สถานะ</th><th></th>
      </tr></thead>
      <tbody>
        ${state.zones.map(z => `
          <tr>
            <td class="mono" data-label="ID">${escapeHtml(z.id)}</td>
            <td data-label="ชื่อไทย">${escapeHtml(z.nameTh)}</td>
            <td data-label="ชื่ออังกฤษ">${escapeHtml(z.nameEn || '—')}</td>
            <td class="mono" data-label="ค่าส่ง">${formatZoneFeeCell(z)}</td>
            <td class="mono" data-label="ลำดับ">${z.sortOrder ?? '—'}</td>
            <td data-label="สถานะ">${z.active !== false ? '<span class="status-pill confirmed">เปิด</span>' : '<span class="status-pill cancelled">ปิด</span>'}</td>
            <td class="stack-actions">
              <button class="btn btn-ghost btn-sm" data-edit-zone="${z.id}">แก้ไข</button>
              <button class="btn btn-danger btn-sm" data-delete-zone="${z.id}">ลบ</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ${state.editingZone !== null ? renderZoneForm() : ''}`;
}

function renderDrivers() {
  return `
  <div class="page-head">
    <div><h2>คนส่ง</h2><p>จัดคนส่งตามโซน · แชร์ลิงก์ดูงานให้คนขับ</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-ghost" id="seedDriversBtn" ${state.loading ? 'disabled' : ''}>⚡ Seed คนส่ง 3 คน</button>
      <button class="btn btn-primary" id="addDriverBtn">+ เพิ่มคนส่ง</button>
    </div>
  </div>
  <div class="card table-wrap">
    <table class="stack-table">
      <thead><tr>
        <th>ชื่อ</th><th>เบอร์</th><th>โซน</th><th>ลิงก์ดูงาน</th><th>สถานะ</th><th></th>
      </tr></thead>
      <tbody>
        ${!state.drivers.length ? '<tr class="table-empty"><td colspan="6" style="text-align:center;color:var(--cream-dim);">ยังไม่มีคนส่ง — กด Seed หรือเพิ่มใหม่</td></tr>' : state.drivers.map(d => `
          <tr>
            <td data-label="ชื่อ"><strong>${escapeHtml(d.name)}</strong><br><span class="mono" style="font-size:10px;color:var(--cream-dim);">${escapeHtml(d.id)}</span></td>
            <td data-label="เบอร์">${d.phone ? `<a href="tel:${escapeHtml(d.phone)}" style="color:var(--turmeric);">${escapeHtml(d.phone)}</a>` : '—'}</td>
            <td data-label="โซน" style="font-size:12px;">${(d.zoneIds || []).map(zid => escapeHtml(zoneNameById(zid))).join(', ') || '—'}</td>
            <td data-label="ลิงก์ดูงาน">
              <div class="link-cell">
                <input class="link-input mono" readonly value="${escapeHtml(driverJobUrl(d.id))}">
                <button type="button" class="btn btn-ghost btn-sm" data-copy-driver-link="${d.id}">คัดลอก</button>
              </div>
            </td>
            <td data-label="สถานะ">${d.active !== false ? '<span class="status-pill confirmed">ใช้งาน</span>' : '<span class="status-pill cancelled">ปิด</span>'}</td>
            <td class="stack-actions">
              <button class="btn btn-ghost btn-sm" data-edit-driver="${d.id}">แก้ไข</button>
              <button class="btn btn-danger btn-sm" data-delete-driver="${d.id}">ลบ</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ${state.editingDriver !== null ? renderDriverForm() : ''}`;
}

function renderDriverForm() {
  const d = state.editingDriver || {
    id: '', name: '', phone: '', zoneIds: [], sortOrder: state.drivers.length + 1, active: true,
  };
  const isNew = !d.id || !state.drivers.find(x => x.id === d.id);
  const selectedZones = new Set(d.zoneIds || []);
  return `
  <div class="overlay" id="driverOverlay">
    <div class="panel">
      <div class="panel-head"><h3>${isNew ? 'เพิ่มคนส่ง' : 'แก้ไขคนส่ง'}</h3><button class="btn btn-ghost btn-sm" id="closeDriverForm">✕</button></div>
      <form id="driverForm" class="form-grid">
        <div class="field"><label>ID (ไม่ซ้ำ)</label><input name="id" value="${escapeHtml(d.id)}" ${!isNew ? 'readonly' : ''} required placeholder="drv_aek"></div>
        <div class="field"><label>ชื่อ</label><input name="name" value="${escapeHtml(d.name)}" required placeholder="พี่เอก"></div>
        <div class="field"><label>เบอร์โทร</label><input name="phone" value="${escapeHtml(d.phone || '')}" placeholder="08xxxxxxxx"></div>
        <div class="field"><label>ลำดับแสดง</label><input name="sortOrder" type="number" value="${d.sortOrder || 99}"></div>
        <div class="field full"><label>โซนที่รับผิดชอบ</label>
          <div class="zone-check-grid">
            ${state.zones.map(z => `
              <label class="check-row"><input type="checkbox" name="zoneIds" value="${z.id}" ${selectedZones.has(z.id) ? 'checked' : ''}> ${escapeHtml(z.nameTh)}</label>
            `).join('') || '<p style="color:var(--cream-dim);font-size:12px;">ยังไม่มีโซน — ไปเพิ่มที่เมนูโซนจัดส่งก่อน</p>'}
          </div>
        </div>
        <div class="field check-row" style="align-self:end;"><label><input type="checkbox" name="active" ${d.active !== false ? 'checked' : ''}> ใช้งาน</label></div>
        ${!isNew ? `<div class="field full"><label>ลิงก์ดูงาน (แชร์ให้คนขับ)</label><input readonly value="${escapeHtml(driverJobUrl(d.id))}" class="mono"></div>` : ''}
        <div class="field full"><button type="submit" class="btn btn-primary" ${state.loading ? 'disabled' : ''}>บันทึก</button></div>
      </form>
    </div>
  </div>`;
}

function renderZoneForm() {
  const z = state.editingZone || { id: '', nameTh: '', nameEn: '', sortOrder: state.zones.length + 1, deliveryFee: 0, freeAbove: 0, active: true };
  const isNew = !z.id || !state.zones.find(x => x.id === z.id);
  return `
  <div class="overlay" id="zoneOverlay">
    <div class="panel">
      <div class="panel-head"><h3>${isNew ? 'เพิ่มโซน' : 'แก้ไขโซน'}</h3><button class="btn btn-ghost btn-sm" id="closeZoneForm">✕</button></div>
      <form id="zoneForm" class="form-grid">
        <div class="field"><label>ID (ไม่ซ้ำ, ภาษาอังกฤษ)</label><input name="id" value="${escapeHtml(z.id)}" ${!isNew ? 'readonly' : ''} required placeholder="chalong"></div>
        <div class="field"><label>ชื่อไทย</label><input name="nameTh" value="${escapeHtml(z.nameTh)}" required placeholder="ฉลอง"></div>
        <div class="field"><label>ชื่ออังกฤษ</label><input name="nameEn" value="${escapeHtml(z.nameEn || '')}" placeholder="Chalong"></div>
        <div class="field"><label>ค่าจัดส่ง (บาท)</label><input name="deliveryFee" type="number" min="0" step="1" value="${z.deliveryFee ?? 0}"></div>
        <div class="field"><label>ส่งฟรีเมื่อครบ (บาท, 0 = ไม่มี)</label><input name="freeAbove" type="number" min="0" step="1" value="${z.freeAbove ?? 0}"></div>
        <div class="field"><label>ลำดับแสดง</label><input name="sortOrder" type="number" value="${z.sortOrder || 99}"></div>
        <div class="field check-row" style="align-self:end;"><label><input type="checkbox" name="active" ${z.active !== false ? 'checked' : ''}> เปิดใช้งาน</label></div>
        <div class="field full"><button type="submit" class="btn btn-primary" ${state.loading ? 'disabled' : ''}>บันทึก</button></div>
      </form>
    </div>
  </div>`;
}

const SCHEDULE_PRESETS = DEFAULT_DELIVERY_TIMES;
const CLOSE_REASON_PRESETS = ['ของหมด', 'งดส่งกระทันหัน', 'ร้านหยุดวันนี้'];

function formatTimeLabel(t) {
  return String(t || '').replace(/^0/, '');
}

function activeZones() {
  return state.zones.filter(z => z.active !== false);
}

function roundsForScheduleZone(zoneId) {
  return state.scheduleRounds.filter(r => r.zoneId === zoneId);
}

function roundCountForZone(zoneId) {
  return roundsForScheduleZone(zoneId).filter(r => r.time?.trim()).length;
}

function ensureScheduleZone() {
  const zones = activeZones();
  if (!zones.length) {
    state.scheduleZone = null;
    return;
  }
  if (state.scheduleZone && zones.some(z => z.id === state.scheduleZone)) return;
  const withRounds = zones.find(z => roundCountForZone(z.id) > 0);
  state.scheduleZone = withRounds?.id || zones[0].id;
}

function renderSchedule() {
  const dates = upcomingDateKeys(7);
  const zones = activeZones();
  ensureScheduleZone();
  const currentZone = zones.find(z => z.id === state.scheduleZone);
  const zoneRounds = currentZone ? roundsForScheduleZone(currentZone.id) : [];
  const closeOn = state.scheduleCloseOn;
  const closeMode = state.scheduleCloseMode === 'time' ? 'time' : 'now';
  const immediateClosed = closeOn && closeMode === 'now';
  const enabled = state.scheduleEnabled;
  const dayDim = immediateClosed ? 'dim' : '';

  return `
  <div class="page-head">
    <div>
      <h2>ตารางจัดส่ง</h2>
      <p>กำหนดวันส่ง / ไม่ส่งล่วงหน้า · รอบเย็นเริ่มหลัง 17:00 · แก้เวลาได้ตลอด</p>
    </div>
    <button class="btn btn-primary" id="saveScheduleBtn" ${state.loading ? 'disabled' : ''}>บันทึกวันนี้</button>
  </div>
  <div class="filter-tabs">
    ${dates.map(d => `
      <button class="filter-tab ${state.scheduleDate === d ? 'active' : ''}" data-schedule-date="${d}">${formatDateLabel(d)}</button>
    `).join('')}
  </div>
  <div class="card schedule-card">
    <div class="schedule-close-control ${closeOn ? 'is-closed' : ''}">
      <label class="schedule-toggle schedule-close-toggle">
        <input type="checkbox" id="scheduleClosedToggle" ${closeOn ? 'checked' : ''}>
        <span>${closeOn ? '⛔ ปิดรับออร์เดอร์วันนี้' : 'ปิดรับออร์เดอร์วันนี้ (ของหมด / งดส่งกระทันหัน)'}</span>
      </label>
      ${closeOn ? `
      <div class="schedule-close-body">
        <div class="schedule-close-modes">
          <label class="schedule-close-mode ${closeMode === 'now' ? 'active' : ''}">
            <input type="radio" name="scheduleCloseMode" value="now" ${closeMode === 'now' ? 'checked' : ''}>
            <span>ปิดรับตอนนี้ (ปิดทันที)</span>
          </label>
          <label class="schedule-close-mode ${closeMode === 'time' ? 'active' : ''}">
            <input type="radio" name="scheduleCloseMode" value="time" ${closeMode === 'time' ? 'checked' : ''}>
            <span>ตั้งเวลาปิดรับ</span>
            <input type="time" id="scheduleCloseAtInput" value="${escapeHtml(state.scheduleCloseAt || DEFAULT_CLOSE_TIME)}" ${closeMode === 'time' ? '' : 'disabled'}>
            <span class="schedule-close-mode-hint">น. ของวันที่เลือก</span>
          </label>
        </div>
        <input type="text" id="scheduleClosedReasonInput" class="schedule-close-reason-input" maxlength="60"
          placeholder="เหตุผล (โชว์หน้าลูกค้า) เช่น ของหมด" value="${escapeHtml(state.scheduleClosedReason || '')}">
        <div class="schedule-reason-presets">
          ${CLOSE_REASON_PRESETS.map(r => `<button type="button" class="schedule-reason-preset" data-close-reason="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join('')}
        </div>
        <p class="schedule-close-note">${closeMode === 'time'
    ? `ลูกค้าจะสั่งวันที่เลือกได้ถึง ${escapeHtml(formatTimeLabel(state.scheduleCloseAt || DEFAULT_CLOSE_TIME))} น. หลังจากนั้นปิดรับทั้งจัดส่งและรับที่ร้าน`
    : 'ลูกค้าจะเลือกวันนี้ไม่ได้ทั้งจัดส่งและรับที่ร้าน (ยังสั่งล่วงหน้าวันอื่นได้)'}</p>
      </div>` : ''}
    </div>

    <div class="schedule-day-controls ${dayDim}">
      <label class="schedule-toggle">
        <input type="checkbox" id="scheduleEnabledToggle" ${enabled ? 'checked' : ''} ${immediateClosed ? 'disabled' : ''}>
        <span>${enabled ? 'วันส่ง — รับออเดอร์จัดส่ง' : 'วันไม่ส่ง — ลูกค้าเลือกวันนี้ไม่ได้'}</span>
      </label>
      <div class="schedule-cutoff ${enabled ? '' : 'dim'}">
        <label for="scheduleCutoffInput">ส่งได้ถึง</label>
        <input type="time" id="scheduleCutoffInput" value="${escapeHtml(state.scheduleCutoff || DEFAULT_CUTOFF_TIME)}" ${enabled && !immediateClosed ? '' : 'disabled'}>
        <span class="schedule-cutoff-hint">โชว์หน้าลูกค้า</span>
      </div>
    </div>

    ${!enabled && !immediateClosed ? `<p class="schedule-off-note">วันนี้ปิดจัดส่ง — หน้าลูกค้าจะไม่ให้เลือกวันนี้สำหรับจัดส่ง (ยังสั่งล่วงหน้าวันอื่นได้)</p>` : ''}

    ${!zones.length ? '<p class="schedule-empty">ยังไม่มีโซนจัดส่ง — ไปที่เมนู "โซนจัดส่ง" เพื่อเพิ่มก่อน</p>' : `
    <div class="schedule-zone-tabs ${enabled && !immediateClosed ? '' : 'dim'}">
      ${zones.map(z => {
    const count = roundCountForZone(z.id);
    return `
        <button type="button" class="schedule-zone-tab ${state.scheduleZone === z.id ? 'active' : ''}" data-schedule-zone="${z.id}" ${enabled ? '' : 'disabled'}>
          <span class="sz-name">${escapeHtml(z.nameTh)}</span>
          <span class="sz-count">${count} รอบ · ${formatZoneFeeShort(z)}</span>
        </button>`;
  }).join('')}
    </div>

    ${currentZone && enabled ? `
    <div class="schedule-zone-panel">
      <div class="schedule-zone-head">
        <h3>${escapeHtml(currentZone.nameTh)}</h3>
        <span class="schedule-zone-en">${escapeHtml(currentZone.nameEn || '')}</span>
      </div>

      ${zoneRounds.length ? `
      <div class="schedule-slots">
        ${zoneRounds.map(r => `
          <div class="schedule-slot" data-round-id="${r.id}">
            <input type="time" class="round-time" value="${escapeHtml((r.time || '').split('–')[0].trim())}" data-round-id="${r.id}">
            <button type="button" class="btn btn-danger btn-sm" data-remove-round="${r.id}" title="ลบรอบ">✕</button>
          </div>
        `).join('')}
      </div>
      ` : `<p class="schedule-empty-zone">ยังไม่มีรอบในโซนนี้ — กดปุ่มด้านล่างเพื่อเพิ่ม</p>`}

      <div class="schedule-quick-add">
        <span class="schedule-quick-label">รอบเย็นมาตรฐาน</span>
        ${SCHEDULE_PRESETS.map(t => `
          <button type="button" class="schedule-preset-btn" data-preset-time="${t}">${t}</button>
        `).join('')}
        <button type="button" class="btn btn-ghost btn-sm" id="addRoundBtn">+ รอบว่าง</button>
        <button type="button" class="btn btn-ghost btn-sm" id="applyPresetsAllZonesBtn">ใส่ 3 รอบให้ทุกโซน</button>
      </div>
    </div>
    ` : ''}
    `}
  </div>`;
}

function renderSettings() {
  const s = state.settings || {};
  const hours = s.storeHours || {};
  const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'];
  const qrSrc = state.pendingQrPreviewUrl || s.promptPayQr || '../assets/promptpay-qr.jpg';
  return `
  <div class="page-head">
    <div><h2>ตั้งค่าร้าน</h2><p>ข้อมูลที่แสดงในแอปลูกค้า</p></div>
    <button class="btn btn-primary" id="saveSettingsBtn" ${state.loading ? 'disabled' : ''}>บันทึก</button>
  </div>
  <form id="settingsForm" class="card form-grid">
    <div class="field"><label>ชื่อร้าน</label><input name="storeName" value="${escapeHtml(s.storeName || 'Donghood')}"></div>
    <div class="field"><label>ชื่อไทย</label><input name="storeNameTh" value="${escapeHtml(s.storeNameTh || '')}"></div>
    <div class="field full"><label>Tagline</label><input name="storeTagline" value="${escapeHtml(s.storeTagline || '')}"></div>
    <div class="field"><label>ค่าจัดส่ง (0 = ฟรี)</label><input name="deliveryFee" type="number" value="${s.deliveryFee ?? 0}"></div>
    <div class="field"><label>ขั้นต่ำจัดส่ง</label><input name="minDeliveryOrder" type="number" value="${s.minDeliveryOrder ?? 200}"></div>
    <div class="field"><label>เบอร์โทรร้าน (หลายเบอร์ คั่นด้วย ,)</label><input name="storePhones" value="${escapeHtml((s.storePhones?.length ? s.storePhones : [s.storePhone]).filter(Boolean).join(', '))}" placeholder="0635196745, 0922499112"></div>
    <div class="field"><label>LINE OA (ไม่มี @)</label><input name="lineId" value="${escapeHtml(s.lineId || '')}" placeholder="เช่น donghood"></div>
    <div class="field"><label>PromptPay ชื่อ</label><input name="promptPayName" value="${escapeHtml(s.promptPayName || '')}"></div>
    <div class="field"><label>ธนาคาร</label><input name="promptPayBank" value="${escapeHtml(s.promptPayBank || '')}" placeholder="เช่น ธนาคารกรุงเทพ"></div>
    <div class="field"><label>เลขบัญชี</label><input name="promptPayAccount" value="${escapeHtml(s.promptPayAccount || '')}" placeholder="เช่น 573-0-55204-8"></div>
    <div class="field full">
      <label>รูป QR Code PromptPay</label>
      <div class="qr-settings">
        <div class="qr-preview-wrap">
          <img id="qrPreview" class="qr-preview" src="${escapeHtml(qrSrc)}" alt="QR PromptPay">
        </div>
        <div class="qr-settings-actions">
          <p class="qr-hint">รูปนี้แสดงตอนลูกค้าชำระเงิน — รองรับ JPG/PNG ไม่เกิน 5MB</p>
          <input type="file" id="qrFileInput" name="promptPayQrFile" accept="image/*">
          <button type="button" class="btn btn-ghost" id="qrClearBtn">ใช้รูปเดิมของระบบ</button>
        </div>
      </div>
      <input type="hidden" name="promptPayQr" id="promptPayQrValue" value="${escapeHtml(s.promptPayQr || '')}">
    </div>
    <div class="field full"><label>จุดรับที่ร้าน</label><input name="pickupLocation" value="${escapeHtml(s.pickupLocation || '')}"></div>
    <div class="field full"><label>ไฮไลท์ (บรรทัดละ 1)</label><textarea name="storeHighlights">${(s.storeHighlights || []).join('\n')}</textarea></div>
    <div class="field full"><label>เวลาเปิด-ปิดรายวัน</label>
      <div class="hours-grid">
        ${dayNames.map((name, i) => `
          <div class="hours-row">
            <label>${name}</label>
            <div style="display:flex;gap:6px;">
              <input name="open_${i}" value="${hours[i]?.open || '11:00'}" placeholder="เปิด">
              <input name="close_${i}" value="${hours[i]?.close || '20:00'}" placeholder="ปิด">
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </form>`;
}

function renderMain() {
  let content = '';
  if (state.view === 'orders') content = renderOrders();
  else if (state.view === 'menu') content = renderMenu();
  else if (state.view === 'zones') content = renderZones();
  else if (state.view === 'drivers') content = renderDrivers();
  else if (state.view === 'schedule') content = renderSchedule();
  else if (state.view === 'settings') content = renderSettings();

  const pending = pendingCount();
  const title = VIEW_TITLES[state.view] || 'Admin';
  return `
  <div class="admin-shell ${state.navOpen ? 'nav-open' : ''}">
    <header class="mobile-topbar">
      <button type="button" class="hamburger" id="navToggle" aria-label="เปิดเมนูหลังบ้าน" aria-expanded="${state.navOpen ? 'true' : 'false'}">
        <span></span><span></span><span></span>
      </button>
      <div class="mobile-topbar-title">
        <div class="mobile-brand">DONG<span>HOOD</span></div>
        <div class="mobile-view">${escapeHtml(title)}</div>
      </div>
      ${pending ? `<span class="mobile-badge">${pending}</span>` : '<span class="mobile-badge-spacer"></span>'}
    </header>
    <div class="sidebar-backdrop" id="navBackdrop"></div>
    ${renderSidebar()}
    <main class="main">${content}</main>
  </div>`;
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = state.user ? renderMain() : renderLogin();
  document.body.classList.toggle('nav-lock', !!(state.user && state.navOpen));
  bindEvents();
}

async function loadMenu() {
  state.menu = await fetchMenu();
}

async function loadSettings() {
  const remote = await fetchSettings();
  const cfg = window.DH?.config || {};
  state.settings = {
    storeName: cfg.storeName,
    storeNameTh: cfg.storeNameTh,
    storeTagline: cfg.storeTagline,
    deliveryFee: cfg.deliveryFee,
    minDeliveryOrder: cfg.minDeliveryOrder,
    storePhone: cfg.storePhone,
    storePhones: cfg.storePhones,
    promptPayName: cfg.promptPayName,
    promptPayBank: cfg.promptPayBank,
    promptPayAccount: cfg.promptPayAccount,
    promptPayQr: cfg.promptPayQr || '',
    pickupLocation: cfg.pickupLocation,
    storeHighlights: cfg.storeHighlights,
    storeHours: window.DH?.data?.STORE_HOURS,
    lineId: cfg.social?.line || '',
    ...(remote || {}),
  };
}

async function loadMenuView() {
  await Promise.all([loadMenu(), loadSettings()]);
}

async function loadZones() {
  state.zones = await fetchZones();
}

async function loadDrivers() {
  state.drivers = await fetchDrivers();
}

async function loadSchedule() {
  const day = await fetchSchedule(state.scheduleDate);
  state.scheduleEnabled = !!day.enabled;
  state.scheduleCutoff = day.cutoffTime || DEFAULT_CUTOFF_TIME;
  state.scheduleRounds = day.rounds || [];
  const hasCloseAt = !!(day.closeAt && String(day.closeAt).trim());
  state.scheduleCloseOn = day.closed === true || hasCloseAt;
  state.scheduleCloseMode = hasCloseAt && day.closed !== true ? 'time' : 'now';
  state.scheduleCloseAt = hasCloseAt ? day.closeAt : DEFAULT_CLOSE_TIME;
  state.scheduleClosedReason = day.closedReason || '';
  if (!state.zones.length) await loadZones();
  ensureScheduleZone();
}

function syncRoundTimesFromDom() {
  document.querySelectorAll('.round-time[data-round-id]').forEach(input => {
    const round = state.scheduleRounds.find(r => r.id === input.dataset.roundId);
    if (round) round.time = input.value;
  });
  const cutoff = document.getElementById('scheduleCutoffInput');
  if (cutoff) state.scheduleCutoff = cutoff.value || DEFAULT_CUTOFF_TIME;
  const enabledEl = document.getElementById('scheduleEnabledToggle');
  if (enabledEl) state.scheduleEnabled = enabledEl.checked;
  const reasonEl = document.getElementById('scheduleClosedReasonInput');
  if (reasonEl) state.scheduleClosedReason = reasonEl.value;
  const closeAtEl = document.getElementById('scheduleCloseAtInput');
  if (closeAtEl) state.scheduleCloseAt = closeAtEl.value || DEFAULT_CLOSE_TIME;
  const closeModeEl = document.querySelector('input[name="scheduleCloseMode"]:checked');
  if (closeModeEl) state.scheduleCloseMode = closeModeEl.value === 'time' ? 'time' : 'now';
}

function addRoundToZone(zoneId, time = '') {
  state.scheduleRounds.push({ id: 'r' + Date.now() + Math.random().toString(36).slice(2, 6), zoneId, time });
}

function applyDefaultRoundsToAllZones() {
  const zones = activeZones();
  state.scheduleRounds = [];
  zones.forEach((z, zi) => {
    DEFAULT_DELIVERY_TIMES.forEach((t, ti) => {
      state.scheduleRounds.push({ id: `r${zi}_${ti}_${Date.now()}`, zoneId: z.id, time: t });
    });
  });
}

function bindEvents() {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('loginEmail').value.replace(/\s/g, '').toLowerCase();
      const password = document.getElementById('loginPass').value;
      state.loading = true;
      state.loginError = '';
      render();
      try {
        await adminSignIn(identifier, password);
      } catch (err) {
        const msgs = {
          'auth/invalid-email': 'ชื่อผู้ใช้ไม่ถูกต้อง — ใช้ admin หรืออีเมล เช่น xxx@gmail.com',
          'auth/invalid-credential': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง — ใช้ user ที่สร้างในโปรเจกต์ phuket-donghood',
          'auth/user-not-found': 'ไม่พบบัญชีนี้ — ใน Firebase ต้องใส่ Email เป็น ชื่อผู้ใช้@phuket-donghood.firebaseapp.com',
          'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
          'auth/unauthorized-domain': 'โดเมนนี้ยังไม่อนุญาต — เปิดด้วย http://localhost:3000 หรือเพิ่มโดเมนใน Authentication → Settings → Authorized domains',
          'auth/operation-not-allowed': 'ยังไม่ได้เปิด Email/Password ใน Authentication → Sign-in method',
        };
        state.loginError = msgs[err.code] || err.message;
        state.loading = false;
        render();
      }
    };
    return;
  }

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    state.navOpen = false;
    adminSignOut();
  });

  document.getElementById('navToggle')?.addEventListener('click', () => setNavOpen(!state.navOpen));
  document.getElementById('navBackdrop')?.addEventListener('click', () => setNavOpen(false));
  document.getElementById('navClose')?.addEventListener('click', () => setNavOpen(false));

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.onclick = async () => {
      state.view = btn.dataset.view;
      state.navOpen = false;
      state.selectedOrder = null;
      state.editingItem = null;
      state.editingZone = null;
      state.editingDriver = null;
      if (state.view === 'menu') await loadMenuView();
      if (state.view === 'zones') await loadZones();
      if (state.view === 'drivers') { await loadZones(); await loadDrivers(); }
      if (state.view === 'settings') await loadSettings();
      if (state.view === 'schedule') await loadSchedule();
      render();
    };
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.onclick = () => { state.ordersFilter = btn.dataset.filter; render(); };
  });

  document.querySelectorAll('[data-cal-shift]').forEach(btn => {
    btn.onclick = () => {
      state.ordersCalendarOffset += Number(btn.dataset.calShift);
      ensureOrdersDate();
      render();
    };
  });

  document.querySelector('[data-cal-today]')?.addEventListener('click', () => {
    state.ordersCalendarOffset = 0;
    state.ordersDate = todayKey();
    render();
  });

  document.querySelectorAll('[data-cal-day]').forEach(btn => {
    btn.onclick = () => {
      state.ordersDate = btn.dataset.calDay;
      render();
    };
  });

  document.querySelectorAll('[data-order-driver]').forEach(sel => {
    sel.onchange = async () => {
      const firestoreId = sel.dataset.orderDriver;
      const order = state.orders.find(o => o.firestoreId === firestoreId);
      if (!order) return;
      const driverId = sel.value;
      const driver = state.drivers.find(d => d.id === driverId);
      state.loading = true;
      render();
      try {
        await updateOrderDriver(firestoreId, driverId, driver?.name || '');
        if (state.selectedOrder?.firestoreId === firestoreId) {
          state.selectedOrder = { ...state.selectedOrder, driverId, driverName: driver?.name || '' };
        }
        toast(driverId ? `จัด ${driver.name} ส่งแล้ว` : 'ยกเลิกการจัดคนส่งแล้ว');
      } catch (err) {
        sel.value = order.driverId || '';
        toast('จัดคนส่งไม่สำเร็จ: ' + err.message);
      }
      state.loading = false;
      render();
    };
  });

  document.querySelectorAll('[data-order-status]').forEach(sel => {
    sel.onchange = async () => {
      const firestoreId = sel.dataset.orderStatus;
      const order = state.orders.find(o => o.firestoreId === firestoreId);
      const newStatus = sel.value;
      if (!order || order.status === newStatus) return;

      if (newStatus === 'cancelled' && !confirm(`ยกเลิกออร์เดอร์ #${order.orderId}?`)) {
        sel.value = order.status;
        return;
      }

      sel.className = `status-select ${statusClass(newStatus)}`;
      state.loading = true;
      render();
      try {
        await updateOrderStatus(firestoreId, newStatus);
        if (state.selectedOrder?.firestoreId === firestoreId) {
          state.selectedOrder = { ...state.selectedOrder, status: newStatus };
        }
        markOrderSeen(firestoreId);
        toast('อัปเดตสถานะแล้ว');
      } catch (err) {
        sel.value = order.status;
        toast('อัปเดตไม่สำเร็จ: ' + err.message);
      }
      state.loading = false;
      render();
    };
  });

  document.querySelectorAll('[data-order]').forEach(btn => {
    btn.onclick = () => {
      state.selectedOrder = state.orders.find(o => o.firestoreId === btn.dataset.order);
      markOrderSeenIfPending(state.selectedOrder);
      render();
    };
  });

  document.getElementById('closeOrder')?.addEventListener('click', () => { state.selectedOrder = null; render(); });
  document.getElementById('orderOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'orderOverlay') { state.selectedOrder = null; render(); }
  });

  document.querySelectorAll('[data-status]').forEach(btn => {
    btn.onclick = async () => {
      if (!state.selectedOrder) return;
      state.loading = true;
      render();
      try {
        await updateOrderStatus(state.selectedOrder.firestoreId, btn.dataset.status);
        state.selectedOrder = { ...state.selectedOrder, status: btn.dataset.status };
        markOrderSeen(state.selectedOrder.firestoreId);
        toast('อัปเดตสถานะแล้ว');
      } catch (err) {
        toast('อัปเดตไม่สำเร็จ: ' + err.message);
      }
      state.loading = false;
      render();
    };
  });

  document.getElementById('addMenuBtn')?.addEventListener('click', () => {
    state.editingItem = {};
    render();
  });

  document.getElementById('seedMenuBtn')?.addEventListener('click', async () => {
    if (!confirm('อัปเดตเมนู ราคา และรูปทั้ง 11 รายการ รวมถึงรูปเมนูหน้าลูกค้า ให้ตรงกับแคตตาล็อกหลัก?\n(สถานะหมดวันนี้จะถูกรีเซ็ต รูปที่อัปโหลดเองจะถูกแทนที่ และรายการที่ไม่อยู่ในแคตตาล็อกจะถูกลบ)')) return;
    state.loading = true;
    render();
    try {
      const result = await seedInitialMenuData();
      await loadMenuView();
      toast(`Sync เมนูแล้ว ${result.menu} รายการ`);
    } catch (err) {
      toast('Sync ไม่สำเร็จ: ' + err.message);
    }
    state.loading = false;
    render();
  });

  document.getElementById('menuHeroFile')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    state.loading = true;
    render();
    try {
      const url = await uploadMenuImage(file);
      state.settings = { ...(state.settings || {}), menuImage: url };
      toast('เปลี่ยนรูปเมนูหน้าลูกค้าแล้ว');
    } catch (err) {
      toast('อัปโหลดไม่สำเร็จ: ' + err.message);
    }
    state.loading = false;
    render();
  });

  document.getElementById('menuHeroCopy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(new URL(currentMenuImage(), window.location.href).href);
      toast('คัดลอกลิงก์รูปแล้ว');
    } catch {
      toast('คัดลอกไม่สำเร็จ');
    }
  });

  document.getElementById('menuHeroReset')?.addEventListener('click', async () => {
    if (!confirm('กลับไปใช้รูปเมนูตามแคตตาล็อก?')) return;
    state.loading = true;
    render();
    try {
      await resetMenuImage();
      state.settings = { ...(state.settings || {}), menuImage: '' };
      toast('กลับไปใช้รูปตามแคตตาล็อกแล้ว');
    } catch (err) {
      toast('ไม่สำเร็จ: ' + err.message);
    }
    state.loading = false;
    render();
  });

  document.querySelectorAll('[data-item-image]').forEach(input => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      const item = state.menu.find(m => m.id === input.dataset.itemImage);
      if (!file || !item) return;
      state.loading = true;
      render();
      try {
        await uploadMenuItemImage(item, file);
        await loadMenu();
        toast(`เปลี่ยนรูป ${item.th} แล้ว`);
      } catch (err) {
        toast('อัปโหลดไม่สำเร็จ: ' + err.message);
      }
      state.loading = false;
      render();
    });
  });

  document.querySelectorAll('[data-reset-item]').forEach(btn => {
    btn.onclick = async () => {
      const item = state.menu.find(m => m.id === btn.dataset.resetItem);
      if (!item) return;
      if (!confirm(`รีเจน "${item.th}" ให้ตรงกับเมนูหลัก?\n(ชื่อ ราคา คำอธิบาย และรูปจะถูกแทนที่ด้วยค่าจากแคตตาล็อก)`)) return;
      state.loading = true;
      render();
      try {
        await resetMenuItemToCatalog(item);
        await loadMenu();
        toast(`รีเจน ${catalogMenuItem(item.id)?.th || item.th} ตามเมนูหลักแล้ว`);
      } catch (err) {
        toast('รีเจนไม่สำเร็จ: ' + err.message);
      }
      state.loading = false;
      render();
    };
  });

  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => {
      state.editingItem = { ...state.menu.find(m => m.id === btn.dataset.edit) };
      render();
    };
  });

  document.querySelectorAll('[data-toggle-soldout]').forEach(btn => {
    btn.onclick = async () => {
      const item = state.menu.find(m => m.id === btn.dataset.toggleSoldout);
      if (!item) return;
      await saveMenuItem({ ...item, soldOut: !item.soldOut });
      await loadMenu();
      toast(item.soldOut ? 'เปิดขายแล้ว' : 'ตั้งเป็นหมดวันนี้');
      render();
    };
  });

  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('ลบเมนูนี้?')) return;
      await deleteMenuItem(btn.dataset.delete);
      await loadMenu();
      toast('ลบแล้ว');
      render();
    };
  });

  document.getElementById('closeMenuForm')?.addEventListener('click', () => { state.editingItem = null; render(); });
  document.getElementById('menuForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.loading = true;
    render();
    try {
      await saveMenuItem({
        id: fd.get('id'),
        cat: fd.get('cat'),
        th: fd.get('th'),
        en: fd.get('en'),
        price: fd.get('price'),
        sortOrder: fd.get('sortOrder'),
        desc: fd.get('desc'),
        img: fd.get('img'),
        badge: fd.get('badge'),
        soldOut: fd.get('soldOut') === 'on',
      });
      state.editingItem = null;
      await loadMenu();
      toast('บันทึกเมนูแล้ว');
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message);
    }
    state.loading = false;
    render();
  });

  document.querySelectorAll('[data-schedule-date]').forEach(btn => {
    btn.onclick = async () => {
      syncRoundTimesFromDom();
      state.scheduleDate = btn.dataset.scheduleDate;
      await loadSchedule();
      render();
    };
  });

  document.querySelectorAll('[data-schedule-zone]').forEach(btn => {
    btn.onclick = () => {
      syncRoundTimesFromDom();
      state.scheduleZone = btn.dataset.scheduleZone;
      render();
    };
  });

  document.getElementById('scheduleEnabledToggle')?.addEventListener('change', (e) => {
    state.scheduleEnabled = e.target.checked;
    render();
  });

  document.getElementById('scheduleCutoffInput')?.addEventListener('change', (e) => {
    state.scheduleCutoff = e.target.value || DEFAULT_CUTOFF_TIME;
  });

  document.getElementById('scheduleClosedToggle')?.addEventListener('change', (e) => {
    syncRoundTimesFromDom();
    state.scheduleCloseOn = e.target.checked;
    if (!state.scheduleCloseOn) {
      state.scheduleClosedReason = '';
      state.scheduleCloseMode = 'now';
    }
    render();
  });

  document.querySelectorAll('input[name="scheduleCloseMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.scheduleCloseMode = e.target.value === 'time' ? 'time' : 'now';
      render();
    });
  });

  document.getElementById('scheduleCloseAtInput')?.addEventListener('change', (e) => {
    state.scheduleCloseAt = e.target.value || DEFAULT_CLOSE_TIME;
    render();
  });

  document.getElementById('scheduleClosedReasonInput')?.addEventListener('input', (e) => {
    state.scheduleClosedReason = e.target.value;
  });

  document.querySelectorAll('[data-close-reason]').forEach(btn => {
    btn.onclick = () => {
      state.scheduleClosedReason = btn.dataset.closeReason;
      render();
    };
  });

  document.getElementById('applyPresetsAllZonesBtn')?.addEventListener('click', () => {
    if (!confirm('ใส่รอบ 17:00 / 20:00 / 23:00 ให้ทุกโซนของวันนี้?\n(รอบเดิมของวันนี้จะถูกแทนที่)')) return;
    applyDefaultRoundsToAllZones();
    state.scheduleEnabled = true;
    if (!state.scheduleCutoff) state.scheduleCutoff = DEFAULT_CUTOFF_TIME;
    render();
  });

  document.getElementById('addRoundBtn')?.addEventListener('click', () => {
    if (!state.scheduleZone) return;
    addRoundToZone(state.scheduleZone);
    render();
  });

  document.querySelectorAll('[data-preset-time]').forEach(btn => {
    btn.onclick = () => {
      if (!state.scheduleZone) return;
      const time = btn.dataset.presetTime;
      const exists = roundsForScheduleZone(state.scheduleZone).some(r => (r.time || '').split('–')[0].trim() === time);
      if (exists) {
        toast('มีรอบนี้ในโซนแล้ว');
        return;
      }
      addRoundToZone(state.scheduleZone, time);
      render();
    };
  });

  document.querySelectorAll('.round-time[data-round-id]').forEach(input => {
    input.oninput = () => {
      const round = state.scheduleRounds.find(r => r.id === input.dataset.roundId);
      if (round) round.time = input.value;
    };
  });

  document.querySelectorAll('[data-remove-round]').forEach(btn => {
    btn.onclick = () => {
      state.scheduleRounds = state.scheduleRounds.filter(r => r.id !== btn.dataset.removeRound);
      render();
    };
  });

  document.getElementById('saveScheduleBtn')?.addEventListener('click', async () => {
    syncRoundTimesFromDom();
    const rounds = state.scheduleEnabled
      ? state.scheduleRounds
        .map(r => ({ id: r.id, zoneId: r.zoneId, time: (r.time || '').trim() }))
        .filter(r => r.time && r.zoneId)
      : [];

    const closeOn = state.scheduleCloseOn;
    const closeMode = state.scheduleCloseMode === 'time' ? 'time' : 'now';
    const immediateClosed = closeOn && closeMode === 'now';
    const closeAt = closeOn && closeMode === 'time' ? (state.scheduleCloseAt || DEFAULT_CLOSE_TIME) : '';
    const closedReason = closeOn ? (state.scheduleClosedReason || '').trim() : '';

    state.loading = true;
    render();
    try {
      await saveSchedule(state.scheduleDate, {
        enabled: state.scheduleEnabled,
        cutoffTime: state.scheduleCutoff || DEFAULT_CUTOFF_TIME,
        rounds,
        closed: immediateClosed,
        closeAt,
        closedReason,
      });
      state.scheduleRounds = rounds;
      state.scheduleClosedReason = closedReason;
      toast(!closeOn
        ? (state.scheduleEnabled ? 'บันทึกวันส่งแล้ว' : 'บันทึกเป็นวันไม่ส่งแล้ว')
        : (closeMode === 'time'
          ? `ตั้งเวลาปิดรับ ${formatTimeLabel(closeAt)} น. แล้ว`
          : 'ปิดรับออร์เดอร์วันนี้แล้ว'));
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message);
    }
    state.loading = false;
    render();
  });

  document.getElementById('addZoneBtn')?.addEventListener('click', () => {
    state.editingZone = {};
    render();
  });

  document.getElementById('seedDriversBtn')?.addEventListener('click', async () => {
    if (!confirm('Seed คนส่ง 3 คน (พี่เอก/พี่บอล/พี่ก้อง)?\nID ซ้ำจะถูกเขียนทับ')) return;
    state.loading = true;
    render();
    try {
      const result = await seedDefaultDrivers();
      await loadDrivers();
      toast(`Seed คนส่ง ${result.count} คนแล้ว`);
    } catch (err) {
      toast('Seed ไม่สำเร็จ: ' + err.message);
    }
    state.loading = false;
    render();
  });

  document.getElementById('addDriverBtn')?.addEventListener('click', async () => {
    if (!state.zones.length) await loadZones();
    state.editingDriver = {};
    render();
  });

  document.querySelectorAll('[data-copy-driver-link]').forEach(btn => {
    btn.onclick = async () => {
      const driver = state.drivers.find(d => d.id === btn.dataset.copyDriverLink);
      if (!driver) return;
      try {
        await navigator.clipboard.writeText(driverJobUrl(driver.id));
        toast('คัดลอกลิงก์แล้ว');
      } catch {
        toast('คัดลอกไม่สำเร็จ');
      }
    };
  });

  document.querySelectorAll('[data-edit-driver]').forEach(btn => {
    btn.onclick = async () => {
      if (!state.zones.length) await loadZones();
      state.editingDriver = { ...state.drivers.find(d => d.id === btn.dataset.editDriver) };
      render();
    };
  });

  document.querySelectorAll('[data-delete-driver]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('ลบคนส่งนี้?')) return;
      await deleteDriver(btn.dataset.deleteDriver);
      await loadDrivers();
      toast('ลบแล้ว');
      render();
    };
  });

  document.getElementById('closeDriverForm')?.addEventListener('click', () => { state.editingDriver = null; render(); });
  document.getElementById('driverForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.loading = true;
    render();
    try {
      await saveDriver({
        id: fd.get('id'),
        name: fd.get('name'),
        phone: fd.get('phone'),
        zoneIds: [...fd.getAll('zoneIds')],
        sortOrder: fd.get('sortOrder'),
        active: fd.get('active') === 'on',
      });
      state.editingDriver = null;
      await loadDrivers();
      toast('บันทึกคนส่งแล้ว');
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message);
    }
    state.loading = false;
    render();
  });

  document.getElementById('seedDeliveryBtn')?.addEventListener('click', async () => {
    if (!confirm('อัปเดตโซนจัดส่ง 9 พื้นที่ + ตารางจัดส่ง 7 วัน (รอบ 17:00 / 20:00 / 23:00)?\n(โซนเก่าและตารางเดิมในช่วงนี้จะถูกแทนที่)')) return;
    state.loading = true;
    render();
    try {
      const result = await seedInitialDeliveryData();
      await loadZones();
      if (state.view === 'schedule') await loadSchedule();
      toast(`Seed แล้ว: ${result.zones} โซน · ${result.days} วัน`);
    } catch (err) {
      toast('Seed ไม่สำเร็จ: ' + err.message);
    }
    state.loading = false;
    render();
  });

  document.querySelectorAll('[data-edit-zone]').forEach(btn => {
    btn.onclick = () => {
      state.editingZone = { ...state.zones.find(z => z.id === btn.dataset.editZone) };
      render();
    };
  });

  document.querySelectorAll('[data-delete-zone]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('ลบโซนนี้?')) return;
      await deleteZone(btn.dataset.deleteZone);
      await loadZones();
      toast('ลบโซนแล้ว');
      render();
    };
  });

  document.getElementById('closeZoneForm')?.addEventListener('click', () => { state.editingZone = null; render(); });
  document.getElementById('zoneForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.loading = true;
    render();
    try {
      await saveZone({
        id: fd.get('id'),
        nameTh: fd.get('nameTh'),
        nameEn: fd.get('nameEn'),
        sortOrder: fd.get('sortOrder'),
        deliveryFee: fd.get('deliveryFee'),
        freeAbove: fd.get('freeAbove'),
        active: fd.get('active') === 'on',
      });
      state.editingZone = null;
      await loadZones();
      toast('บันทึกโซนแล้ว');
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message);
    }
    state.loading = false;
    render();
  });

  const qrFileInput = document.getElementById('qrFileInput');
  const qrPreview = document.getElementById('qrPreview');
  const qrValueInput = document.getElementById('promptPayQrValue');

  qrFileInput?.addEventListener('change', () => {
    const file = qrFileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('กรุณาเลือกรูปภาพเท่านั้น');
      qrFileInput.value = '';
      return;
    }
    if (state.pendingQrPreviewUrl) URL.revokeObjectURL(state.pendingQrPreviewUrl);
    state.pendingQrFile = file;
    state.pendingQrPreviewUrl = URL.createObjectURL(file);
    if (qrPreview) qrPreview.src = state.pendingQrPreviewUrl;
  });

  document.getElementById('qrClearBtn')?.addEventListener('click', () => {
    if (state.pendingQrPreviewUrl) URL.revokeObjectURL(state.pendingQrPreviewUrl);
    state.pendingQrFile = null;
    state.pendingQrPreviewUrl = '';
    if (qrFileInput) qrFileInput.value = '';
    if (qrValueInput) qrValueInput.value = '';
    if (state.settings) state.settings.promptPayQr = '';
    if (qrPreview) qrPreview.src = '../assets/promptpay-qr.jpg';
    toast('จะกลับไปใช้รูป QR เดิมของระบบเมื่อบันทึก');
  });

  document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
    const form = document.getElementById('settingsForm');
    const fd = new FormData(form);
    const storeHours = {};
    for (let i = 0; i < 7; i++) {
      storeHours[i] = { open: fd.get(`open_${i}`), close: fd.get(`close_${i}`) };
    }
    const storePhones = String(fd.get('storePhones') || '')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    const qrFile = state.pendingQrFile;
    let promptPayQr = String(fd.get('promptPayQr') || state.settings?.promptPayQr || '').trim();
    const dataBase = {
      storeName: fd.get('storeName'),
      storeNameTh: fd.get('storeNameTh'),
      storeTagline: fd.get('storeTagline'),
      deliveryFee: Number(fd.get('deliveryFee')),
      minDeliveryOrder: Number(fd.get('minDeliveryOrder')),
      storePhones,
      storePhone: storePhones[0] || '',
      lineId: String(fd.get('lineId') || '').replace(/^@/, '').trim(),
      promptPayName: fd.get('promptPayName'),
      promptPayBank: String(fd.get('promptPayBank') || '').trim(),
      promptPayAccount: String(fd.get('promptPayAccount') || '').trim(),
      pickupLocation: fd.get('pickupLocation'),
      storeHighlights: (fd.get('storeHighlights') || '').split('\n').map(s => s.trim()).filter(Boolean),
      storeHours,
    };
    state.loading = true;
    render();
    try {
      if (qrFile) {
        promptPayQr = await uploadPromptPayQr(qrFile);
        if (state.pendingQrPreviewUrl) URL.revokeObjectURL(state.pendingQrPreviewUrl);
        state.pendingQrFile = null;
        state.pendingQrPreviewUrl = '';
      }
      const data = { ...dataBase, promptPayQr };
      await saveSettings(data);
      state.settings = { ...(state.settings || {}), ...data };
      toast('บันทึกการตั้งค่าแล้ว');
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message);
    }
    state.loading = false;
    render();
  });
}

function startOrdersWatch() {
  if (unsubOrders) unsubOrders();
  ordersWatchReady = false;
  unsubOrders = watchOrders((orders, err) => {
    if (err) toast('โหลดออร์เดอร์ไม่สำเร็จ — ตรวจ Firestore rules');

    if (ordersWatchReady) {
      const prevIds = new Set(state.orders.map(o => o.firestoreId));
      const incoming = orders.filter(o => !prevIds.has(o.firestoreId) && o.status === 'pending_slip_review');
      incoming.forEach(o => unseenOrderIds.add(o.firestoreId));
      if (incoming.length === 1) {
        toast(`🔔 ออร์เดอร์ใหม่ #${incoming[0].orderId} — ${incoming[0].displayName || 'ลูกค้า'}`);
      } else if (incoming.length > 1) {
        toast(`🔔 ออร์เดอร์ใหม่ ${incoming.length} รายการ`);
      }
    } else {
      ordersWatchReady = true;
    }

    state.orders = orders;
    if (state.selectedOrder) {
      state.selectedOrder = orders.find(o => o.firestoreId === state.selectedOrder.firestoreId) || null;
    }
    render();
  });
}

export function startAdmin() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.navOpen) setNavOpen(false);
  });
  render(); // show login immediately while auth initializes
  watchAuth(async (user) => {
    state.user = user;
    state.loading = false;
    state.loginError = '';
    if (user) {
      startOrdersWatch();
      await Promise.all([loadDrivers(), loadZones()]);
      if (state.view === 'menu') await loadMenuView();
      if (state.view === 'settings') await loadSettings();
      if (state.view === 'schedule') await loadSchedule();
    } else if (unsubOrders) {
      unsubOrders();
      unsubOrders = null;
      ordersWatchReady = false;
      unseenOrderIds.clear();
      state.orders = [];
    }
    render();
  });
}
