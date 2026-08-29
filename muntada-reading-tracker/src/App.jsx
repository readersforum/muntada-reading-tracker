
import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Star, BookOpen, Calendar, TrendingUp, Feather, Users, Check, X, Bookmark, Award,
  Trophy, Flame, Clock, FileText, ChevronDown, Share2, Medal, Lock, Sparkles,
  Library, BarChart3, Zap, Loader2, ScrollText
} from "lucide-react";
import { loadUserData, saveProfile, saveTodayEntry, getLeaderboard, finishBook, computeXP } from "./storage.js";
import html2canvas from "html2canvas";
import logo from "./assets/logo.png";

const BADGE_DEFINITIONS = [
  { id: 'avid_reader', title: 'قارئ نهم', icon: '📚', desc: 'أنهيت 5 كتب', check: (_, booksFinished) => booksFinished >= 5 },
  { id: 'streak_master', title: 'المثابر', icon: '🔥', desc: 'سلسلة 7 أيام', check: (_, __, longest) => longest >= 7 },
  { id: 'page_turner', title: 'حريف صفحات', icon: '📖', desc: 'قرأت 500 صفحة', check: (entries) => entries.reduce((s, e) => s + (Number(e.pages) || 0), 0) >= 500 },
];

const TABS = [
  { key: "today", label: "اليوم", icon: Calendar },
  { key: "log", label: "السجل", icon: Calendar },
  { key: "archive", label: "الأرشيف", icon: Library },
  { key: "stats", label: "الإنجازات", icon: BarChart3 },
  { key: "leaderboard", label: "المتصدرون", icon: Trophy },
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
    if (diff === 1) run++;
    else if (diff > 1) run = 1;
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
    if (["success", "error", "warning"].includes(type)) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
    } else {
      window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
    }
  }
}

// Safe wrapper for storage functions
async function safeLoadUserData(userId, telegramName) {
  if (userId === "guest") {
    return { name: telegramName || "", entries: [], optIn: false, booksFinished: 0, completedBooksList: [] };
  }

  try {
    const data = await loadUserData(userId, telegramName);
    return data;
  } catch (err) {
    console.error("loadUserData error:", err);
    alert("حدث خطأ في loadUserData: " + err.message);
    return { name: telegramName || "", entries: [], optIn: false, booksFinished: 0, completedBooksList: [] };
  }
}

async function safeSaveProfile(userId, data) {
  if (userId === "guest") return;
  try { await saveProfile(userId, data); } catch (err) { console.error("saveProfile error:", err); }
}

async function safeSaveTodayEntry(userId, entry) {
  if (userId === "guest") return;
  try { await saveTodayEntry(userId, entry); } catch (err) { console.error("saveTodayEntry error:", err); }
}

async function safeGetLeaderboard() {
  try { return await getLeaderboard(); } catch (err) { console.error("getLeaderboard error:", err); return []; }
}

