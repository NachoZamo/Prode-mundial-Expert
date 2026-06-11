import React, { useState, useEffect } from "react";
import { collection, doc, query, getDocs, getDoc, updateDoc, setDoc, deleteDoc, onSnapshot, writeBatch } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Match, Prediction, UserProfile, ReportLog } from "../types";
import { Database, Shield, Swords, Users, MessageSquareCode, Check, Trash2, Calendar, RefreshCw, Star, ShieldCheck } from "lucide-react";
import {
  isLocalDemoActive,
  getLocalMatches,
  getLocalUsers,
  getLocalReports,
  seedLocalMatchesReset,
  gradeLocalMatch,
  resolveLocalReport,
  deleteLocalReport,
  deleteLocalUser,
  saveLocalUser
} from "../localDb";
import { INITIAL_72_MATCHES } from "../initialMatches";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"matches" | "users" | "reports">("matches");
  const [matches, setMatches] = useState<Match[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<ReportLog[]>([]);
  
  // Loading & status alerts
  const [seeding, setSeeding] = useState(false);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Score states for results form
  const [scoreA, setScoreA] = useState<Record<string, string>>({});
  const [scoreB, setScoreB] = useState<Record<string, string>>({});
  const [matchStatus, setMatchStatus] = useState<Record<string, string>>({});

  // 1. Fetch Matches
  useEffect(() => {
    if (isLocalDemoActive()) {
      const loadLocalMatchesAdmin = () => {
        const list = getLocalMatches();
        const initA: Record<string, string> = {};
        const initB: Record<string, string> = {};
        const initStatus: Record<string, string> = {};

        list.forEach((m) => {
          initA[m.id] = m.resultA !== null ? String(m.resultA) : "";
          initB[m.id] = m.resultB !== null ? String(m.resultB) : "";
          initStatus[m.id] = m.status;
        });

        list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setMatches(list);
        setScoreA(initA);
        setScoreB(initB);
        setMatchStatus(initStatus);
      };

      loadLocalMatchesAdmin();
      window.addEventListener("local_matches_updated", loadLocalMatchesAdmin);
      return () => window.removeEventListener("local_matches_updated", loadLocalMatchesAdmin);
    }

    const unsub = onSnapshot(collection(db, "matches"), (snap) => {
      const list: Match[] = [];
      const initA: Record<string, string> = {};
      const initB: Record<string, string> = {};
      const initStatus: Record<string, string> = {};
      
      snap.forEach((d) => {
        const m = { id: d.id, ...d.data() } as Match;
        list.push(m);
        initA[m.id] = m.resultA !== null ? String(m.resultA) : "";
        initB[m.id] = m.resultB !== null ? String(m.resultB) : "";
        initStatus[m.id] = m.status;
      });

      // Sort chronologically
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setMatches(list);
      setScoreA(initA);
      setScoreB(initB);
      setMatchStatus(initStatus);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "matches");
    });
    return unsub;
  }, []);

  // 2. Fetch Users
  useEffect(() => {
    if (isLocalDemoActive()) {
      const loadLocalUsersAdmin = () => {
        setUsers(getLocalUsers());
      };
      loadLocalUsersAdmin();
      window.addEventListener("local_users_updated", loadLocalUsersAdmin);
      return () => window.removeEventListener("local_users_updated", loadLocalUsersAdmin);
    }

    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        list.push(d.data() as UserProfile);
      });
      setUsers(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "users");
    });
    return unsub;
  }, []);

  // 3. Fetch Reports
  useEffect(() => {
    if (isLocalDemoActive()) {
      const loadLocalReportsAdmin = () => {
        setReports(getLocalReports());
      };
      loadLocalReportsAdmin();
      window.addEventListener("local_reports_updated", loadLocalReportsAdmin);
      return () => window.removeEventListener("local_reports_updated", loadLocalReportsAdmin);
    }

    const unsub = onSnapshot(collection(db, "reports"), (snap) => {
      const list: ReportLog[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as ReportLog);
      });
      setReports(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "reports");
    });
    return unsub;
  }, []);

  // Initial standard seeder for 72 official group phase games
  const seedMatches = async () => {
    setSeeding(true);
    setStatusMsg(null);
    
    const seedSchedule: Match[] = INITIAL_72_MATCHES;

    try {
      if (isLocalDemoActive()) {
        seedLocalMatchesReset();
      } else {
        // Since there are 72 matches, let's seed them all
        const batchList = [];
        for (const game of seedSchedule) {
          const gameRef = doc(db, "matches", game.id);
          batchList.push(setDoc(gameRef, game));
        }
        await Promise.all(batchList);
        
        // Inject standard starter welcome alert automatically
        await setDoc(doc(db, "notifications", "welcome_broadcast"), {
          title: "¡Bienvenidos al Prode del Mundial 2026!",
          body: "¡Ya se encuentran activos los 72 partidos oficiales de la fase de grupos para predecir marcadores! Ingresa tus de manera colectiva e individual.",
          type: "alert",
          createdAt: new Date().toISOString()
        });
      }

      setStatusMsg({ text: "Partidos oficiales inicializados éxitosamente. Notificación de bienvenida disparada.", type: "success" });
    } catch (err) {
      console.error(err);
      setStatusMsg({ text: "Error de bases al intentar cargar partidos.", type: "error" });
    } finally {
      setSeeding(false);
    }
  };

  // Grade Predictions Engine
  const handleGradeMatch = async (matchId: string) => {
    const cleanA = scoreA[matchId];
    const cleanB = scoreB[matchId];
    
    if (cleanA === "" || cleanB === "") {
      setStatusMsg({ text: "Es necesario indicar el resultado final para cerrar el partido.", type: "error" });
      return;
    }

    const resA = parseInt(cleanA, 10);
    const resB = parseInt(cleanB, 10);
    const statusVal = matchStatus[matchId];

    setGradingId(matchId);
    setStatusMsg(null);

    try {
      if (isLocalDemoActive()) {
        gradeLocalMatch(matchId, resA, resB, statusVal);
      } else {
        // 1. Update the match outcomes
        const matchDocRef = doc(db, "matches", matchId);
        await updateDoc(matchDocRef, {
          resultA: resA,
          resultB: resB,
          status: statusVal
        });

        // 2. Query all users registered
        const usersSnap = await getDocs(collection(db, "users"));
        
        // We will loop each user, retrieve their prediction for this match if it exists, evaluate it, and update user statistics
        for (const uDoc of usersSnap.docs) {
          const userId = uDoc.id;
          const predRef = doc(db, "users", userId, "predictions", matchId);
          const predSnap = await getDoc(predRef);

          if (predSnap.exists()) {
            const pred = predSnap.data() as Prediction;
            let pointsEarned = 0;
            let exact = false;
            let outcomeCorrect = false;

            const prA = pred.predictedA;
            const prB = pred.predictedB;

            // Points distribution parameters
            if (prA === resA && prB === resB) {
              pointsEarned = 3;
              exact = true;
              outcomeCorrect = true;
            } else if (
              (prA > prB && resA > resB) ||
              (prA < prB && resA < resB) ||
              (prA === prB && resA === resB)
            ) {
              pointsEarned = 1;
              exact = false;
              outcomeCorrect = true;
            } else {
              pointsEarned = 0;
              exact = false;
              outcomeCorrect = false;
            }

            // Update the prediction record
            await updateDoc(predRef, {
              pointsEarned,
              exact,
              outcomeCorrect
            });
          }

          // 3. Recalculate full player statistics asynchronously
          const allPredsRef = collection(db, "users", userId, "predictions");
          const allPredsSnap = await getDocs(allPredsRef);
          
          let totalPoints = 0;
          let totalExact = 0;
          let totalCorrect = 0;

          allPredsSnap.forEach((prDoc) => {
            const prData = prDoc.data() as Prediction;
            totalPoints += prData.pointsEarned || 0;
            if (prData.exact) totalExact++;
            if (prData.outcomeCorrect) totalCorrect++;
          });

          // Update the central public profile doc
          const userDocRef = doc(db, "users", userId);
          await updateDoc(userDocRef, {
            globalPoints: totalPoints,
            globalExactScores: totalExact,
            globalCorrectOutcomes: totalCorrect
          });

          // 4. Propagate stats updates into ALL Private Groups the user belongs to
          const groupsSnap = await getDocs(collection(db, "groups"));
          for (const gDoc of groupsSnap.docs) {
            const groupId = gDoc.id;
            const memberDocRef = doc(db, "groups", groupId, "members", userId);
            const memberDocSnap = await getDoc(memberDocRef);

            if (memberDocSnap.exists()) {
              await updateDoc(memberDocRef, {
                points: totalPoints,
                exactScores: totalExact,
                correctOutcomes: totalCorrect
              });
            }
          }
        }
      }

      setStatusMsg({ text: `¡Partido evaluado con éxito! Se re-calcularon las posiciones de forma síncrona.`, type: "success" });
    } catch (err) {
      console.error(err);
      setStatusMsg({ text: "Ocurrió un error al liquidar y computar estadísticas de partidos.", type: "error" });
    } finally {
      setGradingId(null);
    }
  };

  // Resolve user-submitted report log
  const handleResolveReport = async (repId: string) => {
    try {
      if (isLocalDemoActive()) {
        resolveLocalReport(repId);
      } else {
        const repRef = doc(db, "reports", repId);
        await updateDoc(repRef, { status: "resolved" });
      }
      setStatusMsg({ text: "Reporte marcado como RESUELTO con éxito.", type: "success" });
    } catch (e) {
      console.error(e);
      setStatusMsg({ text: "Error de base de datos.", type: "error" });
    }
  };

  // Delete spam report
  const handleDeleteReport = async (repId: string) => {
    if (!window.confirm("¿Seguro que deseas borrar este reporte log?")) return;
    try {
      if (isLocalDemoActive()) {
        deleteLocalReport(repId);
      } else {
        await deleteDoc(doc(db, "reports", repId));
      }
      setStatusMsg({ text: "Reporte eliminado con éxito.", type: "success" });
    } catch (e) {
      console.error(e);
    }
  };

  // Moderate spam user profile
  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("¿Seguro que deseas eliminar definitivamente a este usuario del sistema?")) return;
    try {
      if (isLocalDemoActive()) {
        deleteLocalUser(userId);
      } else {
        await deleteDoc(doc(db, "users", userId));
      }
      setStatusMsg({ text: "Cuenta de usuario removida del sistema.", type: "success" });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-gray-100 max-w-md mx-auto h-full overflow-y-auto pb-24 font-sans bg-slate-950">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Shield className="w-5 h-5 text-yellow-450 animate-pulse" />
          <span>Súper Admin <span className="text-emerald-400">Control</span></span>
        </h2>
        <p className="text-xs text-slate-400">Control maestro de la aplicación y sistema del torneo</p>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-xl text-xs text-center border font-bold ${
          statusMsg.type === "success" 
            ? "bg-slate-900 text-emerald-400 border-emerald-500/20 shadow-sm" 
            : "bg-slate-900 text-rose-450 border-rose-900/30 shadow-sm"
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* Database Seeding utilities */}
      {matches.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl text-center flex flex-col gap-2">
          <Database className="w-8 h-8 text-yellow-450 mx-auto animate-bounce" />
          <h3 className="text-sm font-black text-white">Base de Partidos Vacía</h3>
          <p className="text-xs text-slate-400">Carga la grilla de encuentros iniciales del Mundial 2026 para activar los formularios de predicciones.</p>
          <button
            onClick={seedMatches}
            disabled={seeding}
            className="mt-2 bg-gradient-to-tr from-yellow-400 to-emerald-500 hover:from-yellow-300 hover:to-emerald-400 text-slate-950 font-black py-2.5 px-4 rounded-xl text-xs active:scale-95 transition-all w-full flex items-center justify-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${seeding ? "animate-spin" : ""}`} />
            <span>{seeding ? "Cargando grilla..." : "Inicializar Partidos Oficiales"}</span>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-slate-900 p-1.5 rounded-2xl gap-1.5 border border-slate-850">
        <button
          onClick={() => setActiveTab("matches")}
          className={`flex-1 py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === "matches" ? "bg-slate-950 border border-slate-800 text-yellow-450 shadow-md" : "text-slate-450 hover:text-white"
          }`}
        >
          <Swords className="w-3.5 h-3.5" />
          <span>Partidos</span>
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex-1 py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === "users" ? "bg-slate-950 border border-slate-800 text-yellow-450 shadow-md" : "text-slate-450 hover:text-white"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Usuarios</span>
        </button>
        <button
          onClick={() => setActiveTab("reports")}
          className={`flex-1 py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === "reports" ? "bg-slate-950 border border-slate-800 text-yellow-450 shadow-md" : "text-slate-450 hover:text-white"
          }`}
        >
          <MessageSquareCode className="w-3.5 h-3.5" />
          <span>Reportes</span>
        </button>
      </div>

      {/* Tab 1: Match Administration */}
      {activeTab === "matches" && (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Grilla de Partidos ({matches.length})</h3>
            {matches.length > 0 && (
              <button 
                onClick={seedMatches} 
                className="text-[10px] text-yellow-450 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                title="Re-seeding resets scheduled elements"
              >
                Re-cargar Partidos
              </button>
            )}
          </div>

          {matches.map((match) => (
            <div key={match.id} className="bg-slate-900 rounded-3xl p-4 border border-slate-800 shadow-xl flex flex-col gap-3 relative">
              {/* Info row */}
              <div className="flex justify-between items-center text-[10px] border-b border-slate-850 pb-2">
                <span className="font-extrabold text-yellow-450 uppercase tracking-widest">{match.group}</span>
                <span className="text-slate-550 font-bold">{match.id}</span>
              </div>

              {/* Soccer combat display */}
              <div className="grid grid-cols-7 items-center my-1.5">
                <div className="col-span-2 text-center flex flex-col items-center">
                  <span className="text-2xl select-none">{match.teamAFlag}</span>
                  <span className="text-xs font-black text-white mt-1.5 truncate max-w-full">{match.teamA}</span>
                </div>

                {/* Score admin fields */}
                <div className="col-span-3 flex items-center justify-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="-"
                    value={scoreA[match.id] || ""}
                    onChange={(e) => setScoreA({ ...scoreA, [match.id]: e.target.value.replace(/[^0-9]/g, "") })}
                    className="w-10 h-10 bg-slate-950 border border-slate-800 rounded-xl font-black text-center text-yellow-450 focus:outline-none focus:border-emerald-400 placeholder:text-slate-700"
                  />
                  <span className="text-slate-650 font-extrabold">:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="-"
                    value={scoreB[match.id] || ""}
                    onChange={(e) => setScoreB({ ...scoreB, [match.id]: e.target.value.replace(/[^0-9]/g, "") })}
                    className="w-10 h-10 bg-slate-950 border border-slate-800 rounded-xl font-black text-center text-yellow-450 focus:outline-none focus:border-emerald-400 placeholder:text-slate-700"
                  />
                </div>

                <div className="col-span-2 text-center flex flex-col items-center">
                  <span className="text-2xl select-none">{match.teamBFlag}</span>
                  <span className="text-xs font-black text-white mt-1.5 truncate max-w-full">{match.teamB}</span>
                </div>
              </div>

              {/* Status and Action strip */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-850 pt-2.5">
                <select
                  value={matchStatus[match.id] || "scheduled"}
                  onChange={(e) => setMatchStatus({ ...matchStatus, [match.id]: e.target.value })}
                  className="bg-slate-955 text-xs text-slate-300 border border-slate-800 rounded-xl px-2.5 py-1.8 focus:outline-none font-bold cursor-pointer"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="live">⚽ In-Game Live</option>
                  <option value="finished">🏁 Finished</option>
                </select>

                <button
                  onClick={() => handleGradeMatch(match.id)}
                  disabled={gradingId === match.id}
                  className="bg-gradient-to-tr from-yellow-400 to-emerald-500 hover:from-yellow-300 hover:to-emerald-400 disabled:opacity-50 text-slate-950 font-black text-[10px] px-3.5 py-2.2 rounded-xl flex items-center gap-1 select-none active:scale-95 transition-all shadow-md cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-slate-955" />
                  <span>{gradingId === match.id ? "Guardando..." : "Computar Puntos"}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: User Moderation */}
      {activeTab === "users" && (
        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1 mb-1">Directorio de Jugadores ({users.length})</h3>

          {users.map((u) => (
            <div key={u.id} className="bg-slate-900 rounded-2xl p-3.5 border border-slate-850 flex items-center justify-between hover:border-emerald-500/10 transition-all">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={u.photoURL}
                  alt={u.displayName}
                  className="w-10 h-10 rounded-full bg-slate-955 border border-slate-800 shrink-0 object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="truncate min-w-0">
                  <h4 className="text-xs font-extrabold text-white truncate flex items-center gap-1.5">
                    <span>{u.displayName}</span>
                    {u.role === "admin" && <span className="bg-yellow-950 text-yellow-405 font-black text-[8px] px-1.5 py-0.2 border border-yellow-90 rounded uppercase tracking-wider">Sys-Admin</span>}
                  </h4>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">{u.email}</p>
                  <p className="text-[10px] text-emerald-400 font-bold mt-1">
                    <span className="text-yellow-400">{u.globalPoints} Pts</span> • {u.globalExactScores} exactos • {u.globalCorrectOutcomes} resultados
                  </p>
                </div>
              </div>

              {u.email !== "ignaciozamorano@gmail.com" && (
                <button
                  onClick={() => handleDeleteUser(u.id)}
                  className="p-1.8 bg-slate-955 border border-slate-800 hover:bg-rose-950/20 text-slate-500 hover:text-rose-450 rounded-xl transition-all shrink-0 cursor-pointer"
                  title="Eliminar usuario"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Reports */}
      {activeTab === "reports" && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1 mb-1">Mesa de Ayuda y Reportes ({reports.length})</h3>

          {reports.length === 0 ? (
            <div className="bg-slate-900 rounded-3xl p-8 text-center border border-slate-850 text-xs text-slate-500 italic">
              No hay reportes de usuarios registrados.
            </div>
          ) : (
            reports.map((rep) => (
              <div key={rep.id} className="bg-slate-900 rounded-3xl p-4.5 border border-slate-850 flex flex-col gap-3 shadow-xl">
                <div className="flex justify-between items-start text-[10px] border-b border-slate-850 pb-2.5">
                  <div>
                    <span className="font-bold text-slate-500">Enviado por: </span>
                    <span className="font-black text-yellow-450">{rep.reporterName}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-lg font-black uppercase text-[8px] tracking-wider border ${
                    rep.status === "pending" 
                      ? "bg-rose-950/40 text-rose-350 border-rose-800" 
                      : "bg-emerald-950/40 text-emerald-300 border-emerald-850"
                  }`}>
                    {rep.status}
                  </span>
                </div>

                <p className="text-xs text-slate-350 leading-relaxed italic whitespace-pre-line pl-1">"{rep.content}"</p>

                <div className="flex justify-end gap-2 text-[10px] pt-2 border-t border-slate-850">
                  {rep.status === "pending" && (
                    <button
                      onClick={() => handleResolveReport(rep.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.8 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95 text-[10px]"
                    >
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>Resolver</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteReport(rep.id)}
                    className="bg-slate-950 hover:bg-slate-900 text-slate-400 font-bold px-3 py-1.8 rounded-xl flex items-center gap-1 border border-slate-800 transition-all cursor-pointer text-[10px]"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
