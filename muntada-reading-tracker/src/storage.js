// Telegram Mini Apps don't have access to the special `window.storage` API
// that exists inside Claude's artifact preview. In a real deployment we use
// Telegram's own CloudStorage (persists per-user, tied to their Telegram
// account) and fall back to localStorage when the page is opened in a
// regular browser (useful for local testing outside Telegram).

function cloudStorage() {
  return window.Telegram?.WebApp?.CloudStorage || null;
}

// تنبيه مؤقت للتشخيص — نشيله بعد ما نعرف السبب
function debugAlert(message) {
  const tg = window.Telegram?.WebApp;
  if (tg?.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

export const storage = {
  async get(key) {
    const cs = cloudStorage();
    if (!cs) {
      debugAlert("لا يوجد CloudStorage — استخدام localStorage بدلاً منه");
      return localStorage.getItem(key);
    }
    return new Promise((resolve) => {
      cs.getItem(key, (err, value) => {
        if (err) {
          debugAlert("خطأ بالقراءة: " + JSON.stringify(err));
          resolve(null);
          return;
        }
        resolve(!value ? null : value);
      });
    });
  },

  async set(key, value) {
    const cs = cloudStorage();
    if (!cs) {
      debugAlert("لا يوجد CloudStorage — الحفظ بـ localStorage بدلاً منه");
      localStorage.setItem(key, value);
      return true;
    }
    return new Promise((resolve) => {
      cs.setItem(key, value, (err, success) => {
        if (err) {
          debugAlert("خطأ بالحفظ: " + JSON.stringify(err));
          resolve(false);
          return;
        }
        if (!success) {
          debugAlert("الحفظ رجع false بدون خطأ واضح");
        }
        resolve(!!success);
      });
    });
  },
};