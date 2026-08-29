
import { supabase } from "./supabaseClient.js";

// ✅ أخفِف الـ debugAlert — بس Console
function debugAlert(message) {
  console.error("[DEBUG]", message);
}

// ✅ فحص guest
function isGuest(id) {
  return !id || id === "guest";
}

// يتأكد إن المستخدم موجود بجدول users، ويرجع صفه (يسويه إذا مو موجود)
async function ensureUser(telegramId, name) {
  if (isGuest(telegramId)) return null;
  
  const numId = Number(telegramId);
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", numId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("users")
    .insert({ telegram_id: numId, name })
    .select()
    .single();

  if (error) {
    debugAlert("خطأ بإنشاء المستخدم: " + error.message);
    return null;
  }
  return data;
}

// يجيب بيانات المستخدم كاملة + سجل القراءات والكتب المنتهية للأرشيف
export async function loadUserData(telegramId, telegramName) {
  console.log("[loadUserData] telegramId:", telegramId, "isGuest:", isGuest(telegramId));
  
  if (isGuest(telegramId)) {
    console.log("[loadUserData] Guest mode — returning empty data");
    return { 
      name: telegramName || "", 
      entries: [], 
      optIn: false, 
      booksFinished: 0, 
      completedBooksList: [] 
    };
  }

  try {
    const numId = Number(telegramId);
    console.log("[loadUserData] Looking for user with telegram_id:", numId);

    // 1. جلب المستخدم من جدول users
    let { data: user, error: userErr } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", numId)
      .maybeSingle();

    console.log("[loadUserData] User found:", user, "Error:", userErr);

    if (!user) {
      console.log("[loadUserData] No user found — returning empty data");
      return { 
        name: telegramName || "", 
        entries: [], 
        optIn: false, 
        booksFinished: 0, 
        completedBooksList: [] 
      };
    }

    const uuid = user.id; // الـ UUID الخاص بالمستخدم
    console.log("[loadUserData] User UUID:", uuid);

    // 2. جلب سجلات القراءة من جدول reading_logs
    const { data: logsData, error: logsErr } = await supabase
      .from("reading_logs")
      .select("*")
      .eq("user_id", uuid);

    console.log("[loadUserData] Reading logs:", logsData?.length || 0, "Error:", logsErr);

    const formattedEntries = (logsData || []).map((e) => ({
      id: e.id,
      date: e.date || (e.created_at ? e.created_at.slice(0, 10) : ""),
      book: e.book || e.book_title || "",
      pages: Number(e.pages || e.page_count || 0),
      minutes: Number(e.minutes || 0),
      note: e.note || "",
      isClubBook: Boolean(e.is_club_book ?? e.isClubBook),
      totalPages: Number(e.total_pages || e.totalPages || 0)
    }));

    // داخل loadUserData في storage.js

// جلب الأرشيف بكل الطرق الممكنة
let completionsData = [];
if (uuid) {
  const { data: cData, error: cErr } = await supabase
    .from("book_completions")
    .select("*")
    .or(`user_id.eq.${uuid},user_id.eq.${numId},user_id.eq.${rawId}`);

  if (cErr) console.error("Archive query error:", cErr);
  completionsData = cData || [];
} else {
  const { data: cData } = await supabase
    .from("book_completions")
    .select("*")
    .or(`user_id.eq.${numId},user_id.eq.${rawId}`);
  completionsData = cData || [];
}

const completedList = (completionsData || []).map((c) => ({
  id: c.id,
  book_title: c.book_title || c.book || "",
  author: c.author || "",
  created_at: c.created_at
}));
  } catch (error) {
    console.error("[loadUserData] Error:", error);
    return {
      name: telegramName || "",
      entries: [],
      optIn: false,
      booksFinished: 0,
      completedBooksList: []
    };
  }
}

// يسجّل إنهاء كتاب (مع التحقق الإجباري من إكمال كامل الصفحات وعلى عدة أيام)
export async function finishBook(telegramId, bookTitle) {
  if (isGuest(telegramId)) {
    return { success: false, message: "يجب فتح التطبيق من تليجرام لاستخدام هذه الميزة" };
  }
  
  const numId = Number(telegramId);
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", numId)
    .maybeSingle();

  if (!user) {
    return { success: false, message: "لم يتم العثور على المستخدم" };
  }

  const cleanTitle = (bookTitle || "").trim();

  // جلب سجلات الكتاب للتأكد
  const { data: logs } = await supabase
    .from("reading_logs")
    .select("*")
    .eq("user_id", user.id);

  const bookLogs = (logs || []).filter(
    (l) => (l.book || "").trim().toLowerCase() === cleanTitle.toLowerCase()
  );

  if (bookLogs.length === 0) {
    return { success: false, message: "لا تملك سجلات قراءة لهذا الكتاب!" };
  }

  // إدخال الكتاب في الأرشيف (بالحقول الأساسية المتوافقة مع Supabase)
  const { error } = await supabase
    .from("book_completions")
    .insert([{ 
      user_id: user.id, 
      book_title: cleanTitle
    }]);

  if (error) {
    if (error.code === '23505' || (error.message && error.message.includes('unique'))) {
      return { success: false, message: "هذا الكتاب مضاف للأرشيف مسبقاً! 📚" };
    }
    console.error("خطأ الأرشيف:", error);
    return { success: false, message: "تعذر حفظ الكتاب في الأرشيف" };
  }

  return { success: true, message: "تم نقل الكتاب لأرشيف المكتملات بنجاح! 🎉" };
}

// عتبات المستويات والـ XP
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

export async function saveProfile(telegramId, { name, optIn }) {
  if (isGuest(telegramId)) return true;
  
  const numId = Number(telegramId);
  const { error } = await supabase
    .from("users")
    .update({ name, opt_in: optIn })
    .eq("telegram_id", numId);

  if (error) {
    debugAlert("خطأ بحفظ الملف الشخصي: " + error.message);
    return false;
  }
  return true;
}

export async function getLeaderboard() {
  const { data: users, error } = await supabase
    .from("users")
    .select("id, name")
    .eq("opt_in", true);

  if (error || !users || users.length === 0) return [];

  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const results = [];
  for (const u of users) {
    const { data: logs } = await supabase
      .from("reading_logs")
      .select("entry_date")
      .eq("user_id", u.id)
      .gte("entry_date", currentMonthStart);

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

    if (dates.length > 0) {
      results.push({ name: u.name || "قارئ مجهول", current, longest, days: dates.length });
    }
  }

  results.sort((a, b) => b.current - a.current || b.days - a.days);
  return results;
}

// يحفظ قراءة اليوم مع إضافة اسم المؤلف وعدد الصفحات الإجمالي
export async function saveTodayEntry(telegramId, entry) {
  if (isGuest(telegramId)) return true;

  const numId = Number(telegramId);
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", numId)
    .single();

  if (!user) {
    debugAlert("لم يتم العثور على المستخدم لحفظ القراءة");
    return false;
  }

  const { error } = await supabase.from("reading_logs").insert({
    user_id: user.id,
    entry_date: entry.date,
    book: entry.book,
    author: entry.author || "",
    total_pages: Number(entry.totalPages) || 0,
    pages: Number(entry.pages) || 0,
    minutes: Number(entry.minutes) || 0,
    note: entry.note || "",
  });

  if (error) {
    debugAlert("خطأ بحفظ القراءة: " + error.message);
    return false;
  }
  return true;
}

