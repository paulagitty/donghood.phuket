import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';
import { db, storage, getFirebaseAuth } from './firebase.js';

const COL = {
  menu: 'menu_items',
  settings: 'store_settings',
  schedule: 'delivery_schedule',
  zones: 'delivery_zones',
  orders: 'orders',
};

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(base64);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

/** Storage read rules require auth; guest checkout signs in anonymously when available. */
async function ensureGuestStorageAuth() {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return;
  try {
    await signInAnonymously(auth);
  } catch (err) {
    console.warn('Anonymous auth unavailable for slip URL', err?.code || err);
  }
}

function mapMenuDoc(d) {
  const x = d.data();
  return {
    id: x.id || d.id,
    cat: x.cat || 'menu',
    th: x.th || '',
    en: x.en || '',
    price: Number(x.price) || 0,
    soldOut: !!x.soldOut,
    popular: !!x.popular,
    badge: x.badge || '',
    desc: x.desc || '',
    img: x.img || '',
    sortOrder: x.sortOrder ?? 999,
  };
}

export async function loadRemoteData(localFallback) {
  const result = { source: 'local', menu: false, settings: false, schedule: false };

  try {
    const settingsSnap = await getDoc(doc(db, COL.settings, 'main'));

    // Customer is read-only — catalog writes happen from Admin (Sync/Seed)
    const menuSnap = await getDocs(query(collection(db, COL.menu), orderBy('sortOrder', 'asc')));
    if (!menuSnap.empty) {
      DH.data.MENU = menuSnap.docs.map(mapMenuDoc);
      result.menu = true;
      result.source = 'firebase';
    } else if (localFallback?.MENU?.length) {
      DH.data.MENU = [...localFallback.MENU];
      result.menu = true;
    }

    if (settingsSnap.exists()) {
      applySettings(settingsSnap.data());
      result.settings = true;
      if (result.source === 'local') result.source = 'firebase';
    }

    const schedule = await loadDeliverySchedule();
    if (Object.keys(schedule).length) {
      DH.data.deliverySchedule = schedule;
      result.schedule = true;
      result.source = 'firebase';
    } else if (localFallback?.getDeliverySchedule) {
      DH.data.deliverySchedule = localFallback.getDeliverySchedule();
      result.schedule = true;
    }

    const zones = await loadDeliveryZones();
    if (zones.length) {
      DH.data.deliveryZones = zones;
      result.zones = true;
      result.source = 'firebase';
    } else if (localFallback?.DELIVERY_ZONES?.length) {
      DH.data.deliveryZones = localFallback.DELIVERY_ZONES;
      result.zones = true;
    }
  } catch (err) {
    console.error('[Firebase] loadRemoteData failed:', err);
    result.error = err.message;
    if (localFallback?.MENU?.length && !DH.data.MENU?.length) {
      DH.data.MENU = [...localFallback.MENU];
    }
    if (localFallback?.DELIVERY_ZONES && !DH.data.deliveryZones) {
      DH.data.deliveryZones = localFallback.DELIVERY_ZONES;
    }
  }

  DH.firebaseStatus = result;
  return result;
}

function applySettings(s) {
  if (s.storeName) DH.config.storeName = s.storeName;
  if (s.storeNameTh) DH.config.storeNameTh = s.storeNameTh;
  if (s.storeTagline) DH.config.storeTagline = s.storeTagline;
  if (Array.isArray(s.storeHighlights)) DH.config.storeHighlights = s.storeHighlights;
  if (s.pickupLocation) DH.config.pickupLocation = s.pickupLocation;
  if (s.deliveryFee != null) DH.config.deliveryFee = Number(s.deliveryFee);
  if (s.minDeliveryOrder != null) DH.config.minDeliveryOrder = Number(s.minDeliveryOrder);
  if (s.cutoffMinBeforeClose != null) DH.config.cutoffMinBeforeClose = Number(s.cutoffMinBeforeClose);
  if (s.storePhone) DH.config.storePhone = s.storePhone;
  if (Array.isArray(s.storePhones)) {
    const phones = s.storePhones.map(p => String(p || '').trim()).filter(Boolean);
    if (phones.length) DH.config.storePhones = phones;
  }
  if (s.promptPayName) DH.config.promptPayName = s.promptPayName;
  if (s.promptPayBank) DH.config.promptPayBank = s.promptPayBank;
  if (s.promptPayAccount) DH.config.promptPayAccount = s.promptPayAccount;
  if (s.promptPayQr) DH.config.promptPayQr = s.promptPayQr;
  if (s.storeHours) DH.data.STORE_HOURS = s.storeHours;
  if (s.menuImage) DH.data.MENU_IMAGE = s.menuImage;
  if (s.lineId != null || s.lineOfficialId != null) {
    DH.config.social = DH.config.social || {};
    DH.config.social.line = String(s.lineId || s.lineOfficialId || '').replace(/^@/, '');
  }
}

