/**
 * Seed delivery zones + schedule to Firestore (requires admin login).
 *
 * Usage:
 *   FIREBASE_ADMIN_EMAIL=you@gmail.com FIREBASE_ADMIN_PASSWORD=secret npm run seed
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  writeBatch,
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

const ZONES = [
  { id: 'chalong', nameTh: 'ฉลอง', nameEn: 'Chalong', sortOrder: 1, active: true, deliveryFee: 0 },
  { id: 'thalang', nameTh: 'ถลาง', nameEn: 'Thalang', sortOrder: 2, active: true, deliveryFee: 0 },
  { id: 'kathu', nameTh: 'กะทู้', nameEn: 'Kathu', sortOrder: 3, active: true, deliveryFee: 30 },
  { id: 'patong', nameTh: 'ป่าตอง', nameEn: 'Patong', sortOrder: 4, active: true, deliveryFee: 50 },
];

function dateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function buildSchedule() {
  return {
    [dateKey(0)]: [
      { id: 'r1', zoneId: 'thalang', time: '11:00 – 13:00' },
      { id: 'r2', zoneId: 'patong', time: '15:00 – 17:00' },
      { id: 'r3', zoneId: 'kathu', time: '15:00 – 17:00' },
    ],
    [dateKey(1)]: [
      { id: 'r1', zoneId: 'chalong', time: '11:00 – 13:00' },
      { id: 'r2', zoneId: 'thalang', time: '11:00 – 13:00' },
      { id: 'r3', zoneId: 'patong', time: '15:00 – 17:00' },
      { id: 'r4', zoneId: 'kathu', time: '17:30 – 19:30' },
    ],
    [dateKey(2)]: [
      { id: 'r1', zoneId: 'chalong', time: '11:00 – 13:00' },
      { id: 'r2', zoneId: 'patong', time: '15:00 – 17:00' },
      { id: 'r3', zoneId: 'kathu', time: '17:30 – 19:30' },
    ],
    [dateKey(3)]: [
      { id: 'r1', zoneId: 'chalong', time: '11:00 – 13:00' },
      { id: 'r2', zoneId: 'thalang', time: '15:00 – 17:00' },
      { id: 'r3', zoneId: 'patong', time: '17:30 – 19:30' },
    ],
    [dateKey(4)]: [
      { id: 'r1', zoneId: 'kathu', time: '11:00 – 13:00' },
      { id: 'r2', zoneId: 'patong', time: '15:00 – 17:00' },
    ],
    [dateKey(5)]: [
      { id: 'r1', zoneId: 'thalang', time: '11:00 – 13:00' },
      { id: 'r2', zoneId: 'chalong', time: '15:00 – 17:00' },
    ],
    [dateKey(6)]: [
      { id: 'r1', zoneId: 'patong', time: '11:00 – 13:00' },
      { id: 'r2', zoneId: 'kathu', time: '15:00 – 17:00' },
    ],
  };
}

async function main() {
  const email = process.env.FIREBASE_ADMIN_EMAIL?.trim();
  const password = process.env.FIREBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('❌ ต้องตั้งค่า FIREBASE_ADMIN_EMAIL และ FIREBASE_ADMIN_PASSWORD');
    console.error('   ตัวอย่าง: FIREBASE_ADMIN_EMAIL=app@gmail.com FIREBASE_ADMIN_PASSWORD=xxx npm run seed');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log('🔐 กำลังเข้าสู่ระบบ...');
  await signInWithEmailAndPassword(auth, email, password);
  console.log('✅ เข้าสู่ระบบแล้ว:', email);

  console.log('📍 กำลัง seed โซนจัดส่ง...');
  const zoneBatch = writeBatch(db);
  ZONES.forEach(z => {
    batch.set(doc(db, 'delivery_zones', z.id), {
      nameTh: z.nameTh,
      nameEn: z.nameEn,
      sortOrder: z.sortOrder,
      deliveryFee: Number(z.deliveryFee) || 0,
      active: z.active,
      updatedAt: serverTimestamp(),
    });
  });
  await zoneBatch.commit();
  console.log(`✅ บันทึก ${ZONES.length} โซนแล้ว`);

  console.log('📅 กำลัง seed ตารางจัดส่ง 7 วัน...');
  const schedule = buildSchedule();
  for (const [date, rounds] of Object.entries(schedule)) {
    await setDoc(doc(db, 'delivery_schedule', date), {
      rounds,
      updatedAt: serverTimestamp(),
    });
    console.log(`   · ${date} → ${rounds.length} รอบ`);
  }

  console.log('\n🎉 Seed เสร็จสมบูรณ์!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Seed ล้มเหลว:', err.message);
  process.exit(1);
});
