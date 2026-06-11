import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "./firebase";
import { UserProfile, NotificationAlert } from "./types";
import { isLocalDemoActive, getLocalUserSession } from "./localDb";

// Component imports
import AuthView from "./components/AuthView";
import MyPredictions from "./components/MyPredictions";
import GroupView from "./components/GroupView";
import StandingsView from "./components/StandingsView";
import NotificationsFeed from "./components/NotificationsFeed";
import ReportsView from "./components/ReportsView";
import AdminDashboard from "./components/AdminDashboard";

// Icons
import {
  Trophy,
  Swords,
  Users,
  Bell,
  MessageSquare,
  ShieldAlert,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Smartphone,
  Download,
  Share
} from "lucide-react";

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"predictions" | "groups" | "standings" | "notifications" | "support" | "admin">("predictions");
  
  // Real-time notification badge counts
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [lastViewedCount, setLastViewedCount] = useState(0);

  // Bottom menu navigation drawer for mobile
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAlreadyInstalled, setIsAlreadyInstalled] = useState(false);

  // Synchronize PWA and installation logic
  useEffect(() => {
    // Check if app is running in standalone mode (already installed)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches 
      || (navigator as any).standalone 
      || document.referrer.includes("android-app://");
    
    if (isStandalone) {
      setIsAlreadyInstalled(true);
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // If iOS and not running standalone, prompt after short delay
    if (isIosDevice && !isStandalone) {
      const timer = setTimeout(() => {
        setShowInstallBanner(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User choice outcome: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  // Handle Auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          let userDoc;
          try {
            userDoc = await getDoc(userDocRef);
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, `users/${user.uid}`);
            return;
          }
          
          if (userDoc.exists()) {
            setCurrentUser(userDoc.data() as UserProfile);
          } else {
            // It could be that the doc creation in AuthView is still in progress, so we define a safe default
            const fallbackProfile: UserProfile = {
              id: user.uid,
              displayName: user.displayName || "Usuario del Prode",
              photoURL: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`,
              email: user.email || "",
              globalPoints: 0,
              globalExactScores: 0,
              globalCorrectOutcomes: 0,
              role: user.email === "ignaciozamorano@gmail.com" ? "admin" : "user",
            };
            setCurrentUser(fallbackProfile);
          }
        } catch (e) {
          console.error("Error setting user profile", e);
        }
      } else {
        if (isLocalDemoActive()) {
          setCurrentUser(getLocalUserSession());
        } else {
          setCurrentUser(null);
        }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Listen to total users scores or notifications count to light up a bell badge alert
  useEffect(() => {
    if (!currentUser) return;
    if (isLocalDemoActive()) {
      setUnreadNotifications(1);
      
      const onLocalNotes = () => {
        const localNotes = JSON.parse(localStorage.getItem("local_notifications") || "[]");
        setUnreadNotifications(localNotes.length);
      };
      onLocalNotes();
      window.addEventListener("local_notes_updated", onLocalNotes);
      return () => window.removeEventListener("local_notes_updated", onLocalNotes);
    }
    const notesRef = collection(db, "notifications");
    const q = query(notesRef, orderBy("createdAt", "desc"), limit(10));
    
    const unsub = onSnapshot(q, (snapshot) => {
      const size = snapshot.size;
      setUnreadNotifications(size);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "notifications");
    });
    return unsub;
  }, [currentUser]);

  // Synchronize internal state fields if stats of the current user change in database in real-time
  useEffect(() => {
    if (!currentUser) return;
    if (isLocalDemoActive()) {
      const onLocalUsersUpdate = () => {
        const localUsers = JSON.parse(localStorage.getItem("local_users") || "[]");
        const found = localUsers.find((u: any) => u.id === currentUser.id);
        if (found) {
          setCurrentUser(found);
          localStorage.setItem("local_user_session", JSON.stringify(found));
        }
      };
      onLocalUsersUpdate();
      window.addEventListener("local_users_updated", onLocalUsersUpdate);
      return () => window.removeEventListener("local_users_updated", onLocalUsersUpdate);
    }
    const userDocRef = doc(db, "users", currentUser.id);
    const unsub = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setCurrentUser(docSnap.data() as UserProfile);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${currentUser.id}`);
    });
    return unsub;
  }, [currentUser?.id]);

  const handleLogout = async () => {
    if (window.confirm("¿Seguro que deseas salir de tu cuenta?")) {
      await signOut(auth);
      localStorage.removeItem("is_local_demo");
      localStorage.removeItem("local_user_session");
      setCurrentUser(null);
    }
  };

  // Reset notifications badge count when clicking the tab
  const handleTabClick = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
    if (tab === "notifications") {
      setLastViewedCount(unreadNotifications);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-gray-100 flex flex-col items-center justify-center">
        <div className="bg-emerald-500 p-4 rounded-full shadow-lg mb-4 animate-pulse">
          <Trophy className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-sm font-bold tracking-wider text-emerald-400 capitalize animate-pulse">
          Cargando Prode Mundial 2026...
        </h3>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0f172a] overflow-x-hidden flex items-center justify-center">
        <AuthView onLoginSuccess={(user) => setCurrentUser(user)} />
      </div>
    );
  }

  const isBellActive = unreadNotifications > lastViewedCount;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex justify-center items-stretch antialiased font-sans">
      {/* Mobile container simulator wrapper */}
      <div className="w-full max-w-md bg-slate-950 border-x border-slate-800 shadow-2xl flex flex-col relative h-screen overflow-hidden">
        
        {/* Main Header navigation */}
        <header className="shrink-0 bg-slate-900 border-b border-slate-850 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-tr from-[#f472b6] to-[#06b6d4] rounded-lg flex items-center justify-center font-black text-slate-950 text-xs shadow-lg shrink-0">
              26
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white uppercase">
                MUNDIAL<span className="vibrant-gradient-text">PRO</span>
              </h1>
              <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider leading-none mt-0.5">
                Prode Oficial
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time score indicator */}
            <div className="bg-slate-800 border border-slate-700 px-3 py-1 rounded-xl text-right">
              <span className="text-[8px] text-slate-400 uppercase block font-semibold leading-none">Mi Puntaje</span>
              <span className="text-xs font-black text-yellow-400 block mt-0.5">{currentUser.globalPoints} Pts</span>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-1.5 hover:bg-slate-800 text-slate-450 hover:text-rose-400 border border-transparent hover:border-slate-750 rounded-lg transition-all"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </header>

        {/* Dynamic active user greeting strip */}
        <div className="shrink-0 bg-slate-900/60 border-b border-slate-800/80 py-1.5 px-4 flex items-center justify-between z-20">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={currentUser.photoURL}
              alt={currentUser.displayName}
              className="w-5.5 h-5.5 rounded-full border border-emerald-500 shrink-0 select-none object-cover bg-slate-950"
              referrerPolicy="no-referrer"
            />
            <span className="text-[11px] font-bold text-slate-300 truncate tracking-wide">
              Hola, {currentUser.displayName}!
            </span>
          </div>

          {currentUser.role === "admin" && (
            <span className="text-[8px] font-bold bg-amber-950/80 text-yellow-400 px-1.5 py-[1.2px] rounded uppercase border border-amber-800 tracking-wider">
              Super Admin
            </span>
          )}
        </div>

        {/* PWA Installation Banner */}
        {showInstallBanner && !isAlreadyInstalled && (
          <div className="shrink-0 bg-gradient-to-r from-emerald-950/90 to-slate-900/90 border-b border-emerald-800/40 px-4 py-3 relative transition-all z-20">
            <div className="flex gap-3">
              <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 shrink-0">
                <Smartphone className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[12px] font-black text-emerald-400 uppercase tracking-wider">
                  ¡Instalá nuestra App!
                </h4>
                <p className="text-[10px] text-slate-300 leading-normal mt-0.5 font-bold">
                  {isIOS 
                    ? "Tocá Compartir abajo en tu navegador Safari y seleccioná 'Agregar a inicio'." 
                    : "Agregá el Prode a tu pantalla de inicio para simular y jugar con amigos más rápido."}
                </p>
                
                <div className="flex items-center gap-2 mt-2">
                  {!isIOS ? (
                    <button
                      onClick={handleInstallClick}
                      className="text-[10px] font-black bg-emerald-400 hover:bg-emerald-350 text-slate-950 px-3 py-1 rounded-lg uppercase tracking-wide transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      Instalar Ahora
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                      <Share className="w-3 h-3 text-emerald-400 inline shrink-0" /> Compartir &gt; Agregar a inicio
                    </div>
                  )}
                  <button
                    onClick={() => setShowInstallBanner(false)}
                    className="text-[10px] font-bold text-slate-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-slate-800/50 transition-all uppercase cursor-pointer"
                  >
                    Quizás más tarde
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowInstallBanner(false)}
                className="text-slate-400 hover:text-white shrink-0 self-start p-0.5 hover:bg-slate-800/45 rounded-full cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Core content rendering viewport area */}
        <main className="grow overflow-hidden relative bg-slate-950">
          {activeTab === "predictions" && <MyPredictions currentUser={currentUser} />}
          {activeTab === "groups" && <GroupView currentUser={currentUser} />}
          {activeTab === "standings" && <StandingsView currentUser={currentUser} />}
          {activeTab === "notifications" && <NotificationsFeed currentUser={currentUser} />}
          {activeTab === "support" && <ReportsView currentUser={currentUser} />}
          {activeTab === "admin" && currentUser.role === "admin" && <AdminDashboard />}
        </main>

        {/* Floating Developer/Admin Quick shortcut (Visible only if user is Admin) */}
        {currentUser.role === "admin" && activeTab !== "admin" && (
          <button
            onClick={() => setActiveTab("admin")}
            className="absolute bottom-20 right-4 p-3 bg-gradient-to-tr from-yellow-400 to-emerald-500 hover:from-yellow-300 hover:to-emerald-400 text-slate-950 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all z-50 flex items-center justify-center border border-yellow-300/20"
            title="Ir al Control Súper Admin"
          >
            <ShieldAlert className="w-5 h-5 text-slate-950 font-black" />
          </button>
        )}

        {/* Bottom Navigation tab-bar (Touch target optimized for mobile screens) */}
        <nav className="shrink-0 bg-slate-900 border-t border-slate-800 grid grid-cols-5 py-2.5 pb-4 px-1.5 z-40 relative shadow-[0_-4px_12px_rgba(0,0,0,0.4)]">
          
          <button
            onClick={() => handleTabClick("predictions")}
            className={`flex flex-col items-center justify-center gap-1 active:scale-90 transition-all ${
              activeTab === "predictions" ? "text-emerald-400" : "text-slate-450 hover:text-slate-250"
            }`}
          >
            <Swords className="w-4.5 h-4.5 text-slate-400 hover:text-white" style={{color: activeTab === "predictions" ? "#34d399" : ""}} />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: activeTab === "predictions" ? "#34d399" : "#94a3b8"}}>Pronósticos</span>
          </button>

          <button
            onClick={() => handleTabClick("groups")}
            className={`flex flex-col items-center justify-center gap-1 active:scale-90 transition-all ${
              activeTab === "groups" ? "text-emerald-400" : "text-slate-455 hover:text-slate-250"
            }`}
          >
            <Users className="w-4.5 h-4.5 text-slate-400 hover:text-white" style={{color: activeTab === "groups" ? "#34d399" : ""}} />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: activeTab === "groups" ? "#34d399" : "#94a3b8"}}>Grupos</span>
          </button>

          <button
            onClick={() => handleTabClick("standings")}
            className={`flex flex-col items-center justify-center gap-1 active:scale-90 transition-all ${
              activeTab === "standings" ? "text-emerald-400" : "text-slate-455 hover:text-slate-250"
            }`}
          >
            <Trophy className="w-4.5 h-4.5 text-slate-400 hover:text-white" style={{color: activeTab === "standings" ? "#34d399" : ""}} />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: activeTab === "standings" ? "#34d399" : "#94a3b8"}}>Ránking</span>
          </button>

          <button
            onClick={() => handleTabClick("notifications")}
            className={`flex flex-col items-center justify-center gap-1 relative active:scale-90 transition-all ${
              activeTab === "notifications" ? "text-emerald-400" : "text-slate-455 hover:text-slate-250"
            }`}
          >
            <div className="relative">
              <Bell className="w-4.5 h-4.5 text-slate-400 hover:text-white" style={{color: activeTab === "notifications" ? "#34d399" : ""}} />
              {isBellActive && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 rounded-full w-2 h-2 animate-bounce border border-slate-900"></span>
              )}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: activeTab === "notifications" ? "#34d399" : "#94a3b8"}}>Alertas</span>
          </button>

          <button
            onClick={() => handleTabClick("support")}
            className={`flex flex-col items-center justify-center gap-1 active:scale-90 transition-all ${
              activeTab === "support" ? "text-emerald-400" : "text-slate-455 hover:text-slate-250"
            }`}
          >
            <MessageSquare className="w-4.5 h-4.5 text-slate-400 hover:text-white" style={{color: activeTab === "support" ? "#34d399" : ""}} />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: activeTab === "support" ? "#34d399" : "#94a3b8"}}>Soporte</span>
          </button>

        </nav>
      </div>
    </div>
  );
}
