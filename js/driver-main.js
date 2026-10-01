import { startDriverApp } from './driver-app.js';

try {
  startDriverApp();
} catch (err) {
  console.error('[Driver]', err);
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<p class="err">โหลดไม่สำเร็จ: ${err.message}</p>`;
}