async function safeFinishBook(userId, bookTitle) {
  if (userId === "guest") return { success: false, message: "يجب فتح التطبيق من تليجرام" };
  try { return await finishBook(userId, bookTitle); } catch (err) { console.error("finishBook error:", err); return { success: false, message: "خطأ في الاتصال" }; }
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
  
  const [toast, setToast] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    (async () => {
      const telegramName = getTelegramName();
      const data = await safeLoadUserData(userId, telegramName);
      setName(data.name || "");
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
  if (toast) {
    const timer = setTimeout(() => {
      setToast(null);
    }, 3500); // تختفي تلقائياً بعد 3.5 ثوانٍ

    return () => clearTimeout(timer);
  }
}, [toast]);

  useEffect(() => {
  if (tab === "leaderboard") {
    setLoadingLeaderboard(true);
    safeGetLeaderboard().then((data) => {
      setLeaderboard(data || []);
      setLoadingLeaderboard(false);
    });
  }
}, [tab]);

useEffect(() => {
  let isMounted = true;
  if (tab === "leaderboard") {
    setLoadingLeaderboard(true);
    safeGetLeaderboard().then((data) => {
      if (isMounted) {
        setLeaderboard(data || []);
        setLoadingLeaderboard(false);
      }
    });
  }
  return () => { isMounted = false; };
}, [tab]);
  const streaks = useMemo(() => calcStreaks(entries), [entries]);
  const xpInfo = useMemo(() => computeXP(entries, booksFinished, streaks.longest), [entries, booksFinished, streaks.longest]);
  const badges = useMemo(() => BADGE_DEFINITIONS.map(b => ({ ...b, achieved: b.check(entries, booksFinished, streaks.longest) })), [entries, booksFinished, streaks.longest]);
  const hasLoggedToday = useMemo(() => entries.some((e) => e.date === todayKey()), [entries]);
  const thisMonthPages = useMemo(() => {
    const m = todayKey().slice(0, 7);
    return entries.filter((e) => e.date.startsWith(m)).reduce((s, e) => s + (Number(e.pages) || 0), 0);
  }, [entries]);
  const finishedTitles = useMemo(() => {
  return completedBooksList.map((b) => (b.book_title || "").trim().toLowerCase());
}, [completedBooksList]);

const activeBooks = useMemo(() => {
  const allBooks = [...new Set(entries.map((e) => (e.book || "").trim()).filter(Boolean))];
  // استبعاد أي كتاب موجود اسمه في قائمة المكتملات
  return allBooks.filter((book) => !finishedTitles.includes(book.toLowerCase()));
}, [entries, finishedTitles]);
  const bookCount = useMemo(() => activeBooks.length, [activeBooks]);

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
      const handleMainBtnClick = () => submitToday({ preventDefault: () => {} });
      mainBtn.onClick(handleMainBtnClick);
      return () => { mainBtn.offClick(handleMainBtnClick); mainBtn.hide(); };
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
    if (isNewBook && isClubBook) {
      if (!totalPages || Number(totalPages) <= 0) {
        triggerHaptic("error");
        setError("إدخال إجمالي صفحات الكتاب الكلي إجباري لكتب النادي الجديدة!");
        return;
      }
    }
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
    setToast({ message: "تم حفظ قراءة اليوم بنجاح! 📚", type: "success" });
    await safeSaveTodayEntry(userId, entry);
  }

  async function handleFinishBook() {
  const targetBook = selectedBook.trim();
  if (!targetBook || finishingBook) return;

  setFinishingBook(true);
  triggerHaptic("medium");
  
  const res = await safeFinishBook(userId, targetBook);
  if (res.success) {
    setBooksFinished((prev) => prev + 1);
    setCompletedBooksList((prev) => [{ book_title: targetBook, author: author || "", created_at: new Date().toISOString() }, ...prev]);
    
    triggerHaptic("success");
    setFinishedMsg(res.message);
    setShowConfetti(true);
    setToast({ message: "🎉 مبروك! أكملت كتاباً جديداً!", type: "success" });
    
    // 💡 إرسال إشارة للبوت لإطلاق رسالة التهنئة فوراً على الخاص
    if (window.Telegram?.WebApp?.sendData) {
      window.Telegram.WebApp.sendData(JSON.stringify({
        type: "FINISH_BOOK",
        bookTitle: targetBook
      }));
    }

    setSelectedBook("");
    setTimeout(() => { setFinishedMsg(""); setShowConfetti(false); }, 4500);
  } else {
    triggerHaptic("error");
    setFinishedMsg(`⚠️ ${res.message}`);
    setToast({ message: res.message, type: "error" });
    setTimeout(() => setFinishedMsg(""), 4500);
  }
  setFinishingBook(false);
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
            await navigator.share({ files: [file], title: "إحصائياتي القرائية", text: shareText });
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
    if (tg?.openLink) tg.openLink(shareUrl);
    else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setToast({ message: "تم نسخ الإحصائيات! يمكنك لصقها ومشاركتها 🚀", type: "info" });
      });
    } else {
      window.open(shareUrl, "_blank");
    }
  }
  
  async function toggleOptIn() {
    triggerHaptic("light");
    const next = !optIn;
    setOptIn(next);
    await safeSaveProfile(userId, { name, optIn: next });
    setToast({ message: next ? "أنت الآن تظهر في لوحة المتصدرين! 🏆" : "تم إخفاؤك من لوحة المتصدرين", type: "info" });
  }

  async function saveName(v) {
    setName(v);
    await safeSaveProfile(userId, { name: v, optIn });
  }

  const navy = "#1B3A5C";
  const navyDark = "#132A44";
  const orange = "#E08D3C";
  const cream = "#FAF6EF";
  const white = "#FFFFFF";
  const slate = "#8B8272";
  const amberLight = "#FFFBF5";

  const cardStyle = {
    background: white,
    borderRadius: 16,
    border: "1px solid #E7DFCF",
    boxShadow: "0 4px 16px rgba(27,58,92,0.06)",
  };

  const btnPrimary = {
    width: "100%",
    padding: "14px 0",
    borderRadius: 12,
    border: "none",
    background: orange,
    color: white,
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(224,141,60,0.25)",
    transition: "all 0.2s",
  };

  const btnSecondary = {
    width: "100%",
    padding: "12px 0",
    borderRadius: 12,
    border: `2px solid ${orange}`,
    background: "transparent",
    color: orange,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    marginTop: 10,
    transition: "all 0.2s",
  };

  const inputStyle = {
    width: "100%",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    background: white,
    border: "1.5px solid #DCD2BC",
    color: navyDark,
    fontFamily: "'Cairo',sans-serif",
    outline: "none",
    transition: "all 0.2s",
  };

  return (
    <div dir="rtl" style={{ background: cream, minHeight: "100vh", fontFamily: "Cairo, sans-serif", userSelect: "none" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        .text-center { text-align: center; }
        .amiri { font-family: 'Amiri', serif; }
        .fade-in { animation: fadein .4s cubic-bezier(0.4, 0, 0.2, 1) both; }
        @keyframes fadein { from{opacity:0; transform:translateY(12px);} to{opacity:1; transform:translateY(0);} }
        @keyframes slideUp { from{opacity:0; transform:translateY(20px);} to{opacity:1; transform:translateY(0);} }
        @keyframes pulse-soft { 0%,100%{transform:scale(1);} 50%{transform:scale(1.08);} }
        @keyframes confetti-fall { 0%{transform:translateY(0) rotate(0deg); opacity:1;} 100%{transform:translateY(100vh) rotate(720deg); opacity:0;} }
        @keyframes toast-in { from{opacity:0; transform:translate(-50%,-20px);} to{opacity:1; transform:translate(-50%,0);} }
        .animate-pulse-soft { animation: pulse-soft 2.5s ease-in-out infinite; }
        .tab-btn { transition: all 0.25s ease; }
        .tab-btn:hover { transform: translateY(-2px); }
        .tab-btn:active { transform: scale(0.95); }
        input:focus, textarea:focus, select:focus { border-color:${orange} !important; box-shadow: 0 0 0 3px rgba(224,141,60,0.12); }
        .card-hover { transition: all 0.3s ease; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(27,58,92,0.1); }
        .stat-icon { transition: all 0.3s ease; }
        .stat-card:hover .stat-icon { transform: scale(1.15) rotate(5deg); }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, padding: "12px 20px", borderRadius: 14,
          background: toast.type === "success" ? "#ecfdf5" : toast.type === "error" ? "#fef2f2" : "#eff6ff",
          border: `1.5px solid ${toast.type === "success" ? "#a7f3d0" : toast.type === "error" ? "#fecaca" : "#bfdbfe"}`,
          color: toast.type === "success" ? "#065f46" : toast.type === "error" ? "#991b1b" : "#1e40af",
          fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", animation: "toast-in 0.4s cubic-bezier(0.16,1,0.3,1)",
          minWidth: 280, maxWidth: "90vw"
        }}>
          {toast.type === "success" ? <Check size={16} /> : toast.type === "error" ? <X size={16} /> : <Sparkles size={16} />}
          {toast.message}
          <button onClick={() => setToast(null)} style={{ marginRight: "auto", background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Confetti */}
      {showConfetti && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9998, overflow: "hidden" }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", left: `${Math.random() * 100}%`, top: "-10px",
              width: 6, height: 6, borderRadius: 2,
              background: ["#E08D3C", "#1B3A5C", "#F59E0B", "#10B981", "#F43F5E", "#8B5CF6"][i % 6],
              animation: `confetti-fall ${1.5 + Math.random() * 2}s linear forwards`,
              animationDelay: `${Math.random() * 0.6}s`,
            }} />
          ))}
        </div>
      )}

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 30px" }}>
        
        {/* Header */}
        <div className="fade-in" style={{
          background: `linear-gradient(145deg, ${navy} 0%, ${navyDark} 50%, #0c1a2b 100%)`,
          borderRadius: 20, padding: "28px 20px", marginBottom: 20,
          border: `1.5px solid ${orange}`, position: "relative", overflow: "hidden",
          boxShadow: "0 8px 32px rgba(19,42,68,0.2)",
        }}>
          <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: "50%", background: "rgba(224,141,60,0.08)", filter: "blur(20px)" }} />
          <div style={{ position: "absolute", bottom: -30, left: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(224,141,60,0.06)", filter: "blur(30px)" }} />
          
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <div className="animate-pulse-soft" style={{ display: "inline-block" }}>
              <img src={logo} alt="شعار" style={{ width: 72, height: 72, borderRadius: "50%", border: "2px solid rgba(224,141,60,0.3)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", marginBottom: 10 }} />
            </div>
            <div style={{ color: orange, fontSize: 12, letterSpacing: 2, fontWeight: 800, marginBottom: 4 }}>منتدى النص والقارئ</div>
            <h1 className="amiri" style={{ color: white, fontSize: 28, margin: "4px 0", fontWeight: 700, lineHeight: 1.3 }}>
              سِجِلّ القراءة التفاعلي
            </h1>
            <div style={{ width: 50, height: 2, background: orange, margin: "12px auto", borderRadius: 2, opacity: 0.7 }} />
            
            {!loaded ? (
              <div style={{ color: "#C9D6E4", fontSize: 13, marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                جارِ تحميل سجلاتك...
              </div>
            ) : (
              <input
                value={name}
                onChange={(e) => saveName(e.target.value)}
                placeholder="اكتب اسمك الكريم هنا"
                style={{
                  textAlign: "center", borderRadius: 12, padding: "10px 14px", fontSize: 14, width: "80%",
                  background: "rgba(255,255,255,0.95)", border: "none", marginTop: 6, fontWeight: 600,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
                }}
              />
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { icon: Star, value: streaks.current, label: "سلسلة الأيام", color: orange },
            { icon: TrendingUp, value: streaks.longest, label: "أطول سلسلة", color: navy },
            { icon: BookOpen, value: bookCount, label: "كتب نشطة", color: "#059669" },
          ].map((s, i) => (
            <div key={i} className="stat-card card-hover" style={{ ...cardStyle, padding: "16px 8px", textAlign: "center" }}>
              <div className="stat-icon" style={{ color: s.color, marginBottom: 6 }}>
                <s.icon size={22} />
              </div>
              <div style={{ color: navy, fontWeight: 800, fontSize: 22, marginBottom: 2 }}>{s.value}</div>
              <div style={{ color: slate, fontSize: 11, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="fade-in" style={{
          display: "flex", gap: 6, marginBottom: 20, background: white, padding: 5, borderRadius: 14,
          border: "1px solid #E7DFCF", boxShadow: "0 2px 8px rgba(27,58,92,0.04)",
        }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { triggerHaptic("light"); setTab(t.key); }}
                className="tab-btn"
                style={{
                  flex: 1, padding: "10px 4px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                  border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  background: active ? orange : "transparent",
                  color: active ? white : navy,
                  boxShadow: active ? "0 4px 12px rgba(224,141,60,0.3)" : "none",
                  transform: active ? "translateY(-1px)" : "none",
                }}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* TODAY TAB */}
        {tab === "today" && (
          <div className="fade-in">
            {hasLoggedToday && (
              <div style={{ ...cardStyle, padding: 16, marginBottom: 16, background: amberLight, borderColor: "#F0E6D0" }}>
                <div style={{ color: "#B45309", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <Check size={16} style={{ color: "#059669" }} />
                  سجّلت اليوم ({entries.filter(e => e.date === todayKey()).length} كتاب)
                </div>
                {entries.filter(e => e.date === todayKey()).map((e, idx) => (
                  <div key={idx} style={{
                    background: white, borderRadius: 10, padding: "10px 12px", marginBottom: 6,
                    border: "1px solid #F0E6D0", display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ color: navy, fontSize: 14, fontWeight: 600 }}>{e.book}</span>
                    <span style={{ color: slate, fontSize: 12, fontWeight: 500 }}>{e.pages} ص · {e.minutes} د</span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={submitToday} style={{ ...cardStyle, padding: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ color: navy, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                    <Bookmark size={14} style={{ color: orange }} /> اسم الكتاب
                  </label>
                  {activeBooks.length > 0 && (
                    <button type="button" onClick={() => { triggerHaptic("light"); setIsNewBook(!isNewBook); if (isNewBook) setSelectedBook(activeBooks[0] || ""); else setSelectedBook(""); }}
                      style={{ background: "none", border: "none", color: orange, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {isNewBook ? "← كتبي السابقة" : "＋ كتاب جديد"}
                    </button>
                  )}
                </div>

                {isNewBook || activeBooks.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, background: amberLight, padding: 4, borderRadius: 10, border: "1px solid #E7DFCF" }}>
                      <button type="button" onClick={() => { triggerHaptic("light"); setIsClubBook(true); }}
                        style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                          background: isClubBook ? orange : "transparent", color: isClubBook ? white : navy }}>🏛️ من النادي</button>
                      <button type="button" onClick={() => { triggerHaptic("light"); setIsClubBook(false); }}
                        style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                          background: !isClubBook ? navy : "transparent", color: !isClubBook ? white : navy }}>📖 قراءة حرة</button>
                    </div>
                    <input value={selectedBook} onChange={(e) => setSelectedBook(e.target.value)} placeholder="اسم الكتاب" style={inputStyle} />
                    <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="اسم المؤلف (اختياري)" style={inputStyle} />
                    <div>
                      <label style={{ color: navy, fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4 }}>
                        إجمالي الصفحات {isClubBook ? <span style={{ color: "#DC2626" }}>*</span> : "(اختياري)"}
                      </label>
                      <input type="number" min="1" inputMode="numeric" value={totalPages} onChange={(e) => setTotalPages(e.target.value)} placeholder="مثال: 250" style={inputStyle} />
                    </div>
                  </div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <select value={selectedBook} onChange={(e) => setSelectedBook(e.target.value)} style={{ ...inputStyle, paddingLeft: 30 }}>
                      {activeBooks.map((b, idx) => <option key={idx} value={b}>{b}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: slate, pointerEvents: "none" }} />
                  </div>
                )}
              </div>

              {currentBookProgress && currentBookProgress.targetTotal > 0 && (
                <div style={{ background: amberLight, border: "1px solid #E7DFCF", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: navy, marginBottom: 6 }}>
                    <span>تقدمك: {currentBookProgress.totalRead} / {currentBookProgress.targetTotal} صفحة</span>
                    <span style={{ color: orange }}>{currentBookProgress.percentage}%</span>
                  </div>
                  <div style={{ background: "#E7DFCF", borderRadius: 8, height: 10, overflow: "hidden" }}>
                    <div style={{ width: `${currentBookProgress.percentage}%`, background: orange, height: "100%", transition: "width 0.5s ease", borderRadius: 8 }} />
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: navy, fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4 }}>
                    الصفحات {selectedIsClubBook && <span style={{ color: "#DC2626" }}>*</span>}
                  </label>
                  <input type="number" min="0" inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value)} placeholder="كم صفحة؟" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: navy, fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4 }}>الدقائق</label>
                  <input type="number" min="0" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="الوقت" style={inputStyle} />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ color: navy, fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4 }}>ملاحظة (اختياري)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="اقتباس أو ملحوظة..." style={{ ...inputStyle, resize: "none" }} />
              </div>

              {error && <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 12, fontWeight: 600, background: "#FEF2F2", padding: "8px 12px", borderRadius: 8 }}>⚠️ {error}</div>}
              
              <button type="submit" style={btnPrimary}>
                <Feather size={16} style={{ verticalAlign: "-3px", marginLeft: 6 }} />
                {hasLoggedToday ? "سجّل كتاباً آخر 📚" : "سجّل قراءة اليوم"}
              </button>

              {!isNewBook && activeBooks.length > 0 && (
                <button type="button" disabled={finishingBook} onClick={handleFinishBook} style={{ ...btnSecondary, opacity: finishingBook ? 0.6 : 1 }}>
                  {finishingBook ? "⏳ جارِ الحفظ..." : "🎉 أتممت هذا الكتاب (+50 XP)"}
                </button>
              )}
            </form>

            {finishedMsg && (
              <div className="fade-in" style={{ textAlign: "center", color: orange, fontSize: 13, marginTop: 14, fontWeight: 700, background: white, padding: "12px 14px", borderRadius: 12, border: `1.5px dashed ${orange}` }}>
                {finishedMsg}
              </div>
            )}

            <button onClick={toggleOptIn} style={{
              width: "100%", marginTop: 16, padding: "14px", borderRadius: 12,
              background: optIn ? "#FDF1E3" : white, border: `1.5px solid ${optIn ? orange : "#DCD2BC"}`,
              color: optIn ? orange : slate, fontSize: 13, display: "flex",
              alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontWeight: 700,
            }}>
              <Users size={16} />
              {optIn ? "أنت تظهر في المتصدرين ✓" : "الظهور في لوحة المتصدرين"}
            </button>
          </div>
        )}

        {/* LOG TAB */}
        {tab === "log" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {grouped.length === 0 ? (
              <div style={{ textAlign: "center", color: "#A99B7E", fontSize: 14, padding: "50px 0" }}>
                <ScrollText size={40} style={{ margin: "0 auto 16px", color: "#D4C4A8" }} />
                <div style={{ fontWeight: 700, color: navy, marginBottom: 4 }}>سجلك الأدبي فارغ</div>
                <div style={{ fontSize: 13 }}>ابدأ رحلتك القرائية وسجل أول كتاب</div>
              </div>
            ) : (
              grouped.map(([date, items], gi) => (
                <div key={date} className="card-hover" style={{ ...cardStyle, padding: 18 }}>
                  <div style={{ color: orange, fontSize: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                    <Calendar size={14} />
                    {date}
                    <span style={{ marginRight: "auto", fontSize: 10, color: "#D4C4A8", background: amberLight, padding: "2px 10px", borderRadius: 20 }}>
                      {items.length} إدخال
                    </span>
                  </div>
                  {items.map((e, index) => (
                    <div key={e.id} style={{ marginBottom: index !== items.length - 1 ? 12 : 0, borderBottom: index !== items.length - 1 ? "1px solid #F4EFE6" : "none", paddingBottom: index !== items.length - 1 ? 12 : 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ color: navy, fontSize: 15, fontWeight: 700 }}>{e.book}</div>
                          {e.author && <div style={{ fontSize: 12, color: slate, fontWeight: 500 }}>— {e.author}</div>}
                        </div>
                        <div style={{ background: "#F4EFE6", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: slate, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {e.pages > 0 && `${e.pages} ص`}{e.pages > 0 && e.minutes > 0 && " · "}{e.minutes > 0 && `${e.minutes} د`}
                        </div>
                      </div>
                      {e.note && (
                        <div className="amiri" style={{ color: "#4A5568", fontSize: 14, marginTop: 8, paddingRight: 10, borderRight: "3px solid #E7DFCF", fontStyle: "italic", lineHeight: 1.6 }}>
                          « {e.note} »
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {/* ARCHIVE TAB */}
        {tab === "archive" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {completedBooksList.length === 0 ? (
              <div style={{ textAlign: "center", color: "#A99B7E", fontSize: 14, padding: "50px 0" }}>
                <Library size={40} style={{ margin: "0 auto 16px", color: "#D4C4A8" }} />
                <div style={{ fontWeight: 700, color: navy, marginBottom: 4 }}>مكتبتك فارغة</div>
                <div style={{ fontSize: 13 }}>أكمل قراءة كتابك الأول ليضاف هنا</div>
              </div>
            ) : (
              completedBooksList.map((item, idx) => (
                <div key={idx} className="card-hover" style={{ ...cardStyle, padding: 18, borderRight: `4px solid ${orange}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#059669", fontWeight: 700, fontSize: 11, marginBottom: 6 }}>
                    <Check size={14} strokeWidth={3} /> كتاب مكتمل (+50 XP)
                  </div>
                  <div style={{ color: navy, fontSize: 17, fontWeight: 800 }}>{item.book_title}</div>
                  {item.author && <div style={{ color: slate, fontSize: 13, marginTop: 2 }}>المؤلف: {item.author}</div>}
                  {item.created_at && (
                    <div style={{ color: "#A99B7E", fontSize: 11, marginTop: 8 }}>
                      {new Date(item.created_at).toISOString().slice(0, 10)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* STATS TAB */}
        {tab === "stats" && (
          <>
            <div ref={statsCardRef} style={{ background: cream, padding: "4px" }}>
              <div className="fade-in" style={{ marginBottom: 18, textAlign: "center", background: white, padding: 24, borderRadius: 16, border: "1px solid #E7DFCF", boxShadow: "0 4px 16px rgba(27,58,92,0.06)" }}>
                <div className="animate-pulse-soft" style={{ display: "inline-block", marginBottom: 12 }}>
                  <Award size={40} style={{ color: orange }} />
                </div>
                <div style={{ color: navy, fontWeight: 800, fontSize: 18 }}>
                  المستوى {xpInfo.level} — <span style={{ color: orange }}>{xpInfo.levelName}</span>
                </div>
                <div style={{ color: slate, fontSize: 13, margin: "6px 0 14px", fontWeight: 600 }}>
                  {xpInfo.totalXP} نقطة خبرة
                </div>
                <div style={{ background: "#E7DFCF", borderRadius: 10, height: 12, overflow: "hidden", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div style={{
                    width: `${Math.min(xpInfo.progress * 100, 100)}%`,
                    background: `linear-gradient(90deg, ${orange} 0%, #F5A65B 100%)`,
                    height: "100%", transition: "width .5s ease", borderRadius: 10,
                  }} />
                </div>
                <div style={{ color: "#A99B7E", fontSize: 12, marginTop: 8, fontWeight: 500 }}>
                  {xpInfo.nextThreshold - xpInfo.totalXP > 0
                    ? `متبقي ${xpInfo.nextThreshold - xpInfo.totalXP} XP للمستوى التالي`
                    : "أعلى مستوى حالياً! 🏆"}
                </div>
              </div>

              <div className="fade-in" style={{ ...cardStyle, padding: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {[
                    ["صفحات الشهر", `${thisMonthPages} ص`, FileText, "#D97706"],
                    ["أيام القراءة", `${new Set(entries.map(e => e.date)).size} يوم`, Calendar, "#2563EB"],
                    ["كتب نشطة", `${bookCount} كتاب`, BookOpen, "#059669"],
                    ["كتب مكتملة", `${booksFinished} كتاب`, Check, "#DC2626"],
                    ["أطول سلسلة", `${streaks.longest} يوم`, Flame, "#EA580C"],
                    ["السلسلة الحالية", `${streaks.current} يوم`, Zap, "#7C3AED"],
                  ].map(([lbl, val, Icon, col], idx) => (
                    <div key={idx} style={{ background: "#FAFAF9", borderRadius: 12, padding: 14, border: "1px solid #F0E6D0", textAlign: "center" }}>
                      <Icon size={18} style={{ color: col, marginBottom: 6 }} />
                      <div style={{ color: navy, fontWeight: 800, fontSize: 18 }}>{val}</div>
                      <div style={{ color: slate, fontSize: 10, fontWeight: 600, marginTop: 2 }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #F0E6D0" }}>
                  <div style={{ color: navy, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>أوسمة الإنجاز 🏅</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {badges.map((b, i) => (
                      <div key={b.id} className="card-hover" style={{ 
                        background: b.achieved ? amberLight : "#F5F5F4", 
                        border: `1.5px solid ${b.achieved ? "#F0E6D0" : "#E7E5E4"}`,
                        borderRadius: 14, padding: "14px 8px", textAlign: "center",
                        opacity: b.achieved ? 1 : 0.55,
                        transition: "all 0.3s", position: "relative",
                      }}>
                        {!b.achieved && <div style={{ position: "absolute", top: 6, right: 6, color: "#D6D3D1" }}><Lock size={10} /></div>}
                        <div style={{ fontSize: 26, marginBottom: 4 }}>{b.icon}</div>
                        <div style={{ color: navy, fontSize: 11, fontWeight: 700 }}>{b.title}</div>
                        <div style={{ color: slate, fontSize: 9 }}>{b.desc}</div>
                        {b.achieved && <div style={{ position: "absolute", top: -4, left: -4 }}><Sparkles size={12} style={{ color: orange }} /></div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            <button onClick={shareStats} disabled={sharing} style={{
              width: "100%", marginTop: 16, padding: "14px 0", borderRadius: 12,
              background: navy, color: white, fontWeight: 700, fontSize: 14,
              border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(27,58,92,0.15)",
              opacity: sharing ? 0.7 : 1,
            }}>
              {sharing ? "⏳ جارِ الإنشاء..." : "📤 مشاركة إحصائياتي"}
            </button>
          </>
        )}

        {/* LEADERBOARD TAB */}
        {tab === "leaderboard" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loadingLeaderboard ? (
              <div style={{ textAlign: "center", color: "#A99B7E", fontSize: 14, padding: "50px 0" }}>
                <Loader2 size={32} style={{ margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
                جارِ تحميل المتصدرين...
              </div>
            ) : leaderboard.length === 0 ? (
              <div style={{ textAlign: "center", color: "#A99B7E", fontSize: 14, padding: "50px 0" }}>
                <Trophy size={40} style={{ margin: "0 auto 16px", color: "#D4C4A8" }} />
                <div style={{ fontWeight: 700, color: navy, marginBottom: 4 }}>لا يوجد متصدرون بعد</div>
                <div style={{ fontSize: 13 }}>كن أول من يسجل قراءته</div>
              </div>
            ) : (
              <>
                {/* منصة التتويج للمراكز الثلاثة الأولى */}
{leaderboard.length >= 3 && (
  <div className="podium-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '10px', marginBottom: '20px' }}>
    
    {/* 🥈 المركز الثاني (فضية) */}
    <div className="podium-card rank-2" style={{ flex: 1, textAlign: 'center', background: '#fff9e6', borderRadius: '12px', padding: '10px', height: '140px', border: '1px solid #ffd54f' }}>
      <div style={{ fontSize: '1.4rem' }}>🥈</div>
      <h4 style={{ margin: '6px 0 2px', fontSize: '0.9rem' }}>{leaderboard[1]?.name}</h4>
      <span style={{ fontSize: '0.8rem', color: '#666' }}>{leaderboard[1]?.current} يوم</span>
    </div>

    {/* 🥇 المركز الأول (ذهبية - الأطول في المنتصف) */}
    <div className="podium-card rank-1" style={{ flex: 1, textAlign: 'center', background: '#fff', borderRadius: '12px', padding: '10px', height: '170px', border: '2px solid #ffb300' }}>
      <div style={{ fontSize: '1.6rem' }}>🥇</div>
      <h4 style={{ margin: '6px 0 2px', fontSize: '0.95rem', fontWeight: 'bold' }}>{leaderboard[0]?.name}</h4>
      <span style={{ fontSize: '0.85rem', color: '#e65100', fontWeight: 'bold' }}>{leaderboard[0]?.current} يوم</span>
    </div>

    {/* 🥉 المركز الثالث (برونزية) */}
    <div className="podium-card rank-3" style={{ flex: 1, textAlign: 'center', background: '#fff5eb', borderRadius: '12px', padding: '10px', height: '120px', border: '1px solid #ffcc80' }}>
      <div style={{ fontSize: '1.4rem' }}>🥉</div>
      <h4 style={{ margin: '6px 0 2px', fontSize: '0.9rem' }}>{leaderboard[2]?.name}</h4>
      <span style={{ fontSize: '0.8rem', color: '#666' }}>{leaderboard[2]?.current} يوم</span>
    </div>

  </div>
)}
                {leaderboard.map((r, i) => {
                  const isTopThree = i < 3;
                  const isMe = r.id === userId;
                  return (
                    <div key={i} className="card-hover" style={{
                      ...cardStyle, padding: "14px 16px", display: "flex",
                      alignItems: "center", justifyContent: "space-between",
                      borderRight: isTopThree ? `4px solid ${orange}` : "4px solid #E7DFCF",
                      background: isMe ? amberLight : white,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          fontWeight: 800, fontSize: 14, minWidth: 28, height: 28, borderRadius: 8,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: isTopThree ? orange : "#F5F5F4", color: isTopThree ? white : slate,
                        }}>
                          {isTopThree ? ["🥇", "🥈", "🥉"][i] : i + 1}
                        </div>
                        <div style={{ color: navy, fontWeight: 700, fontSize: 14 }}>
                          {r.name} {isMe && <span style={{ fontSize: 10, color: orange, fontWeight: 500 }}>(أنت)</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 12, color: slate, fontWeight: 600 }}>
                        <span style={{ background: "#FEF3C7", padding: "3px 8px", borderRadius: 6, fontSize: 11 }}>🔥 {r.current}</span>
                        <span style={{ background: "#DBEAFE", padding: "3px 8px", borderRadius: 6, fontSize: 11 }}>📅 {r.days}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Share Modal */}
      {shareImage && (
        <div onClick={() => setShareImage(null)} style={{
          position: "fixed", inset: 0, background: "rgba(19,42,68,0.95)", zIndex: 9999,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{ color: white, fontSize: 14, marginBottom: 14, textAlign: "center", fontWeight: 600, lineHeight: 1.6 }}>
            ✨ تم إنشاء بطاقتك بنجاح!
            <br /><span style={{ fontSize: 12, color: orange, fontWeight: 700 }}>اضغط مطوّلاً على الصورة لحفظها</span>
          </div>
          <img src={shareImage} alt="بطاقة الإحصائيات" style={{ maxWidth: "100%", maxHeight: "55vh", borderRadius: 16, boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()} />
          <div style={{ display: "flex", gap: 10, marginTop: 16, width: "100%", maxWidth: 320 }}>
            <button onClick={(e) => { e.stopPropagation(); triggerHaptic("medium"); executeTextShare(`📊 بطاقة إنجازاتي القرائية في منتدى النص والقارئ 📚✨\n\n🌱 المستوى: ${xpInfo.levelName} (${xpInfo.totalXP} XP)\n📑 صفحات هذا الشهر: ${thisMonthPages} صفحة\n🔥 أطول سلسلة: ${streaks.longest} يوم\n\nانضم إلينا:\nhttps://t.me/mtdreads_bot`); }}
              style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: orange, color: white, fontWeight: 700, border: "none", cursor: "pointer", fontSize: 13 }}>
              🚀 إرسال
            </button>
            <button onClick={() => { triggerHaptic("light"); setShareImage(null); }}
              style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: "rgba(255,255,255,0.15)", color: white, fontWeight: 700, border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 13 }}>
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

