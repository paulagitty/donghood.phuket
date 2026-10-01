import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseAuth, db, storage } from './firebase.js';
import { ref, getDownloadURL, uploadBytes } from 'firebase/storage';

const COL = {
  menu: 'menu_items',
  settings: 'store_settings',
  schedule: 'delivery_schedule',
  zones: 'delivery_zones',
  drivers: 'delivery_drivers',
  orders: 'orders',
};

export const ORDER_STATUS = {
  pending_slip_review: 'รอตรวจสลิป',
  confirmed: 'ยืนยันแล้ว',
  preparing: 'กำลังทำ',
  ready: 'พร้อมส่ง/รับ',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

export const PAYMENT_METHOD = {
  promptpay: 'โอน PromptPay',
  cod: 'จ่ายปลายทาง',
};

export const MENU_CATS = [
  { id: 'menu', label: 'เมนู' },
  { id: 'set', label: 'ชุดพร้อมอิ่ม' },
  { id: 'addon', label: 'เพิ่มเติม' },
];

/** Internal domain so a username like "admin" can still use Email/Password auth. */
export const ADMIN_USERNAME_DOMAIN = 'phuket-donghood.firebaseapp.com';

export function toAdminEmail(identifier) {
  const value = String(identifier || '').replace(/\s/g, '').toLowerCase();
  if (!value) return value;
  if (value.includes('@')) return value;
  return `${value}@${ADMIN_USERNAME_DOMAIN}`;
}

export function adminLabel(user) {
  const email = user?.email || '';
  const suffix = `@${ADMIN_USERNAME_DOMAIN}`;
  if (email.endsWith(suffix)) return email.slice(0, -suffix.length);
  return user?.displayName || email;
}

export function watchAuth(cb) {
  return onAuthStateChanged(getFirebaseAuth(), cb);
}

export async function adminSignIn(identifier, password) {
  return signInWithEmailAndPassword(getFirebaseAuth(), toAdminEmail(identifier), password);
}

export async function adminSignOut() {
  return signOut(getFirebaseAuth());
}

export function watchOrders(cb) {
  const q = query(collection(db, COL.orders), orderBy('createdAt', 'desc'));
  return onSnapshot(q, async snap => {
    const orders = snap.docs.map(d => ({ firestoreId: d.id, ...d.data(), createdAt: d.data().createdAt }));
    await Promise.all(orders.map(async (o) => {
      if (o.slipUrl || !o.slipPath) return;
      try {
        o.slipUrl = await getDownloadURL(ref(storage, o.slipPath));
      } catch (err) {
        console.warn('Could not resolve slipPath', o.slipPath, err?.code || err);
      }
    }));
    cb(orders);
  }, err => cb([], err));
}

export async function updateOrderStatus(firestoreId, status) {
  await updateDoc(doc(db, COL.orders, firestoreId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function updateOrderDriver(firestoreId, driverId, driverName) {
  await updateDoc(doc(db, COL.orders, firestoreId), {
    driverId: driverId || '',
    driverName: driverName || '',
    updatedAt: serverTimestamp(),
  });
}

export function driverJobUrl(driverId) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/driver/?t=${encodeURIComponent(driverId)}`;
}

export async function fetchMenu() {
  const snap = await getDocs(query(collection(db, COL.menu), orderBy('sortOrder', 'asc')));
  return snap.docs.map(d => ({ firestoreId: d.id, ...d.data(), id: d.data().id || d.id }));
}

export async function saveMenuItem(item) {
  const id = item.id || `item_${Date.now()}`;
  await setDoc(doc(db, COL.menu, id), {
    id,
    cat: item.cat || 'menu',
    th: item.th || '',
    en: item.en || '',
    price: Number(item.price) || 0,
    soldOut: !!item.soldOut,
    popular: !!item.popular,
    badge: item.badge || '',
    desc: item.desc || '',
    img: item.img || '',
    sortOrder: Number(item.sortOrder) || 999,
    active: item.active !== false,
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function deleteMenuItem(id) {
  await deleteDoc(doc(db, COL.menu, id));
}

export async function fetchSettings() {
  const snap = await getDoc(doc(db, COL.settings, 'main'));
  return snap.exists() ? snap.data() : null;
}

export async function saveSettings(data) {
  await setDoc(doc(db, COL.settings, 'main'), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Upload an image under store/<folder>/; returns public download URL. */
async function uploadStoreImage(file, folder) {
  if (!file) throw new Error('ไม่พบไฟล์รูป');
  if (!String(file.type || '').startsWith('image/')) throw new Error('กรุณาเลือกรูปภาพเท่านั้น');
  if (file.size > 5 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 5MB');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `store/${folder}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}

/** Upload PromptPay QR image; returns public download URL. */
export function uploadPromptPayQr(file) {
  return uploadStoreImage(file, 'promptpay-qr');
}

/** Default flyer shown on the customer menu page. */
export const DEFAULT_MENU_IMAGE = '../assets/menu.png';

/** Upload a new menu flyer (customer hero image) and publish it to settings. */
export async function uploadMenuImage(file) {
  const url = await uploadStoreImage(file, 'menu-image');
  await saveSettings({ menuImage: url });
  return url;
}

/** Remove the custom flyer so customers see the catalog default again. */
export async function resetMenuImage() {
  await saveSettings({ menuImage: '' });
}

/** Upload a photo for a single menu item and save it on the item. */
export async function uploadMenuItemImage(item, file) {
  const url = await uploadStoreImage(file, `menu-items/${item.id}`);
  await saveMenuItem({ ...item, img: url });
  return url;
}

export const DEFAULT_DELIVERY_TIMES = ['17:00', '20:00', '23:00'];
export const DEFAULT_CUTOFF_TIME = '23:00';

export function normalizeScheduleDay(data) {
  if (!data) {
    return { enabled: false, cutoffTime: DEFAULT_CUTOFF_TIME, rounds: [], closed: false, closeAt: '', closedReason: '' };
  }
  if (Array.isArray(data)) {
    return {
      enabled: data.length > 0,
      cutoffTime: DEFAULT_CUTOFF_TIME,
      rounds: data,
      closed: false,
      closeAt: '',
      closedReason: '',
    };
  }
  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  return {
    enabled: data.enabled !== false && (data.enabled === true || rounds.length > 0),
    cutoffTime: data.cutoffTime || DEFAULT_CUTOFF_TIME,
    rounds,
    closed: data.closed === true,
    closeAt: data.closeAt || '',
    closedReason: data.closedReason || '',
  };
}

export async function fetchSchedule(dateKey) {
  const snap = await getDoc(doc(db, COL.schedule, dateKey));
  return normalizeScheduleDay(snap.exists() ? snap.data() : null);
}

export async function saveSchedule(dateKey, payload) {
  let enabled;
  let cutoffTime;
  let rounds;
  let closed = false;
  let closeAt = '';
  let closedReason = '';
  if (Array.isArray(payload)) {
    enabled = payload.length > 0;
    cutoffTime = DEFAULT_CUTOFF_TIME;
    rounds = payload;
  } else {
    enabled = !!payload?.enabled;
    cutoffTime = payload?.cutoffTime || DEFAULT_CUTOFF_TIME;
    rounds = Array.isArray(payload?.rounds) ? payload.rounds : [];
    closed = payload?.closed === true;
    closeAt = closed ? '' : String(payload?.closeAt || '').trim();
    const closeActive = closed || !!closeAt;
    closedReason = closeActive ? String(payload?.closedReason || '').trim().slice(0, 60) : '';
  }
  await setDoc(doc(db, COL.schedule, dateKey), {
    enabled,
    cutoffTime,
    rounds: enabled ? rounds : [],
    closed,
    closeAt,
    closedReason,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchZones() {
  const snap = await getDocs(query(collection(db, COL.zones), orderBy('sortOrder', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveZone(zone) {
  const id = zone.id || `zone_${Date.now()}`;
  await setDoc(doc(db, COL.zones, id), {
    nameTh: zone.nameTh || '',
    nameEn: zone.nameEn || '',
    sortOrder: Number(zone.sortOrder) || 99,
    deliveryFee: Number(zone.deliveryFee) || 0,
    freeAbove: zone.freeAbove != null ? Number(zone.freeAbove) || 0 : 0,
    active: zone.active !== false,
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function deleteZone(id) {
  await deleteDoc(doc(db, COL.zones, id));
}

export async function fetchDrivers() {
  const snap = await getDocs(query(collection(db, COL.drivers), orderBy('sortOrder', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveDriver(driver) {
  const id = driver.id || `drv_${Math.random().toString(36).slice(2, 10)}`;
  await setDoc(doc(db, COL.drivers, id), {
    name: driver.name || '',
    phone: driver.phone || '',
    zoneIds: Array.isArray(driver.zoneIds) ? driver.zoneIds : [],
    sortOrder: Number(driver.sortOrder) || 99,
    active: driver.active !== false,
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function deleteDriver(id) {
  await deleteDoc(doc(db, COL.drivers, id));
}

const DEFAULT_DRIVERS = [
  { id: 'drv_aek', name: 'พี่เอก', phone: '0811111001', zoneIds: ['mueang', 'chalong', 'kohkaew'], sortOrder: 1, active: true },
  { id: 'drv_ball', name: 'พี่บอล', phone: '0822222002', zoneIds: ['rawai', 'kata', 'karon'], sortOrder: 2, active: true },
  { id: 'drv_kong', name: 'พี่ก้อง', phone: '0833333003', zoneIds: ['patong', 'airport', 'maikhao'], sortOrder: 3, active: true },
];

export async function seedDefaultDrivers() {
  for (const d of DEFAULT_DRIVERS) {
    await saveDriver(d);
  }
  return { count: DEFAULT_DRIVERS.length };
}

export function driverForZone(drivers, zoneId) {
  if (!zoneId) return null;
  return drivers.find(d => d.active !== false && (d.zoneIds || []).includes(zoneId)) || null;
}

export async function getDriver(driverId) {
  const snap = await getDoc(doc(db, COL.drivers, driverId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchDriverOrders(driverId, cb) {
  const q = query(collection(db, COL.orders), where('driverId', '==', driverId));
  return onSnapshot(q, (snap) => {
    const orders = snap.docs
      .map(d => ({ firestoreId: d.id, ...d.data(), createdAt: d.data().createdAt }))
      .sort((a, b) => {
        const da = a.date || '';
        const db_ = b.date || '';
        if (da !== db_) return da.localeCompare(db_);
        return (a.roundTime || '').localeCompare(b.roundTime || '');
      });
    cb(orders, null);
  }, err => cb([], err));
}

const DEFAULT_MENU = [
  {
    id: 'm1', cat: 'menu', th: 'กุ้งดองเกาหลี', en: 'Pickled Korean Shrimp',
    price: 125, soldOut: false,
    desc: 'กุ้งดองซีอิ๊วเกาหลี 6 ตัว · ไม่รวมน้ำจิ้ม',
    img: '../assets/menu-items/m1-shrimp.jpg',
  },
  {
    id: 'm2', cat: 'menu', th: 'แซลมอนดองเกาหลี', en: 'Pickled Korean Salmon',
    price: 145, soldOut: false,
    desc: 'แซลมอนดองซีอิ๊วเกาหลี 100 กรัม · ไม่รวมน้ำจิ้ม',
    img: '../assets/menu-items/m2-salmon.jpg',
  },
  {
    id: 'm3', cat: 'menu', th: 'เซ็ตรวมสุดคุ้ม', en: 'Best Value Mixed Set',
    price: 199, soldOut: false, badge: 'ขายดี!',
    desc: 'แซลมอน 60 กรัม + กุ้ง 3 ตัว · ไม่รวมน้ำจิ้ม',
    img: '../assets/menu-items/m3-combo.jpg',
  },
  {
    id: 's1', cat: 'set', th: 'SET S', en: 'Set S',
    price: 135, soldOut: false,
    desc: 'กุ้งดอง + ข้าวญี่ปุ่น 1 + น้ำจิ้ม 1',
    img: '../assets/menu-items/s1-set-s.jpg',
  },
  {
    id: 's2', cat: 'set', th: 'SET M', en: 'Set M',
    price: 219, soldOut: false,
    desc: 'เซ็ตรวมแซลมอน + กุ้ง + ข้าวญี่ปุ่น 1 + น้ำจิ้ม 1',
    img: '../assets/menu-items/s2-set-m.jpg',
  },
  {
    id: 's3', cat: 'set', th: 'SET L', en: 'Set L',
    price: 299, soldOut: false,
    desc: 'แซลมอนดอง + กุ้งดอง + ข้าวญี่ปุ่น 1 + สาหร่าย 1 + น้ำจิ้ม 2',
    img: '../assets/menu-items/s3-set-l.jpg',
  },
  {
    id: 'a1', cat: 'addon', th: 'ข้าวญี่ปุ่น', en: 'Japanese Rice',
    price: 20, soldOut: false,
    desc: 'ข้าวญี่ปุ่นเพิ่ม 1 ถ้วย',
    img: '../assets/menu-items/a1-rice.jpg',
  },
  {
    id: 'a2', cat: 'addon', th: 'น้ำจิ้มซีฟู้ด', en: 'Seafood Sauce',
    price: 10, soldOut: false,
    desc: 'น้ำจิ้มซีฟู้ด แซ่บ จัดจ้าน',
    img: '../assets/menu-items/a2-sauce.jpg',
  },
  {
    id: 'a3', cat: 'addon', th: 'สาหร่ายญี่ปุ่น', en: 'Japanese Seaweed',
    price: 25, soldOut: false,
    desc: 'สาหร่ายญี่ปุ่นเพิ่ม',
    img: '../assets/menu-items/a3-seaweed.jpg',
  },
  {
    id: 'a4', cat: 'addon', th: 'เพิ่มแซลมอน', en: 'Extra Salmon',
    price: 59, soldOut: false,
    desc: 'แซลมอนดองเกาหลีเพิ่ม 50 กรัม',
    img: '../assets/menu-items/a4-extra-salmon.jpg',
  },
  {
    id: 'a5', cat: 'addon', th: 'เพิ่มกุ้ง', en: 'Extra Shrimp',
    price: 59, soldOut: false,
    desc: 'กุ้งดองเกาหลีเพิ่ม 4 ตัว',
    img: '../assets/menu-items/a5-extra-shrimp.jpg',
  },
];

export function catalogMenuItem(id) {
  return DEFAULT_MENU.find(m => m.id === id) || null;
}

/** Regenerate one item (name, price, desc, picture) from the main catalog. Keeps sold-out state. */
export async function resetMenuItemToCatalog(item) {
  const idx = DEFAULT_MENU.findIndex(m => m.id === item.id);
  if (idx < 0) throw new Error('เมนูนี้ไม่อยู่ในแคตตาล็อกหลัก');
  await saveMenuItem({ ...DEFAULT_MENU[idx], sortOrder: idx + 1, soldOut: !!item.soldOut });
}

export async function seedInitialMenuData() {
  const existing = await getDocs(collection(db, COL.menu));
  const keepIds = new Set(DEFAULT_MENU.map(m => m.id));
  for (const d of existing.docs) {
    const dataId = d.data().id || d.id;
    if (!keepIds.has(dataId) && !keepIds.has(d.id)) await deleteDoc(d.ref);
  }
  for (let i = 0; i < DEFAULT_MENU.length; i++) {
    await saveMenuItem({ ...DEFAULT_MENU[i], sortOrder: i + 1, soldOut: false });
  }
  await saveSettings({ menuCatalogVersion: 4, menuImage: '' });
  return { menu: DEFAULT_MENU.length };
}

const DEFAULT_ZONES = [
  { id: 'mueang', nameTh: 'อำเภอเมือง / ตัวเมืองภูเก็ต', nameEn: 'Phuket Town', sortOrder: 1, active: true, deliveryFee: 50, freeAbove: 200 },
  { id: 'kohkaew', nameTh: 'เกาะแก้ว', nameEn: 'Koh Kaew', sortOrder: 2, active: true, deliveryFee: 60 },
  { id: 'chalong', nameTh: 'ฉลอง', nameEn: 'Chalong', sortOrder: 3, active: true, deliveryFee: 60 },
  { id: 'rawai', nameTh: 'ราไวย์', nameEn: 'Rawai', sortOrder: 4, active: true, deliveryFee: 70 },
  { id: 'kata', nameTh: 'กะตะ', nameEn: 'Kata', sortOrder: 5, active: true, deliveryFee: 70 },
  { id: 'karon', nameTh: 'กะรน', nameEn: 'Karon', sortOrder: 6, active: true, deliveryFee: 80 },
  { id: 'patong', nameTh: 'ป่าตอง', nameEn: 'Patong', sortOrder: 7, active: true, deliveryFee: 100 },
  { id: 'airport', nameTh: 'สนามบินภูเก็ต', nameEn: 'Phuket Airport', sortOrder: 8, active: true, deliveryFee: 120 },
  { id: 'maikhao', nameTh: 'ไม้ขาว', nameEn: 'Mai Khao', sortOrder: 9, active: true, deliveryFee: 150 },
];

function buildDefaultSchedule() {
  const schedule = {};
  const times = DEFAULT_DELIVERY_TIMES;
  upcomingDateKeys(7).forEach((key) => {
    const rounds = [];
    DEFAULT_ZONES.forEach((z, zi) => {
      times.forEach((t, ti) => {
        rounds.push({ id: `r${zi}_${ti}`, zoneId: z.id, time: t });
      });
    });
    schedule[key] = {
      enabled: true,
      cutoffTime: DEFAULT_CUTOFF_TIME,
      rounds,
    };
  });
  return schedule;
}

export async function seedInitialDeliveryData() {
  const existing = await getDocs(collection(db, COL.zones));
  const keepIds = new Set(DEFAULT_ZONES.map(z => z.id));
  for (const d of existing.docs) {
    if (!keepIds.has(d.id)) await deleteDoc(d.ref);
  }
  for (const z of DEFAULT_ZONES) {
    await saveZone(z);
  }
  const schedule = buildDefaultSchedule();
  for (const [date, day] of Object.entries(schedule)) {
    await saveSchedule(date, day);
  }
  await saveSettings({ zonesCatalogVersion: 3 });
  return { zones: DEFAULT_ZONES.length, days: Object.keys(schedule).length };
}

/** Local calendar date YYYY-MM-DD (not UTC — avoids TH timezone shift). */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function upcomingDateKeys(days = 7) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return localDateKey(d);
  });
}

export function formatDateLabel(dateKey) {
  const { dayLabel, dateLabel } = formatDateLabelParts(dateKey);
  return `${dayLabel} · ${dateLabel}`;
}

export function formatDateLabelParts(dateKey) {
  const d = new Date(dateKey + 'T12:00:00');
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'];
  const daysShort = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const today = localDateKey();
  const isToday = dateKey === today;
  return {
    dayLabel: isToday ? 'วันนี้' : days[d.getDay()],
    dayShort: isToday ? 'วันนี้' : daysShort[d.getDay()],
    dateLabel: `${d.getDate()} ${months[d.getMonth()]}`,
    dayNum: String(d.getDate()),
  };
}
