import React, { useState, useEffect } from "react";
import { collection, doc, query, where, getDocs, setDoc, onSnapshot, serverTimestamp, getDoc, deleteDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Group, GroupMember, UserProfile } from "../types";
import { Users, Plus, Key, Copy, Check, LogOut, Trophy, AlertTriangle, ShieldCheck } from "lucide-react";
import { isLocalDemoActive, getLocalGroups, getLocalMembers, saveLocalGroup, joinLocalGroup, leaveLocalGroup } from "../localDb";

interface GroupViewProps {
  currentUser: UserProfile;
}

export default function GroupView({ currentUser }: GroupViewProps) {
  const [joinedGroups, setJoinedGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  
  // Forms state
  const [newGroupName, setNewGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load all groups that user belongs to
  useEffect(() => {
    if (isLocalDemoActive()) {
      const loadLocalGroupsList = () => {
        const allGroups = getLocalGroups();
        const memberships = getLocalMembers();
        
        const joinedList: Group[] = [];
        allGroups.forEach((g) => {
          if (memberships.some((m) => m.groupId === g.id && m.userId === currentUser.id)) {
            joinedList.push({
              id: g.id,
              name: g.name,
              code: g.code,
              creatorId: g.creatorId,
              creatorName: g.creatorName,
              createdAt: new Date().toISOString()
            });
          }
        });
        
        setJoinedGroups(joinedList);

        if (selectedGroup) {
          const updatedSelected = joinedList.find(g => g.id === selectedGroup.id);
          if (updatedSelected) {
            setSelectedGroup(updatedSelected);
          } else {
            setSelectedGroup(null);
          }
        }
      };
      
      loadLocalGroupsList();
      window.addEventListener("local_groups_updated", loadLocalGroupsList);
      return () => window.removeEventListener("local_groups_updated", loadLocalGroupsList);
    }

    const q = query(collection(db, "groups"));
    const unsubGroups = onSnapshot(q, async (snapshot) => {
      const allGroups: Group[] = [];
      snapshot.forEach((doc) => {
        allGroups.push({ id: doc.id, ...doc.data() } as Group);
      });

      const joinedList: Group[] = [];
      for (const gp of allGroups) {
        const memRef = doc(db, "groups", gp.id, "members", currentUser.id);
        const memSnap = await getDoc(memRef).catch(() => null);
        if (memSnap && memSnap.exists()) {
          joinedList.push(gp);
        }
      }
      setJoinedGroups(joinedList);
      
      if (selectedGroup) {
        const updatedSelected = joinedList.find(g => g.id === selectedGroup.id);
        if (updatedSelected) {
          setSelectedGroup(updatedSelected);
        } else {
          setSelectedGroup(null);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "groups");
    });

    return unsubGroups;
  }, [currentUser.id, selectedGroup?.id]);

  // Read group members for active selected group
  useEffect(() => {
    if (!selectedGroup) {
      setGroupMembers([]);
      return;
    }

    if (isLocalDemoActive()) {
      const loadLocalGroupMembers = () => {
        const memberships = getLocalMembers();
        const filtered = memberships.filter((m) => m.groupId === selectedGroup.id);
        
        const membersData: GroupMember[] = filtered.map((m) => ({
          userId: m.userId,
          displayName: m.displayName,
          photoURL: m.photoURL,
          points: m.points,
          exactScores: m.exactScores,
          correctOutcomes: m.correctOutcomes,
          joinedAt: new Date().toISOString()
        }));

        membersData.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
          return b.correctOutcomes - a.correctOutcomes;
        });
        setGroupMembers(membersData);
      };

      loadLocalGroupMembers();
      window.addEventListener("local_groups_updated", loadLocalGroupMembers);
      window.addEventListener("local_users_updated", loadLocalGroupMembers);
      return () => {
        window.removeEventListener("local_groups_updated", loadLocalGroupMembers);
        window.removeEventListener("local_users_updated", loadLocalGroupMembers);
      };
    }

    const membersRef = collection(db, "groups", selectedGroup.id, "members");
    const unsubMembers = onSnapshot(membersRef, (snapshot) => {
      const membersData: GroupMember[] = [];
      snapshot.forEach((doc) => {
        membersData.push(doc.data() as GroupMember);
      });
      // Sort members by points descending, then exacts descending, then correct outcomes descending
      membersData.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
        return b.correctOutcomes - a.correctOutcomes;
      });
      setGroupMembers(membersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "groups/" + selectedGroup.id + "/members");
    });

    return unsubMembers;
  }, [selectedGroup]);

  // Generate 6-char unique uppercase code
  const generateInviteCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Create Group
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);

    const groupId = "g_" + Date.now();
    const code = generateInviteCode();

    const newGroup: Group = {
      id: groupId,
      name: newGroupName.trim(),
      code,
      creatorId: currentUser.id,
      creatorName: currentUser.displayName,
      createdAt: new Date().toISOString()
    };

    try {
      if (isLocalDemoActive()) {
        saveLocalGroup({
          id: groupId,
          name: newGroupName.trim(),
          code,
          creatorId: currentUser.id,
          creatorName: currentUser.displayName
        }, currentUser);
      } else {
        const groupDocRef = doc(db, "groups", groupId);
        // 1. Create the Group
        await setDoc(groupDocRef, newGroup);

        // 2. Join the creator as the first member
        const memberDocRef = doc(db, "groups", groupId, "members", currentUser.id);
        const firstMember: GroupMember = {
          userId: currentUser.id,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          points: currentUser.globalPoints,
          exactScores: currentUser.globalExactScores,
          correctOutcomes: currentUser.globalCorrectOutcomes,
          joinedAt: new Date().toISOString()
        };
        await setDoc(memberDocRef, firstMember);
      }

      setSuccess(`¡Grupo "${newGroup.name}" creado con éxito con código: ${code}!`);
      setNewGroupName("");
      setSelectedGroup(newGroup);
    } catch (err: any) {
      console.error(err);
      setError("Error al crear el grupo.");
    } finally {
      setLoading(false);
    }
  };

  // Join Group by Code
  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isLocalDemoActive()) {
        const localGroups = getLocalGroups();
        const found = localGroups.find((g) => g.code === cleanCode);
        if (!found) {
          setError("El código ingresado no corresponde a ningún grupo activo.");
          setLoading(false);
          return;
        }

        const targetGroup: Group = {
          id: found.id,
          name: found.name,
          code: found.code,
          creatorId: found.creatorId,
          creatorName: found.creatorName,
          createdAt: new Date().toISOString()
        };

        const memberships = getLocalMembers();
        const alreadyMember = memberships.some((m) => m.groupId === found.id && m.userId === currentUser.id);
        if (alreadyMember) {
          setError("Ya eres miembro de este grupo.");
          setSelectedGroup(targetGroup);
          setJoinCode("");
          setLoading(false);
          return;
        }

        joinLocalGroup(found, currentUser);
        setSuccess(`¡Te has unido exitosamente al grupo "${targetGroup.name}"!`);
        setJoinCode("");
        setSelectedGroup(targetGroup);
      } else {
        // Find group. Since code is 6 characters, let's query all groups to find the matching one
        const q = query(collection(db, "groups"), where("code", "==", cleanCode));
        const querySnap = await getDocs(q);

        if (querySnap.empty) {
          setError("El código ingresado no corresponde a ningún grupo activo.");
          setLoading(false);
          return;
        }

        // Found the group
        const groupDoc = querySnap.docs[0];
        const targetGroup = { id: groupDoc.id, ...groupDoc.data() } as Group;

        // Check if user is already a member
        const memberDocRef = doc(db, "groups", targetGroup.id, "members", currentUser.id);
        const memDocSnap = await getDoc(memberDocRef);

        if (memDocSnap.exists()) {
          setError("Ya eres miembro de este grupo.");
          setSelectedGroup(targetGroup);
          setJoinCode("");
          setLoading(false);
          return;
        }

        // Add to group members
        const newMember: GroupMember = {
          userId: currentUser.id,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          points: currentUser.globalPoints,
          exactScores: currentUser.globalExactScores,
          correctOutcomes: currentUser.globalCorrectOutcomes,
          joinedAt: new Date().toISOString()
        };
        await setDoc(memberDocRef, newMember);

        setSuccess(`¡Te has unido exitosamente al grupo "${targetGroup.name}"!`);
        setJoinCode("");
        setSelectedGroup(targetGroup);
      }
    } catch (err) {
      console.error(err);
      setError("Error al unirse al grupo.");
    } finally {
      setLoading(false);
    }
  };

  // Leave Group
  const handleLeaveGroup = async (groupId: string) => {
    if (!window.confirm("¿Seguro que deseas salir de este grupo de amigos?")) return;
    
    try {
      if (isLocalDemoActive()) {
        leaveLocalGroup(groupId, currentUser.id);
      } else {
        const memberDocRef = doc(db, "groups", groupId, "members", currentUser.id);
        await deleteDoc(memberDocRef);
      }
      setSelectedGroup(null);
      setSuccess("Has salido del grupo con éxito.");
    } catch (err) {
      console.error(err);
      setError("Error al salir de grupo.");
    }
  };

  // Copy code to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-gray-100 max-w-md mx-auto h-full overflow-y-auto pb-24 font-sans bg-slate-950">
      {/* Navigation Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-400" />
          <span>Grupos de <span className="text-emerald-400">Amigos</span></span>
        </h2>
        <p className="text-xs text-slate-400">Compite contra tus amigos de forma privada</p>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-805/85 rounded-xl text-rose-300 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-955/40 border border-emerald-800/50 rounded-xl text-emerald-300 text-xs flex gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Tabs (Join / Create / Active list) */}
      {!selectedGroup ? (
        <div className="flex flex-col gap-4">
          {/* Active groups list */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Mis Grupos Unidos</h3>
                 {joinedGroups.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs leading-relaxed">
                Todavía no estás en ningún grupo.<br />¡Únete ingresando un código o crea uno nuevo abajo!
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {joinedGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGroup(g)}
                    className="w-full flex items-center justify-between p-3.5 bg-slate-950/60 hover:bg-slate-800 border border-slate-850 hover:border-emerald-500/30 rounded-2xl text-left transition-all active:scale-98 cursor-pointer"
                  >
                    <div>
                      <h4 className="font-extrabold text-sm text-white">{g.name}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Código de entrada: <span className="font-mono text-yellow-400 font-bold tracking-wider">{g.code}</span></p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-950 bg-gradient-to-tr from-yellow-400 to-emerald-500 px-3 py-1.5 rounded-xl shadow-md">
                      <Trophy className="w-3.5 h-3.5 text-slate-950" />
                      <span>Ver Ranking</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Join Form */}
          <form onSubmit={handleJoinGroup} className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>Unirse con Código</span>
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Código de invitación (Ej: AMIGOS2)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                maxLength={10}
                className="grow bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-center text-sm font-mono font-black tracking-widest text-emerald-400 placeholder:text-slate-655 focus:outline-none focus:border-emerald-400 uppercase"
              />
              <button
                type="submit"
                disabled={loading || !joinCode.trim()}
                className="bg-gradient-to-tr from-yellow-400 to-emerald-500 hover:from-yellow-300 hover:to-emerald-400 active:scale-95 disabled:opacity-50 text-slate-950 px-5 rounded-xl font-black text-xs shrink-0 transition-all outline-none cursor-pointer"
              >
                Ingresar
              </button>
            </div>
          </form>

          {/* Create Form */}
          <form onSubmit={handleCreateGroup} className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Crear Grupo de Amigos</span>
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre del Grupo (Ej: Los Pibes)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                maxLength={40}
                className="grow bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-400"
              />
              <button
                type="submit"
                disabled={loading || !newGroupName.trim()}
                className="bg-gradient-to-tr from-yellow-400 to-emerald-500 hover:from-yellow-300 hover:to-emerald-400 active:scale-95 disabled:opacity-50 text-slate-950 px-5 rounded-xl font-black text-xs shrink-0 transition-all outline-none cursor-pointer"
              >
                Crear
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Expanded Active Group view */
        <div className="flex flex-col gap-4">
          {/* Back button and title */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => {
                setSelectedGroup(null);
                setSuccess(null);
                setError(null);
              }}
              className="text-xs text-slate-300 hover:text-white bg-slate-900 px-3.5 py-1.8 rounded-xl border border-slate-800 transition-all font-bold cursor-pointer"
            >
              ← Volver a Grupos
            </button>
            <button
              onClick={() => handleLeaveGroup(selectedGroup.id)}
              className="text-xs text-rose-450 hover:bg-rose-950/20 px-3.5 py-1.8 rounded-xl border border-rose-950/40 transition-all font-bold flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Abandonar</span>
            </button>
          </div>

          {/* Group details card */}
          <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900 rounded-3xl p-5 border border-emerald-500/10 shadow-lg">
            <span className="text-[9px] font-bold text-slate-955 bg-emerald-400 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Grupo Privado
            </span>
            <h3 className="text-xl font-black text-white mt-2 leading-none">{selectedGroup.name}</h3>
            <p className="text-xs text-slate-400 mt-1">Creador: <span className="font-bold text-emerald-400">{selectedGroup.creatorName}</span></p>

            <div className="bg-slate-950/90 p-3.5 rounded-2xl mt-4 flex items-center justify-between border border-slate-850">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Código para compartir:</span>
                <p className="text-lg font-mono font-black text-yellow-400 tracking-widest uppercase mt-0.5">{selectedGroup.code}</p>
              </div>
              <button
                onClick={() => copyToClipboard(selectedGroup.code)}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-750 flex items-center justify-center transition-all duration-300 cursor-pointer"
                title="Copiar Código"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400 animate-scale" /> : <Copy className="w-4 h-4 text-slate-400" />}
              </button>
            </div>
            {copied && <p className="text-[10px] text-emerald-400 text-center mt-1 font-semibold animate-pulse">¡Código copiado al portapapeles!</p>}
          </div>

          {/* Group standings list */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-yellow-450 animate-bounce" />
              <span>Tabla de Posiciones Privada</span>
            </h4>

            {groupMembers.length === 0 ? (
              <div className="text-center py-4 text-slate-500 text-xs">Cargando clasificación...</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {groupMembers.map((member, index) => {
                  const isUserSelf = member.userId === currentUser.id;
                  let medalColor = "text-slate-500";
                  if (index === 0) medalColor = "text-yellow-450";
                  else if (index === 1) medalColor = "text-slate-300";
                  else if (index === 2) medalColor = "text-amber-700";

                  return (
                    <div
                      key={member.userId}
                      className={`flex items-center justify-between p-2.5 rounded-xl transition-all border ${
                        isUserSelf 
                          ? "bg-slate-950 border-emerald-500/30 relative shadow-sm" 
                          : "bg-slate-950/40 border-transparent hover:border-slate-850"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Position */}
                        <div className="w-6 text-center text-xs font-black text-slate-450 flex items-center justify-center shrink-0">
                          {index < 3 ? (
                            <Trophy className={`w-4 h-4 ${medalColor}`} />
                          ) : (
                            <span>{index + 1}</span>
                          )}
                        </div>

                        {/* Avatar */}
                        <img
                          src={member.photoURL}
                          alt={member.displayName}
                          className="w-8 h-8 rounded-full border border-slate-800 shrink-0 object-cover bg-slate-950 select-none"
                          referrerPolicy="no-referrer"
                        />

                        {/* Member Name */}
                        <div className="truncate min-w-0">
                          <p className={`text-xs font-extrabold truncate ${isUserSelf ? "text-emerald-400" : "text-slate-200"}`}>
                            {member.displayName}
                            {isUserSelf && <span className="text-[8px] font-black bg-emerald-950/80 text-emerald-400 px-1.5 py-0.2 rounded ml-1.5 uppercase border border-emerald-900 tracking-widest">Tú</span>}
                          </p>
                          <p className="text-[9px] text-slate-500 truncate mt-0.5">
                            {member.exactScores} exactos • {member.correctOutcomes} resultados
                          </p>
                        </div>
                      </div>

                      {/* Points score */}
                      <div className="text-right shrink-0">
                        <span className="text-sm font-extrabold text-yellow-450 text-yellow-400">{member.points}</span>
                        <span className="text-[8px] ml-0.5 text-slate-550 font-bold uppercase tracking-wider">Pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
