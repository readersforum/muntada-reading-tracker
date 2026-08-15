import { supabase } from "./supabaseClient.js";

function debugAlert(message) {
  console.error(message);
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

// يجيب بيانات المستخدم كاملة + سجل القراءات والكتب المنتهية للأرشيف
export async function loadUserData(telegramId, telegramName) {
  try {
    const rawId = String(telegramId);
    const numId = Number(telegramId) || 0;

    // 1. جلب بيانات المستخدم
    let { data: user } = await supabase
      .from("users")
      .select("*")
      .or(`telegram_id.eq.${numId},telegram_id.eq.${rawId}`)
      .maybeSingle();

    const uuid = user?.id;

    // 2. جلب سجلات القراءة (reading_logs) بالـ UUID أو بالـ telegram_id
    let logsQuery = supabase.from("reading_logs").select("*");
    if (uuid) {
      logsQuery = logsQuery.or(`user_id.eq.${uuid},user_id.eq.${rawId}`);
    } else {
      logsQuery = logsQuery.eq("user_id", rawId);
    }
    const { data: logsData } = await logsQuery;

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

    // 3. 💡 جلب الأرشيف (book_completions) بالـ UUID وبالـ telegram_id معاً
    let compQuery = supabase.from("book_completions").select("*");
    if (uuid) {
      compQuery = compQuery.or(`user_id.eq.${uuid},user_id.eq.${rawId}`);
    } else {
      compQuery = compQuery.eq("user_id", rawId);
    }
    const { data: completionsData } = await compQuery.order("created_at", { ascending: false });

    const completedList = (completionsData || []).map(c => ({
      id: c.id,
      book_title: c.book_title || c.book || "",
      author: c.author || "",
      created_at: c.created_at
    }));

    return {
      name: user?.name || telegramName || "",
      optIn: Boolean(user?.opt_in),
      entries: formattedEntries,
      booksFinished: completedList.length,
      completedBooksList: completedList
    };
  } catch (err) {
    console.error("خطأ loadUserData:", err);
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
  try {
    const rawId = String(telegramId);
    const numId = Number(telegramId) || 0;
    const cleanTitle = (bookTitle || "").trim();

    // 1. جلب المستخدم بمرونة (يدعم String و Number)
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id")
      .or(`telegram_id.eq.${numId},telegram_id.eq.${rawId}`)
      .maybeSingle();

    if (userErr || !user) {
      return { success: false, message: "لم يتم العثور على المستخدم المسجل!" };
    }

    // 2. جلب جميع قراءات هذا الكتاب للمستخدم
    const { data: logs, error: logsErr } = await supabase
      .from("reading_logs")
      .select("*")
      .eq("user_id", user.id);

    // فلترة السجلات الخاصة بهذا الكتاب تحديداً
    const bookLogs = (logs || []).filter(
      (l) => (l.book || l.book_title || "").trim().toLowerCase() === cleanTitle.toLowerCase()
    );

    if (bookLogs.length === 0) {
      return { success: false, message: "لا تملك سجلات قراءة مسجلة لهذا الكتاب!" };
    }

    // 3. حساب إجمالي الصفحات المسجلة
    const totalReadPages = bookLogs.reduce((sum, log) => sum + Number(log.pages || log.page_count || 0), 0);
    const targetTotalPages = Number(bookLogs[0]?.total_pages || bookLogs[0]?.totalPages || 0);
    const author = bookLogs[0]?.author || "";

    // 4. التحقق من شرط اكتمال الصفحات الكلية
    if (targetTotalPages > 0 && totalReadPages < targetTotalPages) {
      const remaining = targetTotalPages - totalReadPages;
      return { 
        success: false, 
        message: `لا يمكنك إتمام الكتاب بعد! المتبقي لك ${remaining} صفحة للوصول إلى ${targetTotalPages} صفحة.` 
      };
    }

    // 5. تسجيل الإتمام في جدول book_completions
    const { error: insertErr } = await supabase
      .from("book_completions")
      .insert([{ 
        user_id: user.id, 
        book_title: cleanTitle,
        author: author,
        total_pages: targetTotalPages
      }]);

    if (insertErr) {
      if (insertErr.code === '23505' || (insertErr.message && insertErr.message.includes('unique_user_book_completion'))) {
        return { 
          success: false, 
          message: "هذا الكتاب مضاف للأرشيف ومكتمل مسبقاً! 📚" 
        };
      }
      console.error("خطأ إدراج الأرشيف:", insertErr);
      return { success: false, message: "حدث خطأ أثناء حفظ إنهاء الكتاب في قاعدة البيانات" };
    }

    return { success: true, message: "تم نقل الكتاب لأرشيف المكتملات بنجاح! 🎉" };
  } catch (err) {
    console.error("finishBook Exception:", err);
    return { success: false, message: "تعذر الاتصال بقاعدة البيانات" };
  }
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
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", telegramId)
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