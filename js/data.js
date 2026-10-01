/* Mock data — admin backoffice will replace via Firestore/API */
window.DH = window.DH || {};

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'];
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

DH.data = {
  THAI_DAYS,
  THAI_MONTHS,

  STORE_HOURS: {
    0: { open: '10:00', close: '21:00' },
    1: { open: '11:00', close: '20:00' },
    2: { open: '11:00', close: '20:00' },
    3: { open: '11:00', close: '20:00' },
    4: { open: '11:00', close: '20:00' },
    5: { open: '11:00', close: '20:00' },
    6: { open: '10:00', close: '21:00' },
  },

  CATS: [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'menu', label: 'เมนู' },
    { id: 'set', label: 'ชุดพร้อมอิ่ม' },
    { id: 'addon', label: 'เพิ่มเติม' },
    { id: 'delivery', label: 'ค่าจัดส่ง' },
  ],

  CAT_ICON: {
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 11c0-3 3.5-6 8-6s8 3 8 6"/><path d="M3 11h18l-1.4 6.2a2 2 0 0 1-2 1.8H6.4a2 2 0 0 1-2-1.8L3 11Z"/></svg>`,
    set: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V5M8 5h8"/><path d="M8 14h8M8 17h5"/></svg>`,
    addon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>`,
    delivery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  },

  MENU_IMAGE: '../assets/menu.png',

  /* LIVE DATA HOOK: Firestore `menu_items` — catalog v4 (Sep 2026 flyer) */
  MENU: [
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
  ],

  /* LIVE DATA HOOK: Firestore `delivery_zones` — catalog v3 */
  DELIVERY_ZONES: [
    { id: 'mueang', nameTh: 'อำเภอเมือง / ตัวเมืองภูเก็ต', nameEn: 'Phuket Town', sortOrder: 1, active: true, deliveryFee: 50, freeAbove: 200 },
    { id: 'kohkaew', nameTh: 'เกาะแก้ว', nameEn: 'Koh Kaew', sortOrder: 2, active: true, deliveryFee: 60 },
    { id: 'chalong', nameTh: 'ฉลอง', nameEn: 'Chalong', sortOrder: 3, active: true, deliveryFee: 60 },
    { id: 'rawai', nameTh: 'ราไวย์', nameEn: 'Rawai', sortOrder: 4, active: true, deliveryFee: 70 },
    { id: 'kata', nameTh: 'กะตะ', nameEn: 'Kata', sortOrder: 5, active: true, deliveryFee: 70 },
    { id: 'karon', nameTh: 'กะรน', nameEn: 'Karon', sortOrder: 6, active: true, deliveryFee: 80 },
    { id: 'patong', nameTh: 'ป่าตอง', nameEn: 'Patong', sortOrder: 7, active: true, deliveryFee: 100 },
    { id: 'airport', nameTh: 'สนามบินภูเก็ต', nameEn: 'Phuket Airport', sortOrder: 8, active: true, deliveryFee: 120 },
    { id: 'maikhao', nameTh: 'ไม้ขาว', nameEn: 'Mai Khao', sortOrder: 9, active: true, deliveryFee: 150 },
  ],
};

DH.getDeliveryZones = function () {
  return DH.data.deliveryZones || DH.data.DELIVERY_ZONES;
};

/* LIVE DATA HOOK: Firestore `delivery_schedule/{date}` — evening rounds from 17:00 */
DH.getDeliverySchedule = function () {
  if (DH.data.deliverySchedule) return DH.data.deliverySchedule;

  const dateKey = DH.util.dateKey;
  const addDays = DH.util.addDays;
  const times = ['17:00', '20:00', '23:00'];
  const zoneIds = (DH.data.DELIVERY_ZONES || []).map(z => z.id);
  const buildDay = (offset) => {
    const rounds = [];
    zoneIds.forEach((zoneId, zi) => {
      times.forEach((t, ti) => {
        rounds.push({ id: `r${offset}_${zi}_${ti}`, zoneId, time: t });
      });
    });
    return { enabled: true, cutoffTime: '23:00', rounds };
  };
  return {
    [dateKey(addDays(0))]: buildDay(0),
    [dateKey(addDays(1))]: buildDay(1),
    [dateKey(addDays(2))]: buildDay(2),
    [dateKey(addDays(3))]: buildDay(3),
    [dateKey(addDays(4))]: buildDay(4),
    [dateKey(addDays(5))]: buildDay(5),
    [dateKey(addDays(6))]: buildDay(6),
  };
};
