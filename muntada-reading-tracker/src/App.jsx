import { useState, useEffect, useMemo, useRef } from "react";
import { Star, BookOpen, Calendar, TrendingUp, Feather, Users, Check, X, Bookmark, Award } from "lucide-react";
import { loadUserData, saveProfile, saveTodayEntry, getLeaderboard, finishBook, computeXP } from "./storage.js";
import html2canvas from "html2canvas";
import logo from "./assets/logo.png";

const BADGE_DEFINITIONS = [
  { id: 'avid_reader', title: 'قارئ نهم', icon: '📚', desc: 'أنهيت 5 كتب', check: (_, booksFinished) => booksFinished >= 5 },
  { id: 'streak_master', title: 'المثابر', icon: '🔥', desc: 'سلسلة 7 أيام', check: (_, __, longest) => longest >= 7 },
  { id: 'page_turner', title: 'حريف صفحات', icon: '📖', desc: 'قرأت 500 صفحة', check: (entries) => entries.reduce((s, e) => s + (Number(e.pages) || 0), 0) >= 500 },
];

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
  
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = dayDiff(days[i - 1], days[i]);
    if (diff === 1) {
      run++;
    } else if (diff > 1) {
      run = 1;
    }
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

function triggerHaptic(type = "light") {
  if (window.Telegram?.WebApp?.HapticFeedback) {
    if (type === "success" || type === "error" || type === "warning") {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
    } else {
      window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
    }
  }
}

