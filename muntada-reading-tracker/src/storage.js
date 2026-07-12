import { supabase } from "./supabaseClient.js";

function debugAlert(message) {
  const tg = window.Telegram?.WebApp;
  if (tg?.showAlert) {
    tg.showAlert(message);
  } else {
    console.error(message);
  }
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

// يجيب بيانات المستخدم كاملة (الاسم + optIn + كل سجلات القراءة)
export async function loadUserData(telegramId, fallbackName) {
  const user = await ensureUser(telegramId, fallbackName);
  if (!user) return { name: fallbackName || "", optIn: false, entries: [] };

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

  return { name: user.name || fallbackName || "", optIn: !!user.opt_in, entries };
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