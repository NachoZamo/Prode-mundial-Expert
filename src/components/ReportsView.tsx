import React, { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, query, where } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { ReportLog, UserProfile } from "../types";
import { Send, MessageSquare, ShieldAlert, History, Key, CheckCircle } from "lucide-react";
import { isLocalDemoActive, getLocalReports, saveLocalReport } from "../localDb";

interface ReportsViewProps {
  currentUser: UserProfile;
}

export default function ReportsView({ currentUser }: ReportsViewProps) {
  const [reports, setReports] = useState<ReportLog[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Load user's reports in real-time
  useEffect(() => {
    if (isLocalDemoActive()) {
      const loadLocalReportsList = () => {
        const allReports = getLocalReports();
        const filtered = allReports.filter((r) => r.reporterId === currentUser.id);
        filtered.sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime());
        setReports(filtered);
      };
      loadLocalReportsList();
      window.addEventListener("local_reports_updated", loadLocalReportsList);
      return () => window.removeEventListener("local_reports_updated", loadLocalReportsList);
    }

    const q = query(collection(db, "reports"), where("reporterId", "==", currentUser.id));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: ReportLog[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as ReportLog);
      });
      // Sort reports by creation date (descending)
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReports(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "reports");
    });
    return unsub;
  }, [currentUser.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    setStatus(null);

    try {
      if (isLocalDemoActive()) {
        saveLocalReport({
          id: "local_rep_" + Date.now(),
          reporterId: currentUser.id,
          reporterName: currentUser.displayName,
          content: content.trim(),
          createdAt: new Date().toISOString(),
          status: "pending"
        });
      } else {
        try {
          await addDoc(collection(db, "reports"), {
            reporterId: currentUser.id,
            reporterName: currentUser.displayName,
            content: content.trim(),
            createdAt: new Date().toISOString(),
            status: "pending"
          });
        } catch (addError) {
          handleFirestoreError(addError, OperationType.CREATE, "reports");
          return;
        }
      }

      setContent("");
      setStatus("Tu reporte ha sido enviado al Administrador.");
      setTimeout(() => setStatus(null), 4000);
    } catch (err) {
      console.error(err);
      setStatus("Error al enviar reporte.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-gray-100 max-w-md mx-auto h-full overflow-y-auto pb-24 font-sans bg-slate-950">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-emerald-400" />
          <span>Soporte y <span className="text-emerald-400">Reportes</span></span>
        </h2>
        <p className="text-xs text-slate-400">Envía comentarios, denuncias o solicita soporte técnico</p>
      </div>

      {/* PWA Manual Installation Guide Card */}
      <div className="bg-slate-900 border border-slate-850 rounded-3xl p-4 shadow-xl flex flex-col gap-2.5">
        <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>¡Acceso Directo en tu Celular!</span>
        </h3>
        <p className="text-[11px] text-slate-300 leading-normal font-semibold">
          Podés instalar esta aplicación como una App nativa (PWA) en la pantalla de inicio de tu teléfono para jugar y simular al instante sin abrir el navegador.
        </p>
        <div className="border-t border-slate-800/80 pt-2 flex flex-col gap-2 text-[11px]">
          <div className="flex items-start gap-2">
            <span className="bg-emerald-950 text-emerald-400 font-extrabold w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px]">A</span>
            <div className="leading-snug">
              <span className="font-extrabold text-white">Android / Chrome:</span> Tocá el botón <span className="text-emerald-400">"Instalar"</span> en la pantalla principal o presioná <span className="font-extrabold text-emerald-400">"Instalar Aplicación"</span> en los tres puntos de Chrome.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="bg-emerald-950 text-emerald-400 font-extrabold w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px]">I</span>
            <div className="leading-snug">
              <span className="font-extrabold text-white">iPhone / iOS (Safari):</span> Abrí {window.location.host ? window.location.origin : "el enlace"} en Safari, tocá <span className="text-indigo-400">Compartir</span> abajo y seleccioná <span className="font-extrabold text-white">"Agregar a inicio"</span>.
            </div>
          </div>
        </div>
      </div>

      {status && (
        <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl text-emerald-400 text-xs text-center font-bold">
          {status}
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="bg-slate-900 rounded-3xl p-4 border border-slate-800 shadow-xl flex flex-col gap-3">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
          <ShieldAlert className="w-4 h-4 text-emerald-400" />
          <span>Redactar Mensaje</span>
        </h3>

        <textarea
          placeholder="Describe tu consulta, reporta un grupo inapropiado, o cuéntanos si encontraste un error en el sistema..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
          required
          rows={4}
          className="bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-3 text-xs text-white placeholder:text-slate-650 focus:outline-none focus:border-emerald-400 font-bold leading-relaxed resize-none"
        />

        <div className="flex justify-between items-center mt-1">
          <span className="text-[10px] text-slate-500 font-bold">Máximo 1000 caracteres</span>
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="bg-gradient-to-tr from-yellow-400 to-emerald-500 hover:from-yellow-300 hover:to-emerald-400 disabled:opacity-50 active:scale-95 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5 text-slate-955" />
            <span>Enviar Reporte</span>
          </button>
        </div>
      </form>

      {/* Submitted reports logs */}
      <div className="bg-slate-900 rounded-3xl p-4 border border-slate-800 shadow-xl">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <History className="w-4 h-4 text-emerald-400" />
          <span>Historial de Consultas ({reports.length})</span>
        </h3>

        {reports.length === 0 ? (
          <p className="text-xs text-center text-slate-500 py-4">No has enviado ningún reporte todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {reports.map((rep) => (
              <div key={rep.id} className="p-3 bg-slate-950/60 rounded-xl border border-slate-850 flex flex-col gap-2 relative">
                <div className="flex justify-between items-center text-[9px] border-b border-slate-850 pb-1.5">
                  <span className="text-slate-500 font-bold">{new Date(rep.createdAt).toLocaleDateString("es-ES")}</span>
                  <span className={`px-2 py-0.5 rounded font-black uppercase text-[8px] border shrink-0 tracking-wider ${
                    rep.status === "pending" 
                      ? "bg-rose-950/40 text-rose-350 border-rose-950/60" 
                      : "bg-emerald-950/40 text-emerald-400 border-emerald-950/60"
                  }`}>
                    {rep.status === "pending" ? "Pendiente" : "Resuelto"}
                  </span>
                </div>
                
                <p className="text-xs text-slate-305 leading-relaxed mb-1 font-bold">"{rep.content}"</p>
                
                {rep.status === "resolved" && (
                  <div className="text-[9px] text-emerald-400 font-bold flex items-center gap-1 bg-emerald-950/20 py-1.5 px-2.5 rounded-xl border border-emerald-950/30">
                    <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>Administrador resolvió tu consulta.</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
