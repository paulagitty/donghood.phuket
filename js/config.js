/* Donghood — shared config (customer + future admin) */
window.DH = window.DH || {};

DH.config = {
  storeName: 'Donghood',
  storeNameTh: 'ดองฮู้ด',
  storeTagline: 'ดองซีอิ๊วเกาหลี · ส่งฟรีตัวเมืองเมื่อครบ 200.-',
  storeHighlights: [
    'แซลมอนสดใหม่ ไม่คาว ละลายในปาก',
    'สะอาด ปลอดภัย คัดสรรวัตถุดิบคุณภาพ',
    'อร่อย คุ้มค่า ให้เยอะ จัดเต็ม',
  ],
  pickupLocation: 'Donghood · ภูเก็ต',
  deliveryFee: 0,
  minDeliveryOrder: 200,
  cutoffMinBeforeClose: 30,
  storePhone: '0922499112',
  storePhones: ['0635196745', '0922499112'],
  social: {
    instagram: 'donghood99',
    facebook: 'DongHood Phuket',
    tiktok: '@donghoodphuket',
    // LINE OA ของร้าน เช่น donghood หรือ @donghood — ว่างได้ ยังแชร์ใบออร์เดอร์ผ่านแอป LINE ได้
    line: '205daaa',
  },
  promptPayName: 'นาย อันดา งานแข็ง',
  promptPayBank: 'ธนาคารกรุงเทพ',
  promptPayAccount: '573-0-55204-8',
  promptPayQr: '../assets/promptpay-qr.jpg',
  devMode: false,
  useFirebase: true,
  // First visit: upload local menu/settings/schedule to Firestore if collections are empty
  autoSeed: false,
  // Bump when local MENU in data.js changes — pushes catalog to Firestore once per version
  menuCatalogVersion: 4,
  // Bump when local DELIVERY_ZONES change — syncs zones to Firestore once per version
  zonesCatalogVersion: 3,
};

/* Guest session for web orders (no LINE / LIFF) */
DH.initGuestSession = function () {
  const KEY = 'dh-guest-id';
  let userId = localStorage.getItem(KEY);
  if (!userId) {
    userId = `guest-${(crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
    localStorage.setItem(KEY, userId);
  }
  return { userId };
};
