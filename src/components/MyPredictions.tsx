import React, { useState, useEffect } from "react";
import { collection, onSnapshot, doc, setDoc, query, getDocs, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Match, Prediction, UserProfile } from "../types";
import { Calendar, MapPin, Save, Lock, AlertTriangle, CheckCircle, Smartphone } from "lucide-react";
import { isLocalDemoActive, getLocalMatches, getUserLocalPredictions, saveLocalPrediction } from "../localDb";

interface MyPredictionsProps {
  currentUser: UserProfile;
}

export default function MyPredictions({ currentUser }: MyPredictionsProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [tempScores, setTempScores] = useState<Record<string, { a: string; b: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ matchId: string; type: "success" | "error"; text: string } | null>(null);

  // Read matches in real-time
  useEffect(() => {
    if (isLocalDemoActive()) {
      const loadLocalMatches = () => {
        const matchData = getLocalMatches();
        matchData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setMatches(matchData);
      };
      loadLocalMatches();
      window.addEventListener("local_matches_updated", loadLocalMatches);
      return () => window.removeEventListener("local_matches_updated", loadLocalMatches);
    }

    const unsub = onSnapshot(collection(db, "matches"), (snapshot) => {
      const matchData: Match[] = [];
      snapshot.forEach((doc) => {
        matchData.push({ id: doc.id, ...doc.data() } as Match);
      });
      // Sort chronologically
      matchData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setMatches(matchData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "matches");
    });
    return unsub;
  }, []);

  // Read predictions in real-time
  useEffect(() => {
    if (isLocalDemoActive()) {
      const loadLocalPreds = () => {
        const userPreds = getUserLocalPredictions(currentUser.id);
        const tempVals: Record<string, { a: string; b: string }> = {};
        Object.entries(userPreds).forEach(([mId, pred]) => {
          tempVals[mId] = {
            a: String(pred.predictedA),
            b: String(pred.predictedB)
          };
        });
        setPredictions(userPreds);
        setTempScores((prev) => ({ ...prev, ...tempVals }));
      };
      loadLocalPreds();
      window.addEventListener("local_preds_updated", loadLocalPreds);
      return () => window.removeEventListener("local_preds_updated", loadLocalPreds);
    }

    const predictionsRef = collection(db, "users", currentUser.id, "predictions");
    const unsub = onSnapshot(predictionsRef, (snapshot) => {
      const userPreds: Record<string, Prediction> = {};
      const tempVals: Record<string, { a: string; b: string }> = {};
      
      snapshot.forEach((doc) => {
        const pred = doc.data() as Prediction;
        userPreds[doc.id] = pred;
        tempVals[doc.id] = {
          a: String(pred.predictedA),
          b: String(pred.predictedB)
        };
      });
      setPredictions(userPreds);
      setTempScores((prev) => ({ ...prev, ...tempVals }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "users/" + currentUser.id + "/predictions");
    });
    return unsub;
  }, [currentUser.id]);

  // Handle score change
  const handleScoreChange = (matchId: string, team: "a" | "b", val: string) => {
    // Only numbers
    const cleanVal = val.replace(/[^0-9]/g, "");
    setTempScores((prev) => {
      const current = prev[matchId] || { a: "", b: "" };
      return {
        ...prev,
        [matchId]: {
          a: current.a,
          b: current.b,
          [team]: cleanVal
        }
      };
    });
  };

  // Quick increment/decrement buttons for mobile tapping
  const handleScoreIncrement = (matchId: string, team: "a" | "b", increment: number) => {
    const curr = tempScores[matchId] || { a: "0", b: "0" };
    const num = parseInt(curr[team] || "0", 10) + increment;
    const finalVal = Math.max(0, Math.min(99, num));
    setTempScores((prev) => {
      const current = prev[matchId] || { a: "0", b: "0" };
      return {
        ...prev,
        [matchId]: {
          a: current.a,
          b: current.b,
          [team]: String(finalVal)
        }
      };
    });
  };

  // Check if a match has already started
  const isMatchStarted = (match: Match) => {
    return match.status !== "scheduled" || new Date(match.date).getTime() < Date.now();
  };

  // Format date helper
  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString("es-ES", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }) + " hs";
  };

  // Save single prediction
  const savePrediction = async (matchId: string) => {
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    if (isMatchStarted(match)) {
      setStatusMessage({ matchId, type: "error", text: "¡El partido ya ha comenzado! No se permiten cambios." });
      return;
    }

    const scores = tempScores[matchId] || { a: "", b: "" };
    if (scores.a === "" || scores.b === "") {
      setStatusMessage({ matchId, type: "error", text: "Por favor carga ambos marcadores." });
      return;
    }

    const valA = parseInt(scores.a, 10);
    const valB = parseInt(scores.b, 10);

    setSavingId(matchId);
    setStatusMessage(null);

    try {
      if (isLocalDemoActive()) {
        saveLocalPrediction(currentUser.id, matchId, {
          matchId,
          predictedA: valA,
          predictedB: valB,
          pointsEarned: 0,
          exact: false,
          outcomeCorrect: false,
          updatedAt: new Date().toISOString()
        });
      } else {
        const predDocRef = doc(db, "users", currentUser.id, "predictions", matchId);
        try {
          await setDoc(predDocRef, {
            matchId,
            predictedA: valA,
            predictedB: valB,
            pointsEarned: 0,
            exact: false,
            outcomeCorrect: false,
            updatedAt: new Date().toISOString()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.id}/predictions/${matchId}`);
        }
      }

      setStatusMessage({ matchId, type: "success", text: "Pronóstico guardado exitosamente." });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setStatusMessage({ matchId, type: "error", text: "Error de permisos o conexión al guardar." });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-gray-100 max-w-md mx-auto h-full overflow-y-auto pb-24 font-sans bg-slate-950">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Mis <span className="text-emerald-400">Pronósticos</span>
          </h2>
          <p className="text-xs text-slate-400">Completa o edita tus jugadas antes de cada partido</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs text-yellow-400 font-bold shrink-0">
          <Smartphone className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
          <span>Móvil PRO</span>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="bg-slate-900/50 rounded-2xl p-8 text-center border border-slate-800 mt-10">
          <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2 animate-bounce" />
          <p className="text-sm font-semibold text-white">No hay partidos cargados</p>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">El administrador debe inicializar los partidos del Mundial 2026 en el panel de administración.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {matches.map((match) => {
            const hasStarted = isMatchStarted(match);
            const savedPred = predictions[match.id];
            const currentScores = tempScores[match.id] || { a: "", b: "" };
            const isModified = savedPred 
              ? (parseInt(currentScores.a, 10) !== savedPred.predictedA || parseInt(currentScores.b, 10) !== savedPred.predictedB)
              : (currentScores.a !== "" && currentScores.b !== "");

            return (
              <div 
                key={match.id} 
                className={`bg-slate-900/50 rounded-2xl p-4 border border-slate-800 shadow-md relative overflow-hidden transition-all duration-300 ${
                  hasStarted ? "opacity-80 border-slate-900" : "hover:border-emerald-500/40"
                }`}
              >
                {/* Match Status Strip */}
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {match.group}
                  </span>
                  
                  {hasStarted ? (
                    <div className="flex items-center gap-1 text-slate-400 text-xs font-semibold bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-800">
                      <Lock className="w-3 h-3 text-rose-500" />
                      <span>Cerrado</span>
                    </div>
                  ) : (
                    <div className="text-xs font-bold text-emerald-400 animate-pulse bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-900/40">
                      Abierto
                    </div>
                  )}
                </div>

                {/* Match teams and scoring container */}
                <div className="grid grid-cols-7 items-center justify-center py-2 relative">
                  {/* Team A */}
                  <div className="col-span-2 text-center flex flex-col items-center">
                    <span className="text-3xl mb-1 filter drop-shadow-sm select-none">{match.teamAFlag}</span>
                    <span className="text-xs font-black text-slate-200 truncate max-w-[70px]" title={match.teamA}>
                      {match.teamA}
                    </span>
                  </div>

                  {/* Prediction Inputs */}
                  <div className="col-span-3 flex items-center justify-center gap-1.5">
                    {/* Input A */}
                    <div className="flex flex-col items-center gap-1">
                      {!hasStarted && (
                        <button 
                          onClick={() => handleScoreIncrement(match.id, "a", 1)}
                          className="w-8 h-5.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 active:bg-slate-950 rounded text-xs flex items-center justify-center text-slate-300 font-bold"
                        >
                          +
                        </button>
                      )}
                      <input 
                        type="text" 
                        inputMode="numeric"
                        value={currentScores.a || ""} 
                        onChange={(e) => handleScoreChange(match.id, "a", e.target.value)}
                        disabled={hasStarted}
                        placeholder="-"
                        className={`w-9.5 h-9.5 bg-slate-950 border text-center font-black rounded-lg text-base text-yellow-400 focus:outline-none focus:border-emerald-400 select-all ${
                          hasStarted ? "border-slate-900 bg-slate-900 text-slate-500" : "border-slate-800"
                        }`}
                      />
                      {!hasStarted && (
                        <button 
                          onClick={() => handleScoreIncrement(match.id, "a", -1)}
                          className="w-8 h-5.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 active:bg-slate-950 rounded text-xs flex items-center justify-center text-slate-300 font-bold"
                        >
                          -
                        </button>
                      )}
                    </div>

                    <span className="text-slate-600 font-extrabold mt-1 text-md select-none">:</span>

                    {/* Input B */}
                    <div className="flex flex-col items-center gap-1">
                      {!hasStarted && (
                        <button 
                          onClick={() => handleScoreIncrement(match.id, "b", 1)}
                          className="w-8 h-5.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 active:bg-slate-950 rounded text-xs flex items-center justify-center text-slate-300 font-bold"
                        >
                          +
                        </button>
                      )}
                      <input 
                        type="text" 
                        inputMode="numeric"
                        value={currentScores.b || ""} 
                        onChange={(e) => handleScoreChange(match.id, "b", e.target.value)}
                        disabled={hasStarted}
                        placeholder="-"
                        className={`w-9.5 h-9.5 bg-slate-950 border text-center font-black rounded-lg text-base text-yellow-400 focus:outline-none focus:border-emerald-400 select-all ${
                          hasStarted ? "border-slate-900 bg-slate-900 text-slate-500" : "border-slate-800"
                        }`}
                      />
                      {!hasStarted && (
                        <button 
                          onClick={() => handleScoreIncrement(match.id, "b", -1)}
                          className="w-8 h-5.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 active:bg-slate-950 rounded text-xs flex items-center justify-center text-slate-300 font-bold"
                        >
                          -
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Team B */}
                  <div className="col-span-2 text-center flex flex-col items-center">
                    <span className="text-3xl mb-1 filter drop-shadow-sm select-none">{match.teamBFlag}</span>
                    <span className="text-xs font-black text-slate-200 truncate max-w-[70px]" title={match.teamB}>
                      {match.teamB}
                    </span>
                  </div>
                </div>

                {/* Match date and location details */}
                <div className="mt-3 flex flex-col gap-1 border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{formatDate(match.date)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span className="truncate">{match.stadium}</span>
                  </div>
                </div>

                {/* Actual game result display */}
                {match.status === "finished" && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 mt-3 flex justify-between items-center">
                    <div className="text-xs font-semibold text-slate-300">
                      Resultado Oficial: <span className="text-yellow-450 font-extrabold text-sm ml-1 text-yellow-400">{match.resultA} - {match.resultB}</span>
                    </div>
                    {savedPred && (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Obtenido</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 ${
                          savedPred.pointsEarned === 3 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" :
                          savedPred.pointsEarned === 1 ? "bg-yellow-450/10 text-yellow-400 border border-yellow-400/30" :
                          "bg-slate-950 text-slate-500 border border-slate-850"
                        }`}>
                          {savedPred.pointsEarned === 3 ? "+3 Pts (Exacto)" : 
                           savedPred.pointsEarned === 1 ? "+1 Pt (Resultado)" : 
                           "0 Pts (Errado)"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Saving / Status Messages and buttons */}
                <div className="mt-3">
                  {statusMessage && statusMessage.matchId === match.id && (
                    <div className={`p-2.5 rounded-xl text-center text-xs mb-2 transition-all font-semibold ${
                      statusMessage.type === "success" 
                        ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/50" 
                        : "bg-rose-955/40 text-rose-300 border border-rose-800/50"
                    }`}>
                      {statusMessage.text}
                    </div>
                  )}

                  {!hasStarted && (
                    <div className="flex gap-2">
                      {savedPred ? (
                        <div className="grow text-xs text-slate-300 bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/20 flex items-center justify-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-semibold">Jugado: <b className="text-emerald-400">{savedPred.predictedA} - {savedPred.predictedB}</b></span>
                        </div>
                      ) : (
                        <div className="grow text-xs text-yellow-500 bg-yellow-400/5 p-2 rounded-xl border border-yellow-400/20 flex items-center justify-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-yellow-500" />
                          <span className="font-bold">Falta pronóstico</span>
                        </div>
                      )}

                      <button
                        onClick={() => savePrediction(match.id)}
                        disabled={savingId === match.id || !isModified}
                        className={`px-4 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all outline-none ${
                          isModified 
                            ? "bg-gradient-to-tr from-yellow-400 to-emerald-500 text-slate-950 hover:from-yellow-300 hover:to-emerald-400 active:scale-95 shadow-md shadow-emerald-500/10 cursor-pointer" 
                            : "bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed"
                        }`}
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingId === match.id ? "Guardando" : "Guardar"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
