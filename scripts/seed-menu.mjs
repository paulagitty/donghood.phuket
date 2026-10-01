/**
 * Push local menu catalog (data.js) to Firestore menu_items + bump catalog version.
 * Auth: any signed-in user (rules: request.auth != null). Prefer admin email/password.
 *
 * Usage:
 *   FIREBASE_ADMIN_EMAIL=admin@phuket-donghood.firebaseapp.com FIREBASE_ADMIN_PASSWORD=xxx npm run seed:menu
 *   # or anonymous (if enabled):
 *   npm run seed:menu
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyADvua1E38EI59IM_sT7-xbftnuN7TFopA',
  authDomain: 'phuket-donghood.firebaseapp.com',
  projectId: 'phuket-donghood',
  storageBucket: 'phuket-donghood.firebasestorage.app',
  messagingSenderId: '866873070397',
  appId: '1:866873070397:web:7a7a605198c6e56137eb54',
};

const require = createRequire(import.meta.url);
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadLocalMenu() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dataJs = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
  const configJs = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
  const DH = {};
  const sandbox = { window: { DH }, console, DH };
  vm.createContext(sandbox);
  vm.runInContext(configJs + '\n' + dataJs, sandbox);
  const MENU = sandbox.DH?.data?.MENU || sandbox.window.DH?.data?.MENU;
  const cfg = sandbox.DH?.config || sandbox.window.DH?.config || {};
  const version = cfg.menuCatalogVersion || 4;
  const social = cfg.social || {};
  if (!MENU?.length) throw new Error('ไม่พบ DH.data.MENU ใน js/data.js');
  return { MENU, version, social, config: cfg };
}

async function main() {
  const { MENU, version, social, config } = loadLocalMenu();
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const email = process.env.FIREBASE_ADMIN_EMAIL?.trim();
  const password = process.env.FIREBASE_ADMIN_PASSWORD;

  console.log('🔐 กำลังเข้าสู่ระบบ...');
  if (email && password) {
    await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ เข้าสู่ระบบแล้ว:', email);
  } else {
    await signInAnonymously(auth);
    console.log('✅ Anonymous auth');
  }

  console.log(`🍽️  Sync เมนู ${MENU.length} รายการ (catalog v${version})...`);
  const existing = await getDocs(collection(db, 'menu_items'));
  const keepIds = new Set(MENU.map(m => m.id));
  for (const d of existing.docs) {
    const dataId = d.data().id || d.id;
    if (!keepIds.has(dataId) && !keepIds.has(d.id)) {
      await deleteDoc(d.ref);
      console.log(`   · ลบ ${d.id}`);
    }
  }

  for (let i = 0; i < MENU.length; i++) {
    const item = MENU[i];
    await setDoc(doc(db, 'menu_items', item.id), {
      id: item.id,
      cat: item.cat || 'menu',
      th: item.th || '',
      en: item.en || '',
      price: Number(item.price) || 0,
      soldOut: !!item.soldOut,
      popular: !!item.popular,
      badge: item.badge || '',
      desc: item.desc || '',
      img: item.img || '',
      sortOrder: i + 1,
      active: true,
      updatedAt: serverTimestamp(),
    });
    console.log(`   · ${item.id} ${item.th} ฿${item.price}`);
  }

  await setDoc(
    doc(db, 'store_settings', 'main'),
    {
      menuCatalogVersion: Number(version) || 0,
      lineId: String(social.line || '').replace(/^@/, ''),
      storeName: config.storeName,
      storeNameTh: config.storeNameTh,
      storeTagline: config.storeTagline,
      storePhone: config.storePhone,
      storePhones: config.storePhones || [],
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  console.log(`⚙️  store_settings menuCatalogVersion → ${version}`);
  console.log('\n🎉 Seed เมนูเสร็จสมบูรณ์!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Seed เมนูล้มเหลว:', err.code || '', err.message);
  process.exit(1);
});
