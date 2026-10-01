window.DH = window.DH || {};

DH.util = {
  dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; },
  money(n) { return n.toLocaleString('th-TH'); },
  fmtMin(t) {
    const h = Math.floor(t / 60), m = t % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },
  escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },
  isValidThaiPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return /^(0[689]\d{8}|66[689]\d{8})$/.test(digits);
  },
  isValidEmail(email) {
    const s = String(email || '').trim();
    if (!s) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(s);
  },
  spiceLabel(level) {
    if (!level) return '';
    return '🌶'.repeat(Math.min(level, 3));
  },
};
