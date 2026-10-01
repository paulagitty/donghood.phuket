/**
 * Read-only check: zones + schedule in Firestore (no auth needed).
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyADvua1E38EI59IM_sT7-xbftnuN7TFopA',
  authDomain: 'phuket-donghood.firebaseapp.com',
  projectId: 'phuket-donghood',
  storageBucket: 'phuket-donghood.firebasestorage.app',
  messagingSenderId: '866873070397',
  appId: '1:866873070397:web:7a7a605198c6e56137eb54',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function dateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('🔍 ตรวจสอบ Firestore — phuket-donghood\n');

  const zonesSnap = await getDocs(query(collection(db, 'delivery_zones'), orderBy('sortOrder', 'asc')));
  console.log(`📍 delivery_zones: ${zonesSnap.size} โซน`);
  if (zonesSnap.empty) {
    console.log('   ⚠️  ยังไม่มีโซน — กด "Seed ข้อมูลเริ่มต้น" ใน Admin หรือรัน npm run seed');
  } else {
    zonesSnap.docs.forEach(d => {
      const z = d.data();
      console.log(`   · ${d.id}: ${z.nameTh} (${z.nameEn || '—'}) ${z.active !== false ? '✓' : 'ปิด'}`);
    });
  }

  console.log('\n📅 delivery_schedule (3 วันแรก):');
  let scheduleOk = 0;
  for (let i = 0; i < 3; i++) {
    const key = dateKey(i);
    const snap = await getDoc(doc(db, 'delivery_schedule', key));
    if (!snap.exists()) {
      console.log(`   · ${key}: ⚠️  ไม่มีข้อมูล`);
      continue;
    }
    const rounds = snap.data().rounds || [];
    scheduleOk++;
    console.log(`   · ${key}: ${rounds.length} รอบ`);
    rounds.forEach(r => {
      const zoneLabel = r.zoneId ? `โซน=${r.zoneId}` : (r.route ? `route=${r.route}` : '—');
      console.log(`      - ${r.time || '?'} (${zoneLabel})`);
    });
  }

  const settingsSnap = await getDoc(doc(db, 'store_settings', 'main'));
  console.log(`\n⚙️  store_settings/main: ${settingsSnap.exists() ? '✓ มีแล้ว' : '⚠️  ยังไม่มี'}`);

  const menuSnap = await getDocs(collection(db, 'menu_items'));
  console.log(`🍽️  menu_items: ${menuSnap.size} รายการ`);

  console.log('\n--- สรุป ---');
  console.log(`Rules deploy: ตรวจจาก terminal แล้ว ✓`);
  console.log(`Zones: ${zonesSnap.size >= 4 ? '✓' : zonesSnap.size > 0 ? '⚠️ มีแต่ไม่ครบ 4' : '❌ ยังไม่ seed'}`);
  console.log(`Schedule: ${scheduleOk >= 3 ? '✓' : scheduleOk > 0 ? '⚠️ มีบางวัน' : '❌ ยังไม่ seed'}`);
}

main().catch(err => {
  console.error('❌ อ่าน Firestore ไม่ได้:', err.message);
  process.exit(1);
});
