import { supabase } from "./supabaseClient.js";

function debugAlert(message) {
  console.error(message);
  // عرض مضمون على الشاشة نفسها (يشتغل بأي بيئة، بديل عن tg.showAlert)
  let box = document.getElementById("debug-error-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "debug-error-box";
    box.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#C0392B;color:#fff;font-size:12px;padding:10px;direction:rtl;max-height:40vh;overflow:auto;white-space:pre-wrap;";
    document.body.appendChild(box);
  }
  const line = document.createElement("div");
  line.style.borderTop = "1px solid rgba(255,255,255,0.3)";
  line.style.paddingTop = "4px";
  line.style.marginTop = "4px";
  line.textContent = message;
  box.appendChild(line);
}

// يتأكد إن المستخدم موجود بجدول users، ويرجع صفه (يسويه إذا مو موجود)
async function ensureUser(telegramId, name) {
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("users")
    .insert({ telegram_id: telegramId, name })
    .select()
    .single();

  if (error) {
    debugAlert("خطأ بإنشاء المستخدم: " + error.message);
    return null;
  }
  return data;
}

// يجيب بيانات المستخدم كاملة (الاسم + optIn + كل سجلات القراءة + عدد الكتب المنتهية)
export async function loadUserData(telegramId, fallbackName) {
  const user = await ensureUser(telegramId, fallbackName);
  if (!user) return { name: fallbackName || "", optIn: false, entries: [], booksFinished: 0 };

  const { data: logs, error } = await supabase
    .from("reading_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("entry_date", { ascending: true });

  if (error) {
    debugAlert("خطأ بجلب السجلات: " + error.message);
  }

  const entries = (logs || []).map((l) => ({
    id: l.id,
    date: l.entry_date,
    book: l.book,
    pages: l.pages,
    minutes: l.minutes,
    note: l.note || "",
  }));

  const { count } = await supabase
    .from("book_completions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  return {
    name: user.name || fallbackName || "",
    optIn: !!user.opt_in,
    entries,
    booksFinished: count || 0,
  };
}

// يسجّل إنهاء كتاب (زر يدوي يضغطه المستخدم)
export async function finishBook(telegramId, bookTitle) {
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", telegramId)
    .single();

  if (!user) {
    debugAlert("لم يتم العثور على المستخدم");
    return false;
  }

  const { error } = await supabase
    .from("book_completions")
    .insert({ user_id: user.id, book_title: bookTitle });

  if (error) {
    debugAlert("خطأ بتسجيل إنهاء الكتاب: " + error.message);
    return false;
  }
  return true;
}

// عتبات المستويات (مجموع XP التراكمي المطلوب للوصول لكل مستوى)
const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];
const LEVEL_NAMES = [
  "قارئ مبتدئ 🌱",
  "قارئ مثابر 📖",
  "قارئ شغوف 🔥",
  "قارئ حكيم 🦉",
  "أستاذ القراءة 👑",
  "خبير القراءة 💎",
  "أسطورة القراءة 🏆",
  "حكيم النادي 🌟",
  "أيقونة النادي ✨",
  "أسطورة المنتدى 🏛️",
];
const STREAK_MILESTONES = [7, 14, 30, 60, 100];

// يحسب الـ XP والمستوى ديناميكيًا من بيانات المستخدم (بدون تخزين رقم متغير)
export function computeXP(entries, booksFinished, longestStreak) {
  const daysXP = new Set(entries.map((e) => e.date)).size * 10;
  const totalPages = entries.reduce((s, e) => s + (e.pages || 0), 0);
  const pagesXP = Math.floor(totalPages / 10) * 2;
  const notesXP = entries.filter((e) => e.note && e.note.trim()).length * 3;
  const booksXP = booksFinished * 50;
  const streakXP = STREAK_MILESTONES.filter((m) => longestStreak >= m).length * 30;

  const totalXP = daysXP + pagesXP + notesXP + booksXP + streakXP;

  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }

  const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? currentThreshold + 1000;
  const levelName = LEVEL_NAMES[level - 1] || `المستوى ${level}`;

  return {
    totalXP,
    level,
    levelName,
    currentThreshold,
    nextThreshold,
    progress: Math.min(1, (totalXP - currentThreshold) / (nextThreshold - currentThreshold)),
  };
}

// يحفظ اسم المستخدم و/أو optIn
export async function saveProfile(telegramId, { name, optIn }) {
  const { error } = await supabase
    .from("users")
    .update({ name, opt_in: optIn })
    .eq("telegram_id", telegramId);

  if (error) {
    debugAlert("خطأ بحفظ الملف الشخصي: " + error.message);
    return false;
  }
  return true;
}

// يجيب قائمة المتصدرين (المستخدمين اللي فعّلوا opt_in) مرتبة حسب السلسلة الحالية
export async function getLeaderboard() {
  const { data: users, error } = await supabase
    .from("users")
    .select("id, name")
    .eq("opt_in", true);

  if (error || !users || users.length === 0) return [];

  const results = [];
  for (const u of users) {
    const { data: logs } = await supabase
      .from("reading_logs")
      .select("entry_date")
      .eq("user_id", u.id);

    const dates = [...new Set((logs || []).map((l) => l.entry_date))].sort();
    let longest = 0,
      run = 0,
      current = 0;

    if (dates.length > 0) {
      longest = 1;
      run = 1;
      for (let i = 1; i < dates.length; i++) {
        const da = new Date(dates[i - 1] + "T00:00:00");
        const db = new Date(dates[i] + "T00:00:00");
        const diff = Math.round((db - da) / 86400000);
        if (diff === 1) run++;
        else run = 1;
        longest = Math.max(longest, run);
      }
      const last = dates[dates.length - 1];
      const today = new Date().toISOString().slice(0, 10);
      const diffFromToday = Math.round(
        (new Date(today + "T00:00:00") - new Date(last + "T00:00:00")) / 86400000
      );
      if (diffFromToday <= 1) {
        current = 1;
        for (let i = dates.length - 1; i > 0; i--) {
          const da = new Date(dates[i - 1] + "T00:00:00");
          const db = new Date(dates[i] + "T00:00:00");
          if (Math.round((db - da) / 86400000) === 1) current++;
          else break;
        }
      }
    }

    results.push({ name: u.name || "قارئ مجهول", current, longest, days: dates.length });
  }

  results.sort((a, b) => b.current - a.current || b.days - a.days);
  return results;
}

// يحفظ (أو يحدّث) قراءة اليوم لنفس المستخدم
export async function saveTodayEntry(telegramId, entry) {
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", telegramId)
    .single();

  if (!user) {
    debugAlert("لم يتم العثور على المستخدم لحفظ القراءة");
    return false;
  }

  const { error } = await supabase.from("reading_logs").upsert(
    {
      user_id: user.id,
      entry_date: entry.date,
      book: entry.book,
      pages: entry.pages,
      minutes: entry.minutes,
      note: entry.note,
    },
    { onConflict: "user_id,entry_date" }
  );

  if (error) {
    debugAlert("خطأ بحفظ القراءة: " + error.message);
    return false;
  }
  return true;
}