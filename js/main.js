import { loadRemoteData, submitOrderToFirebase } from './firebase-service.js';

window.DH = window.DH || {};
DH.firebaseStatus = { source: 'loading' };

function showBootError(msg) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <header class="top"><div class="top-row"><div class="brand"><h1>DONG<span class="accent">HOOD</span></h1></div></div></header>
    <main style="padding:40px 20px;text-align:center;color:#e39a8c;font-size:14px;line-height:1.6;">
      โหลดไม่สำเร็จ<br><span style="color:#c9bfae;font-size:12px;">${msg}</span><br>
      <button type="button" onclick="location.reload()" style="margin-top:16px;padding:10px 16px;border-radius:10px;border:1px solid #46403c;background:#2f2b28;color:#efe6d6;cursor:pointer;">ลองใหม่</button>
    </main>`;
}

async function waitForGlobals(timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.DH?.config && window.DH?.data && window.DH?.util) return;
    await new Promise(r => setTimeout(r, 40));
  }
  throw new Error('โหลดไฟล์ตั้งค่าไม่ครบ — รีเฟรชหน้าหรือล้างแคชแล้วลองใหม่');
}

try {
  await waitForGlobals();

  if (DH.config.useFirebase) {
    DH.submitOrder = submitOrderToFirebase;
    await loadRemoteData({
      MENU: DH.data.MENU,
      STORE_HOURS: DH.data.STORE_HOURS,
      DELIVERY_ZONES: DH.data.DELIVERY_ZONES,
      getDeliverySchedule: DH.getDeliverySchedule,
    });
  } else {
    DH.firebaseStatus = { source: 'local' };
    DH.submitOrder = async () => {
      await new Promise(r => setTimeout(r, 600));
      return { orderId: 'DH' + Math.floor(1000 + Math.random() * 9000) };
    };
  }

  await import('./app.js');
  await DH.startApp();
} catch (err) {
  console.error('[Donghood] boot failed:', err);
  showBootError(err?.message || String(err));
}
