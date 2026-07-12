import { useState, useEffect, useMemo } from "react";
import { Star, BookOpen, Calendar, TrendingUp, Feather, Users, Check, X } from "lucide-react";
import { loadUserData, saveProfile, saveTodayEntry } from "./storage.js";
import logo from "./assets/logo.png";

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function dayDiff(a, b) {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db - da) / 86400000);
}

function calcStreaks(entries) {
  const days = [...new Set(entries.map((e) => e.date))].sort();
  if (days.length === 0) return { current: 0, longest: 0 };
  let longest = 1,
    run = 1;
  for (let i = 1; i < days.length; i++) {
    if (dayDiff(days[i - 1], days[i]) === 1) run++;
    else run = 1;
    longest = Math.max(longest, run);
  }
  const last = days[days.length - 1];
  const diffFromToday = dayDiff(last, todayKey());
  let current = 0;
  if (diffFromToday <= 1) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if (dayDiff(days[i - 1], days[i]) === 1) current++;
      else break;
    }
  }
  return { current, longest };
}

function getUserId() {
  const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return id ? String(id) : "guest";
}

function getTelegramName() {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return u ? [u.first_name, u.last_name].filter(Boolean).join(" ") : "";
}

export default function App() {
  const [userId] = useState(getUserId);
  const [name, setName] = useState("");
  const [entries, setEntries] = useState([]);
  const [optIn, setOptIn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("today");

  const [book, setBook] = useState("");
  const [pages, setPages] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
  (async () => {
    const telegramName = getTelegramName();
    const data = await loadUserData(userId, telegramName);
    setName(data.name);
    setEntries(data.entries);
    setOptIn(data.optIn);
    setLoaded(true);
  })();
}, [userId]);

  const streaks = useMemo(() => calcStreaks(entries), [entries]);
  const hasLoggedToday = entries.some((e) => e.date === todayKey());

  const thisMonthPages = useMemo(() => {
    const m = todayKey().slice(0, 7);
    return entries
      .filter((e) => e.date.startsWith(m))
      .reduce((s, e) => s + (Number(e.pages) || 0), 0);
  }, [entries]);

  const bookCount = useMemo(
    () => new Set(entries.map((e) => e.book.trim()).filter(Boolean)).size,
    [entries]
  );

  const grouped = useMemo(() => {
    const map = {};
    for (const e of [...entries].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      (map[e.date] ||= []).push(e);
    }
    return Object.entries(map);
  }, [entries]);

  async function submitToday(ev) {
    ev.preventDefault();
    setError("");
    if (!book.trim()) {
      setError("اكتب اسم الكتاب قبل التسجيل");
      return;
    }
    const entry = {
      id: `${todayKey()}-${Date.now()}`,
      date: todayKey(),
      book: book.trim(),
      pages: pages ? Number(pages) : 0,
      minutes: minutes ? Number(minutes) : 0,
      note: note.trim(),
    };
    const next = [...entries.filter((e) => e.date !== todayKey()), entry];
    setEntries(next);
    setBook("");
    setPages("");
    setMinutes("");
    setNote("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    await saveTodayEntry(userId, entry);
  }

  async function toggleOptIn() {
  const next = !optIn;
  setOptIn(next);
  await saveProfile(userId, { name, optIn: next });
}

async function saveName(v) {
  setName(v);
  await saveProfile(userId, { name: v, optIn });
}

  const navy = "#1B3A5C";
  const navyDark = "#132A44";
  const orange = "#E08D3C";
  const cream = "#FAF6EF";

  return (
    <div dir="rtl" style={{ background: cream, minHeight: "100vh", fontFamily: "Cairo, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        .text-center { text-align: center; }
        .amiri { font-family: 'Amiri', serif; }
        .card {
          position: relative;
          background: #FFFFFF;
          border: 1px solid #E7DFCF;
          border-right: 4px solid ${orange};
          box-shadow: 0 2px 10px rgba(27,58,92,0.06);
        }
        .star-pulse { animation: starpulse 2.4s ease-in-out infinite; }
        @keyframes starpulse { 0%,100%{opacity:1; transform:scale(1) rotate(0deg);} 50%{opacity:.8; transform:scale(1.1) rotate(8deg);} }
        .fade-in { animation: fadein .4s ease both; }
        @keyframes fadein { from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:translateY(0);} }
        input, textarea {
          background:#FFFFFF; border:1px solid #DCD2BC; color:${navyDark};
          font-family:'Cairo',sans-serif;
        }
        input::placeholder, textarea::placeholder { color:#A99B7E; }
        input:focus, textarea:focus { outline:none; border-color:${orange}; }
        @media (prefers-reduced-motion: reduce) {
          .star-pulse, .fade-in { animation: none; }
        }
      `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div
          className="text-center"
          style={{
            background: `linear-gradient(135deg, ${navy} 0%, ${navyDark} 100%)`,
            borderRadius: 14,
            padding: "20px 16px",
            marginBottom: 18,
            border: `2px solid ${orange}`,
          }}
        >
          <img src={logo} alt="شعار منتدى النص والقارئ" style={{ width: 72, height: 72, margin: "0 auto 8px", display: "block" }} />
          <div style={{ color: orange, fontSize: 12, letterSpacing: 2, fontWeight: 600 }}>منتدى النص والقارئ</div>
          <h1 className="amiri" style={{ color: "#FFFFFF", fontSize: 28, margin: "4px 0", fontWeight: 700 }}>
            سِجِلّ القراءة
          </h1>
          <div style={{ width: 50, height: 2, background: orange, margin: "8px auto", opacity: 0.8, borderRadius: 2 }} />
          {!loaded ? (
            <div style={{ color: "#C9D6E4", fontSize: 13 }}>...جارِ التحميل</div>
          ) : (
            <input
              value={name}
              onChange={(e) => saveName(e.target.value)}
              placeholder="اكتب اسمك"
              style={{
                textAlign: "center", borderRadius: 8, padding: "6px 10px", fontSize: 14, width: 180,
                background: "rgba(255,255,255,0.95)", border: "none", marginTop: 6,
              }}
            />
          )}
        </div>

        <div className="card fade-in" style={{ borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-around", marginBottom: 16 }}>
          <div className="text-center">
            <Star className="star-pulse" size={20} style={{ color: orange, margin: "0 auto 4px" }} fill={orange} />
            <div style={{ color: navy, fontWeight: 700, fontSize: 18 }}>{streaks.current}</div>
            <div style={{ color: "#8B8272", fontSize: 11 }}>سلسلة الأيام</div>
          </div>
          <div className="text-center">
            <TrendingUp size={20} style={{ color: navy, margin: "0 auto 4px" }} />
            <div style={{ color: navy, fontWeight: 700, fontSize: 18 }}>{streaks.longest}</div>
            <div style={{ color: "#8B8272", fontSize: 11 }}>أطول سلسلة</div>
          </div>
          <div className="text-center">
            <BookOpen size={20} style={{ color: navy, margin: "0 auto 4px" }} />
            <div style={{ color: navy, fontWeight: 700, fontSize: 18 }}>{bookCount}</div>
            <div style={{ color: "#8B8272", fontSize: 11 }}>كتب مسجّلة</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#FFFFFF", padding: 4, borderRadius: 10, border: "1px solid #E7DFCF" }}>
          {[
            ["today", "اليوم"],
            ["log", "السجل"],
            ["stats", "الإحصائيات"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 7, fontSize: 13, fontWeight: 600,
                border: "none", cursor: "pointer",
                background: tab === k ? orange : "transparent",
                color: tab === k ? "#FFFFFF" : navy,
                transition: "all .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "today" && (
          <div className="fade-in">
            {hasLoggedToday && !saved ? (
              <div className="card" style={{ borderRadius: 12, padding: 18, textAlign: "center" }}>
                <Check size={22} style={{ color: orange, marginBottom: 6 }} />
                <div style={{ color: navy, fontSize: 14, fontWeight: 600 }}>سجّلت قراءتك اليوم بالفعل</div>
                <div style={{ color: "#8B8272", fontSize: 12, marginTop: 4 }}>عد غداً لتستمر بالسلسلة🔥</div>
              </div>
            ) : (
              <form onSubmit={submitToday} className="card" style={{ borderRadius: 12, padding: 16 }}>
                <label style={{ color: navy, fontSize: 12, fontWeight: 600 }}>اسم الكتاب</label>
                <input
                  value={book}
                  onChange={(e) => setBook(e.target.value)}
                  placeholder="مثال: موسم الهجرة إلى الشمال"
                  style={{ width: "100%", borderRadius: 8, padding: "9px 10px", fontSize: 14, margin: "5px 0 12px" }}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: navy, fontSize: 12, fontWeight: 600 }}>عدد الصفحات</label>
                    <input
                      type="number" min="0"
                      value={pages}
                      onChange={(e) => setPages(e.target.value)}
                      placeholder="0"
                      style={{ width: "100%", borderRadius: 8, padding: "9px 10px", fontSize: 14, margin: "5px 0 12px" }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: navy, fontSize: 12, fontWeight: 600 }}>دقائق القراءة</label>
                    <input
                      type="number" min="0"
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                      placeholder="0"
                      style={{ width: "100%", borderRadius: 8, padding: "9px 10px", fontSize: 14, margin: "5px 0 12px" }}
                    />
                  </div>
                </div>
                <label style={{ color: navy, fontSize: 12, fontWeight: 600 }}>اقتباس أو ملاحظة (اختياري)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="جملة أثّرت فيك اليوم..."
                  style={{ width: "100%", borderRadius: 8, padding: "9px 10px", fontSize: 14, margin: "5px 0 14px", resize: "none" }}
                />
                {error && <div style={{ color: "#C0512E", fontSize: 12, marginBottom: 10 }}>{error}</div>}
                <button
                  type="submit"
                  style={{
                    width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
                    background: orange, color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  }}
                >
                  <Feather size={14} style={{ verticalAlign: "-2px", marginLeft: 6 }} />
                  سجّل قراءة اليوم
                </button>
              </form>
            )}
            {saved && (
              <div style={{ textAlign: "center", color: orange, fontSize: 13, marginTop: 10, fontWeight: 600 }}>
                تم التسجيل ✦ استمر بالسلسلة
              </div>
            )}

            {!hasLoggedToday && (
              <button
                onClick={toggleOptIn}
                style={{
                  width: "100%", marginTop: 14, padding: "10px 12px", borderRadius: 8,
                  background: optIn ? "#FDF1E3" : "transparent", border: `1px solid ${optIn ? orange : "#DCD2BC"}`,
                  color: optIn ? orange : "#8B8272", fontSize: 13, display: "flex",
                  alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontWeight: 600,
                }}
              >
                <Users size={14} />
                {optIn ? "أنت ظاهر في لوحة القرّاء المشتركة" : "أظهر تقدمي في لوحة القرّاء المشتركة"}
                {optIn && <X size={13} style={{ marginRight: 4 }} />}
              </button>
            )}
          </div>
        )}

        {tab === "log" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {grouped.length === 0 && (
              <div style={{ textAlign: "center", color: "#A99B7E", fontSize: 13, padding: "30px 0" }}>
                لم تُسجّل أي قراءة بعد — ابدأ اليوم
              </div>
            )}
            {grouped.map(([date, items]) => (
              <div key={date} className="card" style={{ borderRadius: 12, padding: 14 }}>
                <div style={{ color: orange, fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                  <Calendar size={13} />
                  {date}
                </div>
                {items.map((e) => (
                  <div key={e.id} style={{ marginBottom: 6 }}>
                    <div style={{ color: navy, fontSize: 14, fontWeight: 700 }}>{e.book}</div>
                    <div style={{ color: "#8B8272", fontSize: 12 }}>
                      {e.pages ? `${e.pages} صفحة` : ""} {e.minutes ? `· ${e.minutes} دقيقة` : ""}
                    </div>
                    {e.note && (
                      <div className="amiri" style={{ color: "#5C6B7A", fontSize: 13, marginTop: 3, fontStyle: "italic" }}>
                        «{e.note}»
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === "stats" && (
          <div className="fade-in card" style={{ borderRadius: 12, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #EEE6D6" }}>
              <span style={{ color: "#8B8272", fontSize: 13 }}>صفحات هذا الشهر</span>
              <span style={{ color: navy, fontSize: 14, fontWeight: 700 }}>{thisMonthPages}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #EEE6D6" }}>
              <span style={{ color: "#8B8272", fontSize: 13 }}>مجموع أيام التسجيل</span>
              <span style={{ color: navy, fontSize: 14, fontWeight: 700 }}>{new Set(entries.map((e) => e.date)).size}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #EEE6D6" }}>
              <span style={{ color: "#8B8272", fontSize: 13 }}>كتب مختلفة سُجّلت</span>
              <span style={{ color: navy, fontSize: 14, fontWeight: 700 }}>{bookCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
              <span style={{ color: "#8B8272", fontSize: 13 }}>أطول سلسلة قراءة</span>
              <span style={{ color: navy, fontSize: 14, fontWeight: 700 }}>{streaks.longest} يوم</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