export default function App() {
  const [userId] = useState(getUserId);
  const [name, setName] = useState("");
  const [entries, setEntries] = useState([]);
  const [optIn, setOptIn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("today");
  
  const statsCardRef = useRef(null);
  const [shareImage, setShareImage] = useState(null);
  const [sharing, setSharing] = useState(false);
const [finishingBook, setFinishingBook] = useState(false);
  // حقول الإدخال والتحكم المحدثة
  const [selectedBook, setSelectedBook] = useState(""); 
  const [author, setAuthor] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [isNewBook, setIsNewBook] = useState(false);
  const [isClubBook, setIsClubBook] = useState(true);
  const [pages, setPages] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  
  const [error, setError] = useState("");
  const [booksFinished, setBooksFinished] = useState(0);
  const [completedBooksList, setCompletedBooksList] = useState([]);
  const [finishedMsg, setFinishedMsg] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  
  useEffect(() => {
    (async () => {
      const telegramName = getTelegramName();
      const data = await loadUserData(userId, telegramName);
      setName(data.name);
      setEntries(data.entries || []);
      setOptIn(data.optIn || false);
      setBooksFinished(data.booksFinished || 0);
      setCompletedBooksList(data.completedBooksList || []);
      setLoaded(true);
      
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (tab === "leaderboard") {
      setLoadingLeaderboard(true);
      getLeaderboard().then((data) => {
        setLeaderboard(data || []);
        setLoadingLeaderboard(false);
      });
    }
  }, [tab]);

  const streaks = useMemo(() => calcStreaks(entries), [entries]);
  
  const xpInfo = useMemo(
    () => computeXP(entries, booksFinished, streaks.longest),
    [entries, booksFinished, streaks.longest]
  );

  const badges = useMemo(() => {
    return BADGE_DEFINITIONS.map(b => ({
      ...b,
      achieved: b.check(entries, booksFinished, streaks.longest)
    }));
  }, [entries, booksFinished, streaks.longest]);
  
  const hasLoggedToday = useMemo(() => entries.some((e) => e.date === todayKey()), [entries]);

  const thisMonthPages = useMemo(() => {
    const m = todayKey().slice(0, 7);
    return entries
      .filter((e) => e.date.startsWith(m))
      .reduce((s, e) => s + (Number(e.pages) || 0), 0);
  }, [entries]);

  const finishedTitles = useMemo(() => completedBooksList.map(b => b.book_title), [completedBooksList]);

  const activeBooks = useMemo(() => {
    const allBooks = [...new Set(entries.map((e) => e.book.trim()).filter(Boolean))];
    return allBooks.filter((book) => !finishedTitles.includes(book));
  }, [entries, finishedTitles]);

  const bookCount = useMemo(() => activeBooks.length, [activeBooks]);

  // التحقق هل الكتاب الحالي المحدد هو كتاب نادي
  const selectedIsClubBook = useMemo(() => {
    if (isNewBook) return isClubBook;
    if (!selectedBook) return false;
    const match = entries.find(e => e.book.trim() === selectedBook.trim());
    return match ? Boolean(match.isClubBook) : false;
  }, [isNewBook, isClubBook, selectedBook, entries]);

  const currentBookProgress = useMemo(() => {
    if (!selectedBook || isNewBook) return null;
    const bookEntries = entries.filter(e => e.book.trim() === selectedBook.trim());
    const totalRead = bookEntries.reduce((sum, e) => sum + (Number(e.pages) || 0), 0);
    const targetTotal = bookEntries[0]?.totalPages || 0;
    const percentage = targetTotal > 0 ? Math.min(100, Math.round((totalRead / targetTotal) * 100)) : 0;
    
    return { totalRead, targetTotal, percentage };
  }, [selectedBook, entries, isNewBook]);

  const grouped = useMemo(() => {
    const map = {};
    for (const e of [...entries].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      (map[e.date] ||= []).push(e);
    }
    return Object.entries(map);
  }, [entries]);

  useEffect(() => {
    if (activeBooks.length > 0 && !selectedBook && !isNewBook) {
      setSelectedBook(activeBooks[0]);
    } else if (activeBooks.length === 0) {
      setIsNewBook(true);
    }
  }, [activeBooks, selectedBook, isNewBook]);

  useEffect(() => {
    const mainBtn = window.Telegram?.WebApp?.MainButton;
    if (!mainBtn) return;

    const targetBook = selectedBook.trim();
    if (tab === "today" && !hasLoggedToday && targetBook && pages) {
      mainBtn.setText("✓ حِفْظُ قِرَاءَةِ اليَوْمِ");
      mainBtn.show();
      
      const handleMainBtnClick = () => {
        const fakeEvent = { preventDefault: () => {} };
        submitToday(fakeEvent);
      };
      
      mainBtn.onClick(handleMainBtnClick);
      return () => {
        mainBtn.offClick(handleMainBtnClick);
        mainBtn.hide();
      };
    } else {
      mainBtn.hide();
    }
  }, [tab, hasLoggedToday, selectedBook, pages, minutes, note]);

  async function submitToday(ev) {
    ev.preventDefault();
    setError("");
    
    const targetBook = selectedBook.trim();
    if (!targetBook) {
      triggerHaptic("error");
      setError("يرجى تحديد أو كتابة اسم الكتاب أولاً");
      return;
    }

    // 1. تحقق من عدد صفحات الكتاب الكلي عند إدخال كتاب جديد للنادي
    if (isNewBook && isClubBook) {
      if (!totalPages || Number(totalPages) <= 0) {
        triggerHaptic("error");
        setError("إدخال إجمالي صفحات الكتاب الكلي إجباري لكتب النادي الجديدة!");
        return;
      }
    }

    // 2. إلزامية أدخال عدد صفحات اليوم لقراءات النادي (سواء كتاب جديد أو سابق)
    if (selectedIsClubBook) {
      if (!pages || Number(pages) <= 0) {
        triggerHaptic("error");
        setError("عدد صفحات القراءة اليومية إجباري لقراءات النادي!");
        return;
      }
    }

    const entry = {
      id: `${todayKey()}-${Date.now()}`,
      date: todayKey(),
      book: targetBook,
      author: author.trim(),
      isClubBook: isNewBook ? isClubBook : selectedIsClubBook,
      totalPages: totalPages ? Number(totalPages) : 0,
      pages: pages ? Number(pages) : 0,
      minutes: minutes ? Number(minutes) : 0,
      note: note.trim(),
    };

    const otherEntries = entries.filter((e) => !(e.date === todayKey() && e.book.trim() === targetBook));
    const next = [...otherEntries, entry];
    setEntries(next);
    
    setPages("");
    setMinutes("");
    setNote("");
    if (isNewBook) {
      setIsNewBook(false);
      setAuthor("");
      setTotalPages("");
      setIsClubBook(true);
    }

    triggerHaptic("success");
    await saveTodayEntry(userId, entry);
  }

  async function handleFinishBook() {
  const targetBook = selectedBook.trim();
  if (!targetBook || finishingBook) return;

  setFinishingBook(true); // قفل الزر فوراً
  triggerHaptic("medium");
  
  const res = await finishBook(userId, targetBook);
  if (res.success) {
    setBooksFinished((prev) => prev + 1);
    setCompletedBooksList((prev) => [{ book_title: targetBook, author: author || "", created_at: new Date().toISOString() }, ...prev]);
    triggerHaptic("success");
    setFinishedMsg(res.message);
    setSelectedBook("");
    setTimeout(() => setFinishedMsg(""), 4000);
  } else {
    triggerHaptic("error");
    setFinishedMsg(`⚠️ ${res.message}`);
    setTimeout(() => setFinishedMsg(""), 4500);
  }
  setFinishingBook(false); // إعادة فتح الزر
}

  async function shareStats() {
    if (!statsCardRef.current) return;
    triggerHaptic("light");
    setSharing(true);

    const shareText = 
`📊 بطاقة إنجازاتي القرائية في منتدى النص والقارئ 📚✨

🌱 المستوى: ${xpInfo.levelName} (${xpInfo.totalXP} XP)
📑 صفحات هذا الشهر: ${thisMonthPages} صفحة
📅 مجموع الأيام: ${new Set(entries.map((e) => e.date)).size} يوم
📖 الكتب المكتملة: ${booksFinished} كتاب
🔥 أطول سلسلة قراءة: ${streaks.longest} يوم متتالي

انضم إلينا ووثق قراءتك اليومية عبر البوت الرسمي:
https://t.me/mtdreads_bot`;

    try {
      const canvas = await html2canvas(statsCardRef.current, {
        backgroundColor: "#FAF6EF",
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      const dataUrl = canvas.toDataURL("image/png");

      if (navigator.share && navigator.canShare) {
        try {
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          const file = new File([blob], "reading-stats.png", { type: "image/png" });

          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "إحصائياتي القرائية",
              text: shareText,
            });
            setSharing(false);
            return;
          }
        } catch (e) {}
      }

      setShareImage(dataUrl);
      setSharing(false);
    } catch (e) {
      executeTextShare(shareText);
      setSharing(false);
    }
  }

  function executeTextShare(text) {
    const tg = window.Telegram?.WebApp;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent("https://t.me/mtdreads_bot")}&text=${encodeURIComponent(text)}`;

    if (tg?.openLink) {
      tg.openLink(shareUrl);
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        alert("تم نسخ بطاقة إحصائياتك بنجاح! يمكنك لصقها ومشاركتها في أي مكان 🚀");
      });
    } else {
      window.open(shareUrl, "_blank");
    }
  }
  
  async function toggleOptIn() {
    triggerHaptic("light");
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
    <div dir="rtl" style={{ background: cream, minHeight: "100vh", fontFamily: "Cairo, sans-serif", userSelect: "none" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        .text-center { text-align: center; }
        .amiri { font-family: 'Amiri', serif; }
        .card {
          position: relative;
          background: #FFFFFF;
          border: 1px solid #E7DFCF;
          border-right: 4px solid ${orange};
          box-shadow: 0 4px 12px rgba(27,58,92,0.04);
        }
        .star-pulse { animation: starpulse 2.4s ease-in-out infinite; }
        @keyframes starpulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.1) rotate(5deg);} }
        .fade-in { animation: fadein .3s cubic-bezier(0.4, 0, 0.2, 1) both; }
        @keyframes fadein { from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:translateY(0);} }
        input, textarea, select {
          background:#FFFFFF; border:1px solid #DCD2BC; color:${navyDark};
          font-family:'Cairo',sans-serif; -webkit-appearance: none;
        }
        input:focus, textarea:focus, select:focus { outline:none; border-color:${orange}; box-shadow: 0 0 0 2px rgba(224,141,60,0.15); }
        .tab-btn { transition: all 0.2s ease; }
        .tab-btn:active { transform: scale(0.95); }
      `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 30px" }}>
        <div
          className="text-center"
          style={{
            background: `linear-gradient(135deg, ${navy} 0%, ${navyDark} 100%)`,
            borderRadius: 16,
            padding: "24px 16px",
            marginBottom: 20,
            border: `1.5px solid ${orange}`,
            boxShadow: "0 6px 16px rgba(19,42,68,0.15)",
          }}
        >
          <img src={logo} alt="شعار منتدى النص والقارئ" style={{ width: 76, height: 76, margin: "0 auto 10px", display: "block", borderRadius: "50%" }} />
          <div style={{ color: orange, fontSize: 13, letterSpacing: 1.5, fontWeight: 700 }}>منتدى النص والقارئ</div>
          <h1 className="amiri" style={{ color: "#FFFFFF", fontSize: 30, margin: "4px 0", fontWeight: 700 }}>
            سِجِلّ القراءة التفاعلي
          </h1>
          <div style={{ width: 60, height: 2, background: orange, margin: "10px auto", borderRadius: 2 }} />
          
          {!loaded ? (
            <div style={{ color: "#C9D6E4", fontSize: 13, marginTop: 10 }}>📊 جارِ تحميل سجلاتك الأدبية...</div>
          ) : (
            <input
              value={name}
              onChange={(e) => saveName(e.target.value)}
              placeholder="اكتب اسمك الكريم هنا"
              style={{
                textAlign: "center", borderRadius: 10, padding: "8px 12px", fontSize: 14, width: "85%",
                background: "rgba(255,255,255,0.96)", border: "none", marginTop: 8, fontWeight: 600
              }}
            />
          )}
        </div>

        <div className="card fade-in" style={{ borderRadius: 14, padding: "16px", display: "flex", justifyContent: "space-around", marginBottom: 18 }}>
          <div className="text-center" style={{ flex: 1 }}>
            <Star className="star-pulse" size={22} style={{ color: orange, margin: "0 auto 4px" }} fill={orange} />
            <div style={{ color: navy, fontWeight: 800, fontSize: 20 }}>{streaks.current}</div>
            <div style={{ color: "#8B8272", fontSize: 12, fontWeight: 500 }}>سلسلة الأيام</div>
          </div>
          <div style={{ width: 1, background: "#E7DFCF", margin: "6px 0" }} />
          <div className="text-center" style={{ flex: 1 }}>
            <TrendingUp size={22} style={{ color: navy, margin: "0 auto 4px" }} />
            <div style={{ color: navy, fontWeight: 800, fontSize: 20 }}>{streaks.longest}</div>
            <div style={{ color: "#8B8272", fontSize: 12, fontWeight: 500 }}>أطول سلسلة</div>
          </div>
          <div style={{ width: 1, background: "#E7DFCF", margin: "6px 0" }} />
          <div className="text-center" style={{ flex: 1 }}>
            <BookOpen size={22} style={{ color: navy, margin: "0 auto 4px" }} />
            <div style={{ color: navy, fontWeight: 800, fontSize: 20 }}>{bookCount}</div>
            <div style={{ color: "#8B8272", fontSize: 12, fontWeight: 500 }}>كتب نشطة</div>
          </div>
        </div>

        {/* التبويبات المحدثة الشاملة للأرشيف */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18, background: "#FFFFFF", padding: 4, borderRadius: 12, border: "1px solid #E7DFCF" }}>
          {[
            ["today", "اليوم"],
            ["log", "السجل الأدبي"],
            ["archive", "الأرشيف 📚"],
            ["stats", "الإحصائيات"],
            ["leaderboard", "المتصدرين"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => { triggerHaptic("light"); setTab(k); }}
              className="tab-btn"
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "none", cursor: "pointer",
                background: tab === k ? orange : "transparent",
                color: tab === k ? "#FFFFFF" : navy,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* --- 1. تبويب اليوم --- */}
        {tab === "today" && (
          <div className="fade-in">
            {hasLoggedToday && (
              <div className="card" style={{ borderRadius: 14, padding: 16, marginBottom: 16, background: "#FFFBF5" }}>
                <div style={{ color: orange, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Check size={16} /> الكتب التي سجّلت قراءتها اليوم حتى الآن:
                </div>
                {entries.filter(e => e.date === todayKey()).map((e, idx) => (
                  <div key={idx} style={{ color: navy, fontSize: 14, fontWeight: 600, padding: "4px 0" }}>
                    • {e.book} ({e.pages} صفحة · {e.minutes} دقيقة)
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={submitToday} className="card" style={{ borderRadius: 14, padding: 18 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ color: navy, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                    <Bookmark size={14} style={{ color: orange }} /> اسم الكتاب المراد تسجيله
                  </label>

                  {/* إظهار الخيار دائماً لو توفرت كتب سابقة */}
                  {activeBooks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("light");
                        setIsNewBook(!isNewBook);
                        if (isNewBook) {
                          setSelectedBook(activeBooks[0] || "");
                        } else {
                          setSelectedBook("");
                        }
                      }}
                      style={{ background: "transparent", border: "none", color: orange, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      {isNewBook ? "اختر من كتبك السابقة" : "＋ كتاب جديد"}
                    </button>
                  )}
                </div>

                {/* إعدادات الكتاب الجديد تظهر فقط عند اختيار "+ كتاب جديد" */}
                {isNewBook || activeBooks.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                    {/* اختيار نوع الكتاب الجديد */}
                    <div style={{ display: "flex", gap: 8, background: "#FFFBF5", padding: 4, borderRadius: 10, border: "1px solid #E7DFCF" }}>
                      <button
                        type="button"
                        onClick={() => { triggerHaptic("light"); setIsClubBook(true); }}
                        style={{
                          flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                          background: isClubBook ? orange : "transparent",
                          color: isClubBook ? "#FFFFFF" : navy,
                        }}
                      >
                        🏛️ من قراءات النادي
                      </button>
                      <button
                        type="button"
                        onClick={() => { triggerHaptic("light"); setIsClubBook(false); }}
                        style={{
                          flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                          background: !isClubBook ? navy : "transparent",
                          color: !isClubBook ? "#FFFFFF" : navy,
                        }}
                      >
                        📖 قراءة حرة
                      </button>
                    </div>

                    <input
                      value={selectedBook}
                      onChange={(e) => setSelectedBook(e.target.value)}
                      placeholder="اسم الكتاب"
                      style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontSize: 14 }}
                    />
                    <input
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="اسم المؤلف (اختياري)"
                      style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontSize: 14 }}
                    />
                    <div>
                      <label style={{ color: navy, fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4 }}>
                        إجمالي صفحات الكتاب {isClubBook ? <span style={{ color: "red" }}>(إجباري لقراءات النادي *)</span> : "(اختياري للقراءة الحرة)"}
                      </label>
                      <input
                        type="number" min="1" inputMode="numeric"
                        value={totalPages}
                        onChange={(e) => setTotalPages(e.target.value)}
                        placeholder="مثال: 250"
                        style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontSize: 14 }}
                      />
                    </div>
                  </div>
                ) : (
                  /* القائمة المنسدلة للكتب النشطة السابقة */
                  <div style={{ position: "relative" }}>
                    <select
                      value={selectedBook}
                      onChange={(e) => setSelectedBook(e.target.value)}
                      style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontSize: 14, paddingLeft: 30 }}
                    >
                      {activeBooks.map((b, idx) => (
                        <option key={idx} value={b}>{b}</option>
                      ))}
                    </select>
                    <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8B8272", pointerEvents: "none", fontSize: 10 }}>▼</div>
                  </div>
                )}
              </div>

              {/* شريط التقدم ونسبة الإنجاز */}
              {currentBookProgress && currentBookProgress.targetTotal > 0 && (
                <div style={{ background: "#FFFBF5", border: "1px solid #E7DFCF", borderRadius: 10, padding: 10, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: navy, marginBottom: 4 }}>
                    <span>تقدمك في الكتاب: {currentBookProgress.totalRead} / {currentBookProgress.targetTotal} صفحة</span>
                    <span style={{ color: orange }}>{currentBookProgress.percentage}%</span>
                  </div>
                  <div style={{ background: "#EEE6D6", borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${currentBookProgress.percentage}%`, background: orange, height: "100%", transition: "width 0.3s" }} />
                  </div>
                </div>
              )}

              {/* الإدخال اليومي المستمر */}
              <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: navy, fontSize: 13, fontWeight: 700 }}>
                    عدد صفحات اليوم {selectedIsClubBook && <span style={{ color: "red" }}>*</span>}
                  </label>
                  <input
                    type="number" min="0" inputMode="numeric"
                    value={pages}
                    onChange={(e) => setPages(e.target.value)}
                    placeholder="كم صفحة اليوم؟"
                    style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontSize: 14, marginTop: 6 }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: navy, fontSize: 13, fontWeight: 700 }}>دقائق القراءة</label>
                  <input
                    type="number" min="0" inputMode="numeric"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    placeholder="الوقت بالدقائق"
                    style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontSize: 14, marginTop: 6 }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ color: navy, fontSize: 13, fontWeight: 700 }}>اقتباس أو ملحوظة نقدية (اختياري)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="جملة لامست فكرك وقاربت وجدانك اليوم..."
                  style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontSize: 14, marginTop: 6, resize: "none" }}
                />
              </div>

              {error && <div style={{ color: "#C0512E", fontSize: 13, marginBottom: 12, fontWeight: 600 }}>⚠️ {error}</div>}
              
              <button
                type="submit"
                style={{
                  width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
                  background: orange, color: "#FFFFFF", fontWeight: 700, fontSize: 15, cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(224,141,60,0.2)"
                }}
              >
                <Feather size={16} style={{ verticalAlign: "-3px", marginLeft: 6 }} />
                {hasLoggedToday ? "سجّل كتاباً آخر لليوم 📚" : "سجّل قراءة اليوم بالتطبيق"}
              </button>

              {!isNewBook && activeBooks.length > 0 && (
                <button
  type="button"
  disabled={finishingBook}
  onClick={handleFinishBook}
  style={{
    width: "100%", padding: "11px 0", borderRadius: 10, border: `1.5px solid ${orange}`,
    background: finishingBook ? "#E7DFCF" : "transparent", color: orange, fontWeight: 700, fontSize: 14, cursor: "pointer",
    marginTop: 10, opacity: finishingBook ? 0.6 : 1
  }}
>
  {finishingBook ? "⏳ جارِ الحفظ..." : "🎉 أتممت قراءة هذا الكتاب بالكامل (+50 XP)"}
</button>
              )}
            </form>

            {finishedMsg && (
              <div className="fade-in" style={{ textAlign: "center", color: orange, fontSize: 13, marginTop: 14, fontWeight: 700, background: "#FFFFFF", padding: "10px 12px", borderRadius: 10, border: `1px dashed ${orange}` }}>
                {finishedMsg}
              </div>
            )}

            <button
              onClick={toggleOptIn}
              style={{
                width: "100%", marginTop: 14, padding: "12px 14px", borderRadius: 10,
                background: optIn ? "#FDF1E3" : "#FFFFFF", border: `1px solid ${optIn ? orange : "#DCD2BC"}`,
                color: optIn ? orange : "#8B8272", fontSize: 13, display: "flex",
                alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontWeight: 700,
              }}
            >
              <Users size={16} />
              {optIn ? "أنت تظهر الآن علناً في لوحة متصدري المنتدى" : "إظهار الهوية والتقدم في لوحة المتصدرين العامة"}
              {optIn && <X size={14} style={{ marginRight: "auto" }} />}
            </button>
          </div>
        )}

        {/* --- 2. تبويب السجل التاريخي --- */}
        {tab === "log" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {grouped.length === 0 && (
              <div style={{ textAlign: "center", color: "#A99B7E", fontSize: 14, padding: "40px 0" }}>
                📜 لم تسجل أي معالم قراءة بعد، ابدأ بترك خطوتك الأولى اليوم!
              </div>
            )}
            {grouped.map(([date, items]) => (
              <div key={date} className="card" style={{ borderRadius: 14, padding: 16 }}>
                <div style={{ color: orange, fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                  <Calendar size={14} />
                  {date}
                </div>
                {items.map((e, index) => (
                  <div key={e.id} style={{ marginBottom: index !== items.length - 1 ? 12 : 0, borderBottom: index !== items.length - 1 ? "1px solid #F4EFE6" : "none", paddingBottom: index !== items.length - 1 ? 10 : 0 }}>
                    <div style={{ color: navy, fontSize: 15, fontWeight: 700 }}>
                      {e.book} {e.author && <span style={{ fontSize: 12, color: "#8B8272", fontWeight: 500 }}>— لـ {e.author}</span>}
                    </div>
                    <div style={{ color: "#8B8272", fontSize: 13, marginTop: 2, fontWeight: 500 }}>
                      {e.pages ? `📑 سَجّلَ ${e.pages} صفحة` : ""} {e.minutes ? ` · ⏱️ استغرق ${e.minutes} دقيقة` : ""}
                    </div>
                    {e.note && (
                      <div className="amiri" style={{ color: "#4A5568", fontSize: 14, marginTop: 6, paddingRight: 8, borderRight: "2px solid #EEE6D6", fontStyle: "italic" }}>
                        « {e.note} »
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* --- 3. تبويب أرشيف الكتب المكتملة --- */}
        {tab === "archive" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {completedBooksList.length === 0 ? (
              <div style={{ textAlign: "center", color: "#A99B7E", fontSize: 14, padding: "40px 0" }}>
                🏆 لم تضف أي كتاب للأرشيف بعد، اقطع رحلة قراءتك وأتمم كتابك الأول!
              </div>
            ) : (
              completedBooksList.map((item, idx) => (
                <div key={idx} className="card" style={{ borderRadius: 14, padding: 16, borderRight: `4px solid ${orange}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: orange, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
                    <Check size={16} /> كتاب مكتمل (+50 XP)
                  </div>
                  <div style={{ color: navy, fontSize: 16, fontWeight: 800 }}>{item.book_title}</div>
                  {item.author && <div style={{ color: "#8B8272", fontSize: 13, marginTop: 2 }}>المؤلف: {item.author}</div>}
                  {item.created_at && (
                    <div style={{ color: "#A99B7E", fontSize: 11, marginTop: 8 }}>
                      تاريخ الإتمام: {new Date(item.created_at).toISOString().slice(0, 10)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* --- 4. تبويب الإحصائيات والأوسمة --- */}
        {tab === "stats" && (
          <>
            <div ref={statsCardRef} style={{ background: cream, padding: "8px 4px 4px" }}>
              <div style={{ marginBottom: 18, textAlign: "center", background: "#FFFFFF", padding: 16, borderRadius: 14, border: "1px solid #E7DFCF" }}>
                <div style={{ color: navy, fontWeight: 800, fontSize: 17 }}>
                  المستوى {xpInfo.level} — <span style={{ color: orange }}>{xpInfo.levelName}</span>
                </div>
                <div style={{ color: "#8B8272", fontSize: 13, margin: "4px 0 10px", fontWeight: 600 }}>
                  {xpInfo.totalXP} نقطة خبرة (XP)
                </div>
                <div style={{ background: "#EEE6D6", borderRadius: 8, height: 10, overflow: "hidden", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div
                    style={{
                      width: `${Math.min(xpInfo.progress * 100, 100)}%`,
                      background: `linear-gradient(90deg, ${orange} 0%, #F5A65B 100%)`,
                      height: "100%",
                      transition: "width .4s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  />
                </div>
                <div style={{ color: "#A99B7E", fontSize: 12, marginTop: 6, fontWeight: 500 }}>
                  {xpInfo.nextThreshold - xpInfo.totalXP > 0
                    ? `متبقي ${xpInfo.nextThreshold - xpInfo.totalXP} XP للمستوى التالي الأدبي`
                    : "تبوأت أعلى رتب المجد القراءاتي حالياً! 🏆"}
                </div>
              </div>

              <div className="fade-in card" style={{ borderRadius: 14, padding: 16 }}>
                {[
                  ["صفحات هذا الشهر", `${thisMonthPages} صفحة`],
                  ["مجموع أيام المطالعة", `${new Set(entries.map((e) => e.date)).size} يوم`],
                  ["كتب نشطة قيد القراءة", `${bookCount} كتاب`],
                  ["رصيد الكتب المنتهية", `${booksFinished} كتاب مكتمل`],
                  ["أطول سلسلة قراءة مستمرة", `${streaks.longest} يوم متتالي`],
                ].map(([lbl, val], idx, arr) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: idx !== arr.length - 1 ? "1px solid #EEE6D6" : "none" }}>
                    <span style={{ color: "#8B8272", fontSize: 14, fontWeight: 500 }}>{lbl}</span>
                    <span style={{ color: navy, fontSize: 15, fontWeight: 700 }}>{val}</span>
                  </div>
                ))}
                
                <div style={{ marginTop: 24 }}>
                  <div style={{ color: navy, fontWeight: 700, fontSize: 16, marginBottom: 12 }}>أوسمة الإنجاز 🏅</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {badges.map(b => (
                      <div key={b.id} style={{ 
                        background: b.achieved ? "#FFFBF5" : "#F4F4F4", 
                        border: `1px solid ${b.achieved ? orange : "#E7DFCF"}`,
                        borderRadius: 12, padding: '12px 6px', textAlign: 'center',
                        opacity: b.achieved ? 1 : 0.5,
                        transition: "all 0.3s"
                      }}>
                        <div style={{ fontSize: 24, marginBottom: 4 }}>{b.icon}</div>
                        <div style={{ color: navy, fontSize: 11, fontWeight: 700 }}>{b.title}</div>
                        <div style={{ color: "#8B8272", fontSize: 9 }}>{b.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            <button
              onClick={shareStats}
              disabled={sharing}
              style={{
                width: "100%", marginTop: 14, padding: "12px 0", borderRadius: 10,
                background: navy, color: "#FFFFFF", fontWeight: 700, fontSize: 14,
                border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(27,58,92,0.15)"
              }}
            >
              {sharing ? "⏳ جارِ حياكة بطاقتك..." : "📤 مشاركة بطاقة إحصائياتي للأصدقاء"}
            </button>
          </>
        )}

        {/* --- 5. تبويب المتصدرين --- */}
        {tab === "leaderboard" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loadingLeaderboard ? (
              <div style={{ textAlign: "center", color: "#A99B7E", fontSize: 14, padding: "40px 0" }}>
                ⏳ جارِ تنسيق مراكز الرواد...
              </div>
            ) : leaderboard.length === 0 ? (
              <div style={{ textAlign: "center", color: "#A99B7E", fontSize: 14, padding: "40px 0" }}>
                🛡️ لا يوجد قراء مشاركون بلوحة الصدارة حالياً، كن أول المبادرين!
              </div>
            ) : (
              leaderboard.map((r, i) => {
                const isTopThree = i < 3;
                const medals = ["🏆", "🥈", "🥉"];
                return (
                  <div
                    key={i}
                    className="card"
                    style={{
                      borderRadius: 14, padding: "14px 16px", display: "flex",
                      alignItems: "center", justifyContent: "space-between",
                      borderRight: isTopThree ? `4px solid ${orange}` : "4px solid #E7DFCF",
                      background: r.id === userId ? "#FFFBF5" : "#FFFFFF"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, minWidth: 24, color: isTopThree ? orange : "#8B8272" }}>
                        {isTopThree ? medals[i] : `${i + 1}`}
                      </div>
                      <div style={{ color: navy, fontWeight: 700, fontSize: 14 }}>
                        {r.name} {r.id === userId && <span style={{ fontSize: 11, color: orange, fontWeight: 500 }}>(أنت)</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 13, color: "#8B8272", fontWeight: 600 }}>
                      <span>🔥 {r.current} يوم</span>
                      <span>📅 {r.days} يوم قراءة</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {shareImage && (
        <div
          onClick={() => setShareImage(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(19,42,68,0.95)", zIndex: 9999,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div style={{ color: "#FFFFFF", fontSize: 14, marginBottom: 12, textAlign: "center", fontWeight: 600, lineHeight: 1.6 }}>
            ✨ تم إنشاء بطاقتك بنجاح!
            <br />
            <span style={{ fontSize: 12, color: orange, fontWeight: 700 }}>اضغط مطوّلاً على الصورة لحفظها</span>
          </div>

          <img
            src={shareImage}
            alt="بطاقة إحصائيات منتدى النص والقارئ"
            style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 16, width: "100%", maxWidth: 320 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("medium");
                const text = `📊 **بطاقة إنجازاتي القرائية في منتدى النص والقارئ** 📚✨\n\n🌱 **المستوى:** ${xpInfo.levelName} (${xpInfo.totalXP} XP)\n📑 **صفحات هذا الشهر:** ${thisMonthPages} صفحة\n🔥 **أطول سلسلة:** ${streaks.longest} يوم\n\nانضم إلينا عبر البوت:\nhttps://t.me/mtdreads_bot`;
                executeTextShare(text);
              }}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 8, background: orange,
                color: "#FFFFFF", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 13
              }}
            >
              🚀 إرسال للتليجرام
            </button>

            <button
              type="button"
              onClick={() => { triggerHaptic("light"); setShareImage(null); }}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 8, background: "rgba(255,255,255,0.15)",
                color: "#FFFFFF", fontWeight: 700, border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 13
              }}
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}