import React, { useState } from "react";
import { signInWithPopup, GoogleAuthProvider, signInAnonymously } from "firebase/auth";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Trophy, LogIn, Users, ShieldAlert } from "lucide-react";

interface AuthViewProps {
  onLoginSuccess: (user: any) => void;
}

export default function AuthView({ onLoginSuccess }: AuthViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Upsert user to firestore
      const userDocRef = doc(db, "users", user.uid);
      let userDoc;
      try {
        userDoc = await getDoc(userDocRef);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `users/${user.uid}`);
        return;
      }
      
      let userProfile;
      if (!userDoc.exists()) {
        userProfile = {
          id: user.uid,
          displayName: user.displayName || "Usuario del Prode",
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`,
          email: user.email || "",
          globalPoints: 0,
          globalExactScores: 0,
          globalCorrectOutcomes: 0,
          role: user.email === "ignaciozamorano@gmail.com" ? "admin" : "user",
        };
        try {
          await setDoc(userDocRef, userProfile);
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}`);
          return;
        }
      } else {
        userProfile = userDoc.data();
      }
      
      onLoginSuccess(userProfile);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/popup-blocked") {
        setError(
          "El navegador bloqueó la ventana emergente de Google. Por favor, usa la opción 'Acceso Rápido de Prueba' para probar la app dentro del iframe o haz clic en 'Abrir en pestaña nueva' arriba a la derecha."
        );
      } else {
        setError("Error al iniciar sesión con Google: " + (err.message || String(err)));
      }
    } finally {
      setLoading(false);
    }
  };

  const [showLocalBypass, setShowLocalBypass] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<{ displayName: string; email: string; avatar: string; role: "user" | "admin" } | null>(null);

  const handleBypassLocalLogin = () => {
    if (!selectedPersona) return;
    setLoading(true);
    try {
      localStorage.setItem("is_local_demo", "true");
      const uid = "local_demo_" + selectedPersona.email.split("@")[0];
      const userProfile = {
        id: uid,
        displayName: selectedPersona.displayName,
        photoURL: selectedPersona.avatar,
        email: selectedPersona.email,
        globalPoints: 0,
        globalExactScores: 0,
        globalCorrectOutcomes: 0,
        role: selectedPersona.role,
      };
      
      // Save locally to simulate users collection
      const localUsers = JSON.parse(localStorage.getItem("local_users") || "[]");
      if (!localUsers.some((u: any) => u.id === uid)) {
        localUsers.push(userProfile);
        localStorage.setItem("local_users", JSON.stringify(localUsers));
      }
      localStorage.setItem("local_user_session", JSON.stringify(userProfile));
      onLoginSuccess(userProfile);
    } catch (err: any) {
      console.error(err);
      setError("Error al iniciar en modo local: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemologin = async (persona: { displayName: string; email: string; avatar: string; role: "user" | "admin" }) => {
    setLoading(true);
    setError(null);
    setShowLocalBypass(false);
    setSelectedPersona(persona);
    try {
      // We sign in anonymously to satisfy Firebase Security Rules
      const result = await signInAnonymously(auth);
      const uid = result.user.uid;
      
      // Upsert the demo persona using this anonymous UID
      const userDocRef = doc(db, "users", uid);
      const userProfile = {
        id: uid,
        displayName: persona.displayName,
        photoURL: persona.avatar,
        email: persona.email,
        globalPoints: 0,
        globalExactScores: 0,
        globalCorrectOutcomes: 0,
        role: persona.role,
      };
      
      try {
        await setDoc(userDocRef, userProfile);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `users/${uid}`);
        return;
      }
      localStorage.setItem("is_local_demo", "false");
      onLoginSuccess(userProfile);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/admin-restricted-operation" || err.message?.includes("admin-restricted-operation")) {
        setError(null);
        setShowLocalBypass(true);
      } else {
        setError("Error al iniciar sesión de prueba: " + (err.message || String(err)));
        setShowLocalBypass(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const demoPersonas = [
    {
      displayName: "Ignacio (Súper Admin)",
      email: "ignaciozamorano@gmail.com",
      avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ignacio_admin",
      role: "admin" as const,
    },
    {
      displayName: "Leo Messi",
      email: "messi_prode@fan.com",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=messi",
      role: "user" as const,
    },
    {
      displayName: "Diego Maradona",
      email: "diego10_prode@fan.com",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=maradona",
      role: "user" as const,
    },
    {
      displayName: "Sofía Martínez",
      email: "sofia_prode@fan.com",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=sofia",
      role: "user" as const,
    },
  ];

  return (
    <div id="auth-container" className="flex flex-col items-center justify-center p-6 text-white max-w-md mx-auto h-full font-sans bg-slate-950">
      {/* App Logo */}
      <div className="flex flex-col items-center mb-8 mt-12">
        <div className="w-16 h-16 bg-gradient-to-tr from-yellow-400 to-emerald-500 rounded-2xl flex items-center justify-center font-black text-slate-950 text-2xl shadow-xl shadow-emerald-550/10 mb-3 animate-bounce">
          26
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white uppercase text-center leading-none">
          MUNDIAL<span className="text-emerald-400">PRO</span>
        </h1>
        <p className="text-yellow-400 text-xs font-bold uppercase tracking-widest mt-2">
          PRODE DE FÚTBOL 2026
        </p>
        <p className="text-slate-400 text-xs mt-1 text-center">
          Pronostica, crea tus grupos privados y compite con amigos
        </p>
      </div>

      {/* Main card */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <h2 className="text-lg font-extrabold mb-4 text-center text-white">
          Ingresar al Juego
        </h2>
        
         {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-xl text-rose-300 text-xs flex gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-450" />
            <span>{error}</span>
          </div>
        )}

        {showLocalBypass && selectedPersona && (
          <div className="mb-5 p-4 bg-amber-955/20 border border-amber-900 rounded-2xl text-[11px] text-slate-350 flex flex-col gap-2.5 shadow-lg">
            <div className="flex gap-2">
              <ShieldAlert className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <div className="font-semibold leading-relaxed">
                <span className="text-amber-400 font-bold block mb-1 uppercase tracking-wider text-xs">Acceso de Prueba Restringido</span>
                El proveedor <strong className="text-white">Anónimo</strong> está inactivo en la consola de tu proyecto de Firebase.
              </div>
            </div>
            
            <div className="border-t border-slate-800/80 pt-2 text-[10px] text-slate-450 pl-1 leading-relaxed">
              <p className="font-extrabold text-slate-300 mb-1">Para habilitarlo de forma definitiva:</p>
              1. Abre tu <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-sky-400 underline hover:text-sky-300">Consola de Firebase</a>.<br />
              2. Ve a <strong className="text-slate-300">Authentication</strong> &gt; <strong className="text-slate-300">Sign-in method</strong>.<br />
              3. Activa el método de inicio de sesión <strong className="text-yellow-400">Anónimo</strong>.
            </div>

            <button
              onClick={handleBypassLocalLogin}
              className="mt-1 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 px-3 rounded-xl transition-all cursor-pointer text-xs uppercase tracking-wider active:scale-95 shadow-md flex items-center justify-center gap-1.5"
            >
              <span>🚀 Ingresar en Modo Local como {selectedPersona.displayName.split(" ")[0]}</span>
            </button>
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          id="google-login-btn"
          className="w-full flex items-center justify-center gap-3 bg-white text-slate-950 hover:bg-slate-100 font-extrabold py-3.5 px-4 rounded-xl active:scale-95 transition-all shadow-lg disabled:opacity-50 cursor-pointer"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg"
            alt="Google Logo"
            className="w-5 h-5"
          />
          {loading ? "Cargando..." : "Registrarse con Google"}
        </button>

        <div className="relative my-7">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
            <span className="bg-slate-900 px-3 text-slate-500 font-bold">
              Entorno de Pruebas Rápido
            </span>
          </div>
        </div>

        <div>
          <p className="text-[10px] text-center text-slate-450 mb-3 leading-relaxed">
            ¿Probando desde el simulador? Haz clic en un perfil de prueba para ingresar instantáneamente:
          </p>
          
          <div className="grid grid-cols-2 gap-2">
            {demoPersonas.map((persona, idx) => (
              <button
                key={idx}
                onClick={() => handleDemologin(persona)}
                disabled={loading}
                className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 hover:bg-slate-800 active:bg-slate-950 border border-slate-850/80 text-left transition-all text-xs"
              >
                <img
                  src={persona.avatar}
                  alt={persona.displayName}
                  className="w-8 h-8 rounded-full border border-emerald-500/80 bg-slate-900 shrink-0 select-none"
                  referrerPolicy="no-referrer"
                />
                <div className="truncate">
                  <p className="font-extrabold text-slate-200 truncate">{persona.displayName}</p>
                  <p className="text-[9px] text-slate-500 truncate capitalize font-semibold">{persona.role === "admin" ? "Súper Admin" : "Jugador"}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Info footer */}
      <div className="mt-8 text-center text-xs text-slate-500 flex flex-col items-center gap-1.5 leading-relaxed">
        <div className="flex items-center gap-1.5 text-slate-400 font-bold">
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span>Mundial USA • MÉXICO • CANADÁ 2026</span>
        </div>
        <p className="text-[11px]">Unidos por la pasión mundialista. ¡Crea tu Quiniela Oficial!</p>
      </div>
    </div>
  );
}
