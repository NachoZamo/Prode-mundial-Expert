import React, { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, doc, deleteDoc, query, orderBy, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { NotificationAlert, UserProfile } from "../types";
import { Bell, Megaphone, Clock, Send, Trash2, AlertCircle, ShieldAlert } from "lucide-react";
import { isLocalDemoActive, getLocalNotifications, saveLocalNotification, deleteLocalNotification } from "../localDb";

interface NotificationsFeedProps {
  currentUser: UserProfile;
}

export default function NotificationsFeed({ currentUser }: NotificationsFeedProps) {
  const [notifications, setNotifications] = useState<NotificationAlert[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<"alert" | "match_reminder" | "ranking_update">("alert");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const isAdmin = currentUser.role === "admin";

  useEffect(() => {
    if (isLocalDemoActive()) {
      const loadLocalNotesList = () => {
        const notes = getLocalNotifications();
        notes.sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime());
        setNotifications(notes);
      };
      loadLocalNotesList();
      window.addEventListener("local_notes_updated", loadLocalNotesList);
      return () => window.removeEventListener("local_notes_updated", loadLocalNotesList);
    }

    // Read notifications sorted by date descending, limit to 25
    const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(25));
    const unsub = onSnapshot(q, (snapshot) => {
      const notes: NotificationAlert[] = [];
      snapshot.forEach((doc) => {
        notes.push({ id: doc.id, ...doc.data() } as NotificationAlert);
      });
      setNotifications(notes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "notifications");
    });
    return unsub;
  }, []);

  // Post new notification alert (admin only)
  const handlePostNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!title.trim() || !body.trim()) return;

    setLoading(true);
    setStatus(null);

    try {
      if (isLocalDemoActive()) {
        saveLocalNotification({
          id: "local_note_" + Date.now(),
          title: title.trim(),
          body: body.trim(),
          type,
          createdAt: new Date().toISOString()
        });
      } else {
        try {
          await addDoc(collection(db, "notifications"), {
            title: title.trim(),
            body: body.trim(),
            type,
            createdAt: new Date().toISOString()
          });
        } catch (addError) {
          handleFirestoreError(addError, OperationType.CREATE, "notifications");
          return;
        }
      }

      setTitle("");
      setBody("");
      setStatus("Notificación enviada con éxito.");
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setStatus("Error de permisos o conexión al enviar.");
    } finally {
      setLoading(false);
    }
  };

  // Delete notification (admin only)
  const handleDeleteNotification = async (noteId: string) => {
    if (!isAdmin) return;
    if (!window.confirm("¿Seguro que deseas eliminar esta notificación?")) return;

    try {
      if (isLocalDemoActive()) {
        deleteLocalNotification(noteId);
      } else {
        try {
          await deleteDoc(doc(db, "notifications", noteId));
        } catch (delError) {
          handleFirestoreError(delError, OperationType.DELETE, `notifications/${noteId}`);
          return;
        }
      }
    } catch (err) {
      console.error("Error deleting", err);
    }
  };

  const getBadgeStyle = (noteType: string) => {
    switch (noteType) {
      case "alert":
        return "bg-rose-950/60 text-rose-300 border-rose-900";
      case "match_reminder":
        return "bg-emerald-950/60 text-emerald-300 border-emerald-900";
      case "ranking_update":
        return "bg-amber-950/60 text-amber-300 border-amber-900";
      default:
        return "bg-slate-850 text-slate-300 border-slate-700";
    }
  };

  const getTypeName = (noteType: string) => {
    switch (noteType) {
      case "alert": return "Último Momento";
      case "match_reminder": return "Recordatorio";
      case "ranking_update": return "Puntajes";
      default: return "Aviso";
    }
  };

  const formatTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return "Hace instantes";
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-gray-100 max-w-md mx-auto h-full overflow-y-auto pb-24 font-sans bg-slate-950">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Bell className="w-5 h-5 text-emerald-400" />
          <span>Notificaciones <span className="text-emerald-400">Push</span></span>
        </h2>
        <p className="text-xs text-slate-400">Canal exclusivo de noticias y alertas del Mundial 2026</p>
      </div>

      {status && (
        <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl text-emerald-400 text-xs text-center font-bold">
          {status}
        </div>
      )}

      {/* Admin Broadcast Utility */}
      {isAdmin && (
        <form onSubmit={handlePostNotification} className="bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/10 rounded-3xl p-4 shadow-xl flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-xs uppercase tracking-wider">
            <Megaphone className="w-4 h-4 text-emerald-400 animate-bounce" />
            <span>Emitir Alerta Súper Admin</span>
          </div>

          <div className="flex flex-col gap-2.5 mt-1">
            <input
              type="text"
              placeholder="Título de la alerta"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white placeholder:text-slate-650 focus:outline-none focus:border-emerald-400"
            />
            
            <textarea
              placeholder="Describa el anuncio..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={500}
              rows={2}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white placeholder:text-slate-650 focus:outline-none focus:border-emerald-400 resize-none"
            />

            <div className="flex items-center justify-between gap-2 mt-1">
              <select
                value={type}
                onChange={(e: any) => setType(e.target.value)}
                className="bg-slate-950 text-xs text-slate-350 font-bold py-2 px-3 border border-slate-800 rounded-xl focus:outline-none focus:border-emerald-400 cursor-pointer"
              >
                <option value="alert">🚨 Alerta Urgente</option>
                <option value="match_reminder">⚽ Recordatorio Partidos</option>
                <option value="ranking_update">🏆 Actualización Tabla</option>
              </select>

              <button
                type="submit"
                disabled={loading || !title.trim() || !body.trim()}
                className="bg-gradient-to-tr from-yellow-400 to-emerald-500 hover:from-yellow-300 hover:to-emerald-400 active:scale-95 disabled:opacity-50 text-slate-950 py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 font-black text-xs transition-all shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-slate-950" />
                <span>Emitir</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* List Feed */}
      <div className="flex flex-col gap-3">
        {notifications.length === 0 ? (
          <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-md text-center">
            <Clock className="w-8 h-8 text-slate-650 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-405">Canal vacío</p>
            <p className="text-xs text-slate-500 mt-1">No se han emitido alertas en el canal por ahora.</p>
          </div>
        ) : (
          notifications.map((note) => (
            <div
              key={note.id}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-md flex gap-3 relative hover:border-emerald-500/10 transition-all"
            >
              <div className="flex flex-col gap-2 grow">
                <div className="flex justify-between items-start gap-2">
                  <span className={`text-[9px] font-black px-2.5 py-1 rounded-xl border ${getBadgeStyle(note.type)}`}>
                    {getTypeName(note.type)}
                  </span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1.5 font-bold">
                    <Clock className="w-3 h-3 text-slate-600" />
                    <span>{formatTime(note.createdAt)}</span>
                  </span>
                </div>

                <div className="pr-4 mt-1.5">
                  <h4 className="text-xs font-extrabold text-white">{note.title}</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed whitespace-pre-line">{note.body}</p>
                </div>
              </div>

              {isAdmin && (
                <button
                  onClick={() => handleDeleteNotification(note.id)}
                  className="absolute right-3.5 bottom-3.5 text-slate-550 hover:text-rose-450 p-1.5 rounded-lg hover:bg-slate-950/60 transition-all cursor-pointer border border-transparent hover:border-slate-850"
                  title="Eliminar Alerta"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