async function loadDeliveryZones() {
  const snap = await getDocs(query(collection(db, COL.zones), orderBy('sortOrder', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadDeliverySchedule() {
  const schedule = {};
  const keys = [0, 1, 2, 3, 4, 5, 6].map(n => DH.util.dateKey(DH.util.addDays(n)));
  await Promise.all(keys.map(async (key) => {
    const snap = await getDoc(doc(db, COL.schedule, key));
    if (!snap.exists()) return;
    const data = snap.data();
    if (Array.isArray(data.rounds) || data.enabled != null || data.closed != null || data.closeAt != null) {
      const rounds = Array.isArray(data.rounds) ? data.rounds : [];
      schedule[key] = {
        enabled: data.enabled !== false && (data.enabled === true || rounds.length > 0),
        cutoffTime: data.cutoffTime || '23:00',
        rounds,
        closed: data.closed === true,
        closeAt: data.closeAt || '',
        closedReason: data.closedReason || '',
      };
    }
  }));
  return schedule;
}

export async function submitOrderToFirebase(order) {
  const orderId = 'DH' + Math.floor(1000 + Math.random() * 9000);
  let slipUrl = null;
  let slipPath = null;

  if (order.slipFile) {
    await ensureGuestStorageAuth();
    const blob = dataUrlToBlob(order.slipFile);
    slipPath = `slips/${orderId}/${Date.now()}.jpg`;
    const storageRef = ref(storage, slipPath);
    await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
    try {
      slipUrl = await getDownloadURL(storageRef);
    } catch (err) {
      // Upload already succeeded. Keep the order; admin can resolve slipPath while signed in.
      console.warn('getDownloadURL after slip upload failed; saving slipPath only', err?.code || err);
    }
  }

  const roundInfo = order.roundInfo || {};
  const paymentMethod = order.paymentMethod === 'cod' ? 'cod' : 'promptpay';
  const docRef = await addDoc(collection(db, COL.orders), {
    orderId,
    userId: order.userId,
    displayName: order.displayName,
    phone: order.phone,
    email: order.email || '',
    notes: order.notes || '',
    orderType: order.orderType,
    date: order.date,
    round: order.round,
    zoneId: order.zoneId || roundInfo.zoneId || '',
    zoneName: order.zoneName || roundInfo.zoneName || roundInfo.route || '',
    roundTime: roundInfo.time || '',
    roundRoute: roundInfo.route || roundInfo.zoneName || '',
    address: order.address || '',
    items: order.items,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    paymentMethod,
    slipUrl,
    slipPath,
    status: 'pending_slip_review',
    createdAt: serverTimestamp(),
  });

  return { orderId, firestoreId: docRef.id, slipUrl, slipPath };
}

async function seedMenu(items) {
  const existing = await getDocs(collection(db, COL.menu));
  const keepIds = new Set(items.map(item => item.id));
  const batch = writeBatch(db);
  existing.docs.forEach(d => {
    const dataId = d.data().id || d.id;
    if (!keepIds.has(dataId) && !keepIds.has(d.id)) batch.delete(d.ref);
  });
  items.forEach((item, i) => {
    const ref = doc(db, COL.menu, item.id);
    batch.set(ref, { ...item, sortOrder: i + 1, active: true, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

async function seedSettings(localFallback) {
  await setDoc(doc(db, COL.settings, 'main'), {
    storeName: DH.config.storeName,
    storeNameTh: DH.config.storeNameTh,
    storeTagline: DH.config.storeTagline,
    storeHighlights: DH.config.storeHighlights,
    pickupLocation: DH.config.pickupLocation,
    deliveryFee: DH.config.deliveryFee,
    minDeliveryOrder: DH.config.minDeliveryOrder,
    cutoffMinBeforeClose: DH.config.cutoffMinBeforeClose,
    storePhone: DH.config.storePhone,
    storePhones: DH.config.storePhones || [DH.config.storePhone].filter(Boolean),
    promptPayName: DH.config.promptPayName,
    promptPayBank: DH.config.promptPayBank,
    promptPayAccount: DH.config.promptPayAccount,
    promptPayQr: DH.config.promptPayQr,
    lineId: (DH.config.social && DH.config.social.line) || '',
    storeHours: localFallback?.STORE_HOURS || DH.data.STORE_HOURS,
    menuCatalogVersion: Number(DH.config.menuCatalogVersion) || 0,
    zonesCatalogVersion: Number(DH.config.zonesCatalogVersion) || 0,
    updatedAt: serverTimestamp(),
  });
}

async function seedDeliverySchedule(schedule) {
  const batch = writeBatch(db);
  Object.entries(schedule).forEach(([date, day]) => {
    const payload = Array.isArray(day)
      ? { enabled: day.length > 0, cutoffTime: '23:00', rounds: day }
      : {
        enabled: day.enabled !== false,
        cutoffTime: day.cutoffTime || '23:00',
        rounds: day.rounds || [],
      };
    batch.set(doc(db, COL.schedule, date), { ...payload, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

async function seedDeliveryZones(zones) {
  const existing = await getDocs(collection(db, COL.zones));
  const keepIds = new Set(zones.map(z => z.id));
  const batch = writeBatch(db);
  existing.docs.forEach(d => {
    if (!keepIds.has(d.id)) batch.delete(d.ref);
  });
  zones.forEach(z => {
    batch.set(doc(db, COL.zones, z.id), {
      nameTh: z.nameTh,
      nameEn: z.nameEn || '',
      sortOrder: z.sortOrder ?? 99,
      deliveryFee: Number(z.deliveryFee) || 0,
      freeAbove: z.freeAbove != null ? Number(z.freeAbove) || 0 : 0,
      active: z.active !== false,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}
