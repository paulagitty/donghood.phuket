import { startAdmin } from './admin-app.js';

try {
  startAdmin();
} catch (err) {
  console.error('[Admin]', err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <h1>DONG<span>HOOD</span> Admin</h1>
          <p class="err">โหลดไม่สำเร็จ: ${err.message}</p>
          <p style="font-size:12px;color:var(--cream-dim);margin-top:12px;">
            ลอง refresh หรือรัน <code>npm run dev</code> ใหม่ (port 3000)
          </p>
        </div>
      </div>`;
  }
}
