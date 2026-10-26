// גשר קטן כדי שמודולים בלי גישה ל-app.js יוכלו לסגור את החלון הפתוח
export const closeModalById = () => {
  const d = document.getElementById('modal'); if (!d) return;
  d.id = 'modal-out'; d.classList.add('out'); setTimeout(() => d.remove(), 220);
};
