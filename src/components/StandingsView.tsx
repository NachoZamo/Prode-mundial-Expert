import React, { useState, useEffect } from "react";
import { collection, doc, query, onSnapshot, getDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { UserProfile, Group, GroupMember } from "../types";
import { Trophy, Flame, Award, Users } from "lucide-react";
import { isLocalDemoActive, getLocalUsers, getLocalGroups, getLocalMembers } from "../localDb";

interface StandingsViewProps {
  currentUser: UserProfile;
}

export default function StandingsView({ currentUser }: StandingsViewProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<"ranking" | "grupos">("ranking");

  // Groups and members states
  const [joinedGroups, setJoinedGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<GroupMember[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Load global users list
  useEffect(() => {
    if (isLocalDemoActive()) {
      const loadLocalUsersList = () => {
        const usersData = getLocalUsers();
        usersData.sort((a, b) => {
          if (b.globalPoints !== a.globalPoints) return b.globalPoints - a.globalPoints;
          if (b.globalExactScores !== a.globalExactScores) return b.globalExactScores - a.globalExactScores;
          return b.globalCorrectOutcomes - a.globalCorrectOutcomes;
        });
        setUsers(usersData);
      };
      loadLocalUsersList();
      window.addEventListener("local_users_updated", loadLocalUsersList);
      return () => window.removeEventListener("local_users_updated", loadLocalUsersList);
    }

    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersData: UserProfile[] = [];
      snapshot.forEach((doc) => {
        usersData.push(doc.data() as UserProfile);
      });
      // Sort users by global points, then exact scores, then correct outcomes
      usersData.sort((a, b) => {
        if (b.globalPoints !== a.globalPoints) return b.globalPoints - a.globalPoints;
        if (b.globalExactScores !== a.globalExactScores) return b.globalExactScores - a.globalExactScores;
        return b.globalCorrectOutcomes - a.globalCorrectOutcomes;
      });
      setUsers(usersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "users");
    });
    return unsub;
  }, []);

  // Load user's joined groups
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
      };
      
      loadLocalGroupsList();
      window.addEventListener("local_groups_updated", loadLocalGroupsList);
      return () => window.removeEventListener("local_groups_updated", loadLocalGroupsList);
    }

    setLoadingGroups(true);
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
      setLoadingGroups(false);
    }, (error) => {
      setLoadingGroups(false);
      handleFirestoreError(error, OperationType.LIST, "groups");
    });

    return unsubGroups;
  }, [currentUser.id]);

  // Set default selected group when groups load
  useEffect(() => {
    if (joinedGroups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(joinedGroups[0].id);
    }
  }, [joinedGroups, selectedGroupId]);

  // Load members of selected group
  useEffect(() => {
    if (!selectedGroupId) {
      setSelectedGroupMembers([]);
      return;
    }

    if (isLocalDemoActive()) {
      const loadLocalGroupMembers = () => {
        const memberships = getLocalMembers();
        const filtered = memberships.filter((m) => m.groupId === selectedGroupId);
        
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
        setSelectedGroupMembers(membersData);
      };

      loadLocalGroupMembers();
      window.addEventListener("local_groups_updated", loadLocalGroupMembers);
      window.addEventListener("local_users_updated", loadLocalGroupMembers);
      return () => {
        window.removeEventListener("local_groups_updated", loadLocalGroupMembers);
        window.removeEventListener("local_users_updated", loadLocalGroupMembers);
      };
    }

    const membersRef = collection(db, "groups", selectedGroupId, "members");
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
      setSelectedGroupMembers(membersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "groups/" + selectedGroupId + "/members");
    });

    return unsubMembers;
  }, [selectedGroupId]);

  const selectedGroup = joinedGroups.find((g) => g.id === selectedGroupId);

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Tab toggle at the top of Standings screen */}
      <div className="bg-slate-900 border-b border-slate-800 shrink-0 grid grid-cols-2 text-center text-xs font-bold uppercase sticky top-0 z-30">
        <button
          onClick={() => setActiveSubTab("ranking")}
          className={`py-3.5 transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === "ranking" ? "border-b-2 border-emerald-400 text-emerald-400 font-extrabold bg-slate-950/20" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Ranking General</span>
        </button>
        <button
          onClick={() => setActiveSubTab("grupos")}
          className={`py-3.5 transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === "grupos" ? "border-b-2 border-emerald-400 text-emerald-400 font-extrabold bg-slate-950/20" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Mis Grupos</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeSubTab === "ranking" ? (
          <div className="flex flex-col gap-4 p-4 text-gray-100 max-w-md mx-auto h-full pb-24 font-sans">
            {/* Title */}
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-450" />
                <span>Ranking <span className="text-emerald-400">General</span></span>
              </h2>
              <p className="text-xs text-slate-400">Tabla general con el puntaje de todos los participantes</p>
            </div>

            {/* Global scoreboard Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl mb-12">
              <div className="bg-gradient-to-br from-emerald-950/40 to-slate-950 rounded-2xl p-3.5 border border-emerald-500/10 mb-4 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-400 text-slate-950">
                  <Flame className="w-5 h-5 font-black text-slate-950" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">¡La Competencia es Global!</h4>
                  <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">Demuestra tu conocimiento del fútbol mundial sumando puntos en cada fecha.</p>
                </div>
              </div>

              {users.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">Cargando la tabla general...</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {users.map((u, index) => {
                    const isUserSelf = u.id === currentUser.id;
                    let medalColor = "text-slate-500";
                    let showIcon = false;
                    if (index === 0) { medalColor = "text-yellow-400"; showIcon = true; }
                    else if (index === 1) { medalColor = "text-slate-350"; showIcon = true; }
                    else if (index === 2) { medalColor = "text-amber-700"; showIcon = true; }

                    return (
                      <div
                        key={u.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl transition-all border ${
                          isUserSelf 
                            ? "bg-slate-950 border-emerald-500/40 relative shadow-sm" 
                            : "bg-slate-950/40 border-transparent hover:border-slate-850"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Position */}
                          <div className="w-6 text-center text-xs font-black text-slate-400 flex items-center justify-center shrink-0">
                            {showIcon ? (
                              <Trophy className={`w-4 h-4 ${medalColor}`} />
                            ) : (
                              <span>{index + 1}</span>
                            )}
                          </div>

                          {/* Avatar */}
                          <img
                            src={u.photoURL}
                            alt={u.displayName}
                            className="w-8.5 h-8.5 rounded-full border border-slate-800 shrink-0 object-cover bg-slate-950 select-none"
                            referrerPolicy="no-referrer"
                          />

                          {/* Meta info details */}
                          <div className="truncate min-w-0">
                            <p className={`text-xs font-extrabold truncate flex items-center gap-1.5 ${isUserSelf ? "text-emerald-400" : "text-slate-200"}`}>
                              <span className="truncate">{u.displayName}</span>
                              {isUserSelf && (
                                <span className="text-[8px] font-black bg-emerald-950 text-emerald-400 px-1.5 py-0.2 rounded uppercase border border-emerald-900 tracking-widest shrink-0">
                                  Tú
                                </span>
                              )}
                              {u.role === "admin" && (
                                <span className="text-[8px] font-black bg-yellow-950 text-yellow-400 px-1.5 py-0.2 rounded uppercase border border-yellow-90 tracking-widest shrink-0">
                                  Súper Admin
                                </span>
                              )}
                            </p>
                            <p className="text-[9px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                              <span>{u.globalExactScores} exactos</span>
                              <span>•</span>
                              <span>{u.globalCorrectOutcomes} correctos</span>
                            </p>
                          </div>
                        </div>

                        {/* Points score */}
                        <div className="text-right flex flex-col items-end shrink-0">
                          <div className="flex items-baseline gap-0.5">
                            <span className="text-sm font-extrabold text-yellow-400">{u.globalPoints}</span>
                            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Pts</span>
                          </div>
                          {isUserSelf && index < 3 && (
                            <span className="text-[8px] text-yellow-400 font-black flex items-center gap-0.5 uppercase mt-0.5 tracking-wider">
                              <Award className="w-2.5 h-2.5 text-yellow-400" />
                              Podio
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4 text-gray-100 max-w-md mx-auto h-full pb-24 font-sans">
            {/* Title */}
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <span>Ranking de <span className="text-emerald-400">Grupos</span></span>
              </h2>
              <p className="text-xs text-slate-400">Compara tu puntaje con tus amigos en tus grupos privados</p>
            </div>

            {loadingGroups ? (
              <div className="text-center py-12 text-slate-500 text-xs">Cargando tus grupos...</div>
            ) : joinedGroups.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center shadow-xl">
                <div className="w-12 h-12 rounded-full bg-slate-950 flex items-center justify-center mx-auto mb-4 border border-slate-800">
                  <Users className="w-6 h-6 text-slate-400" />
                </div>
                <h4 className="text-sm font-bold text-white mb-2">Aún no estás en ningún grupo</h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Crea tu propio grupo o únete a uno existente usando su código secreto para competir contra tus amigos.
                </p>
                <div className="text-xs text-emerald-400 font-bold">
                  Puedes hacerlo desde la pestaña "Grupos" en el menú principal.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Horizontal scroll picker / wraps if needed */}
                <div className="flex gap-2 pb-2 overflow-x-auto no-scrollbar">
                  {joinedGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                        selectedGroupId === g.id
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 bg-slate-900"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                      }`}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>

                {/* Selected group info header */}
                {selectedGroup && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
                    <div className="flex justify-between items-center border-b border-slate-800/60 pb-3 mb-4">
                      <div>
                        <h3 className="text-sm font-extrabold text-white">{selectedGroup.name}</h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">Propietario: {selectedGroup.creatorName}</p>
                      </div>
                      <div className="bg-slate-950 px-2 py-1 rounded-lg border border-slate-850 text-right">
                        <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Código de Invitación</span>
                        <div className="text-xs font-black text-emerald-400 font-mono tracking-wider">{selectedGroup.code}</div>
                      </div>
                    </div>

                    {selectedGroupMembers.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">Cargando la tabla del grupo...</div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {selectedGroupMembers.map((u, index) => {
                          const isUserSelf = u.userId === currentUser.id;
                          let medalColor = "text-slate-500";
                          let showIcon = false;
                          if (index === 0) { medalColor = "text-yellow-400"; showIcon = true; }
                          else if (index === 1) { medalColor = "text-slate-350"; showIcon = true; }
                          else if (index === 2) { medalColor = "text-amber-700"; showIcon = true; }

                          return (
                            <div
                              key={u.userId}
                              className={`flex items-center justify-between p-2.5 rounded-xl transition-all border ${
                                isUserSelf 
                                  ? "bg-slate-950 border-emerald-500/40 relative shadow-sm" 
                                  : "bg-slate-950/40 border-transparent hover:border-slate-850"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {/* Position */}
                                <div className="w-6 text-center text-xs font-black text-slate-400 flex items-center justify-center shrink-0">
                                  {showIcon ? (
                                    <Trophy className={`w-4 h-4 ${medalColor}`} />
                                  ) : (
                                    <span>{index + 1}</span>
                                  )}
                                </div>

                                {/* Avatar */}
                                <img
                                  src={u.photoURL}
                                  alt={u.displayName}
                                  className="w-8.5 h-8.5 rounded-full border border-slate-800 shrink-0 object-cover bg-slate-950 select-none"
                                  referrerPolicy="no-referrer"
                                />

                                {/* Meta info details */}
                                <div className="truncate min-w-0">
                                  <p className={`text-xs font-extrabold truncate flex items-center gap-1.5 ${isUserSelf ? "text-emerald-400" : "text-slate-200"}`}>
                                    <span className="truncate">{u.displayName}</span>
                                    {isUserSelf && (
                                      <span className="text-[8px] font-black bg-emerald-950 text-emerald-400 px-1.5 py-0.2 rounded uppercase border border-emerald-900 tracking-widest shrink-0">
                                        Tú
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[9px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                                    <span>{u.exactScores} exactos</span>
                                    <span>•</span>
                                    <span>{u.correctOutcomes} correctos</span>
                                  </p>
                                </div>
                              </div>

                              {/* Points score */}
                              <div className="text-right flex flex-col items-end shrink-0">
                                <div className="flex items-baseline gap-0.5">
                                  <span className="text-sm font-extrabold text-yellow-400">{u.points}</span>
                                  <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Pts</span>
                                </div>
                                {isUserSelf && index < 3 && (
                                  <span className="text-[8px] text-yellow-400 font-black flex items-center gap-0.5 uppercase mt-0.5 tracking-wider">
                                    <Award className="w-2.5 h-2.5 text-yellow-400" />
                                    Podio
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
