import { Match, Prediction, UserProfile, ReportLog, NotificationAlert } from "./types";
import { INITIAL_72_MATCHES } from "./initialMatches";

export function isLocalDemoActive(): boolean {
  return localStorage.getItem("is_local_demo") === "true";
}

export function getLocalUserSession(): UserProfile | null {
  const sessionStr = localStorage.getItem("local_user_session");
  return sessionStr ? JSON.parse(sessionStr) : null;
}

const INITIAL_MATCHES: Match[] = INITIAL_72_MATCHES;

const DEFAULT_USERS: UserProfile[] = [
  {
    id: "local_demo_ignacio",
    displayName: "Ignacio (Súper Admin)",
    email: "ignaciozamorano@gmail.com",
    photoURL: "https://api.dicebear.com/7.x/bottts/svg?seed=ignacio_admin",
    role: "admin",
    globalPoints: 12,
    globalExactScores: 3,
    globalCorrectOutcomes: 4
  },
  {
    id: "local_demo_messi",
    displayName: "Leo Messi",
    email: "messi_prode@fan.com",
    photoURL: "https://api.dicebear.com/7.x/adventurer/svg?seed=messi",
    role: "user",
    globalPoints: 18,
    globalExactScores: 5,
    globalCorrectOutcomes: 7
  },
  {
    id: "local_demo_maradona",
    displayName: "Diego Maradona",
    email: "diego10_prode@fan.com",
    photoURL: "https://api.dicebear.com/7.x/adventurer/svg?seed=maradona",
    role: "user",
    globalPoints: 15,
    globalExactScores: 4,
    globalCorrectOutcomes: 5
  },
  {
    id: "local_demo_sofia",
    displayName: "Sofía Martínez",
    email: "sofia_prode@fan.com",
    photoURL: "https://api.dicebear.com/7.x/adventurer/svg?seed=sofia",
    role: "user",
    globalPoints: 9,
    globalExactScores: 2,
    globalCorrectOutcomes: 4
  }
];

// INITIALIZER
export function initializeLocalDb() {
  if (!localStorage.getItem("local_matches")) {
    localStorage.setItem("local_matches", JSON.stringify(INITIAL_MATCHES));
  }
  if (!localStorage.getItem("local_users")) {
    localStorage.setItem("local_users", JSON.stringify(DEFAULT_USERS));
  }
  if (!localStorage.getItem("local_groups")) {
    localStorage.setItem("local_groups", JSON.stringify([
      {
        id: "g_1",
        name: "Clásico de Oficina ⚽",
        code: "MUNDIAL26",
        creatorId: "local_demo_ignacio",
        creatorName: "Ignacio (Súper Admin)"
      }
    ]));
  }
  if (!localStorage.getItem("local_members")) {
    localStorage.setItem("local_members", JSON.stringify([
      { groupId: "g_1", userId: "local_demo_ignacio", displayName: "Ignacio (Súper Admin)", photoURL: "https://api.dicebear.com/7.x/bottts/svg?seed=ignacio_admin", points: 12, exactScores: 3, correctOutcomes: 4 },
      { groupId: "g_1", userId: "local_demo_messi", displayName: "Leo Messi", photoURL: "https://api.dicebear.com/7.x/adventurer/svg?seed=messi", points: 18, exactScores: 5, correctOutcomes: 7 },
      { groupId: "g_1", userId: "local_demo_maradona", displayName: "Diego Maradona", photoURL: "https://api.dicebear.com/7.x/adventurer/svg?seed=maradona", points: 15, exactScores: 4, correctOutcomes: 5 }
    ]));
  }
  if (!localStorage.getItem("local_predictions")) {
    localStorage.setItem("local_predictions", JSON.stringify({}));
  }
  if (!localStorage.getItem("local_reports")) {
    localStorage.setItem("local_reports", JSON.stringify([
      {
        id: "rep_1",
        reporterId: "local_demo_messi",
        reporterName: "Leo Messi",
        content: "Hola, no me cargó el puntaje del partido de Argentina contra Marruecos. Me podrían revisar de favor?",
        status: "pending"
      }
    ]));
  }
  if (!localStorage.getItem("local_notifications")) {
    localStorage.setItem("local_notifications", JSON.stringify([
      {
        id: "note_welcome",
        title: "¡Bienvenidos al Prode Mundial 2026!",
        body: "Empieza a registrar tus predicciones de los encuentros para ganar puntos. ¡Éxito!",
        type: "alert",
        createdAt: new Date().toISOString()
      }
    ]));
  }
}

// MATCHES
export function getLocalMatches(): Match[] {
  initializeLocalDb();
  return JSON.parse(localStorage.getItem("local_matches") || "[]");
}

export function saveLocalMatch(updatedMatch: Match) {
  const matches = getLocalMatches();
  const index = matches.findIndex((m) => m.id === updatedMatch.id);
  if (index !== -1) {
    matches[index] = updatedMatch;
    localStorage.setItem("local_matches", JSON.stringify(matches));
    window.dispatchEvent(new Event("local_matches_updated"));
  }
}

export function seedLocalMatchesReset() {
  localStorage.setItem("local_matches", JSON.stringify(INITIAL_MATCHES));
  window.dispatchEvent(new Event("local_matches_updated"));
}

// USERS
export function getLocalUsers(): UserProfile[] {
  initializeLocalDb();
  return JSON.parse(localStorage.getItem("local_users") || "[]");
}

export function saveLocalUser(updatedUser: UserProfile) {
  const users = getLocalUsers();
  const index = users.findIndex((u) => u.id === updatedUser.id);
  if (index !== -1) {
    users[index] = updatedUser;
  } else {
    users.push(updatedUser);
  }
  localStorage.setItem("local_users", JSON.stringify(users));
  window.dispatchEvent(new Event("local_users_updated"));
}

export function deleteLocalUser(userId: string) {
  let users = getLocalUsers();
  users = users.filter((u) => u.id !== userId);
  localStorage.setItem("local_users", JSON.stringify(users));
  window.dispatchEvent(new Event("local_users_updated"));
}

// PREDICTIONS
export function getLocalPredictions(): Record<string, Record<string, Prediction>> {
  initializeLocalDb();
  return JSON.parse(localStorage.getItem("local_predictions") || "{}");
}

export function getUserLocalPredictions(userId: string): Record<string, Prediction> {
  const allPreds = getLocalPredictions();
  return allPreds[userId] || {};
}

export function saveLocalPrediction(userId: string, matchId: string, prediction: Prediction) {
  const allPreds = getLocalPredictions();
  if (!allPreds[userId]) {
    allPreds[userId] = {};
  }
  allPreds[userId][matchId] = prediction;
  localStorage.setItem("local_predictions", JSON.stringify(allPreds));
  window.dispatchEvent(new Event("local_preds_updated"));
}

// GROUPS
export interface LocalGroup {
  id: string;
  name: string;
  code: string;
  creatorId: string;
  creatorName: string;
}

export interface LocalMember {
  groupId: string;
  userId: string;
  displayName: string;
  photoURL: string;
  points: number;
  exactScores: number;
  correctOutcomes: number;
}

export function getLocalGroups(): LocalGroup[] {
  initializeLocalDb();
  return JSON.parse(localStorage.getItem("local_groups") || "[]");
}

export function getLocalMembers(): LocalMember[] {
  initializeLocalDb();
  return JSON.parse(localStorage.getItem("local_members") || "[]");
}

export function saveLocalGroup(group: LocalGroup, creator: UserProfile) {
  const groups = getLocalGroups();
  groups.push(group);
  localStorage.setItem("local_groups", JSON.stringify(groups));

  const members = getLocalMembers();
  members.push({
    groupId: group.id,
    userId: creator.id,
    displayName: creator.displayName,
    photoURL: creator.photoURL,
    points: creator.globalPoints,
    exactScores: creator.globalExactScores,
    correctOutcomes: creator.globalCorrectOutcomes
  });
  localStorage.setItem("local_members", JSON.stringify(members));

  window.dispatchEvent(new Event("local_groups_updated"));
}

export function joinLocalGroup(group: LocalGroup, user: UserProfile) {
  const members = getLocalMembers();
  if (!members.some((m) => m.groupId === group.id && m.userId === user.id)) {
    members.push({
      groupId: group.id,
      userId: user.id,
      displayName: user.displayName,
      photoURL: user.photoURL,
      points: user.globalPoints,
      exactScores: user.globalExactScores,
      correctOutcomes: user.globalCorrectOutcomes
    });
    localStorage.setItem("local_members", JSON.stringify(members));
    window.dispatchEvent(new Event("local_groups_updated"));
  }
}

export function leaveLocalGroup(groupId: string, userId: string) {
  let members = getLocalMembers();
  members = members.filter((m) => !(m.groupId === groupId && m.userId === userId));
  localStorage.setItem("local_members", JSON.stringify(members));
  
  // If no members left, delete group too
  if (!members.some((m) => m.groupId === groupId)) {
    let groups = getLocalGroups();
    groups = groups.filter((g) => g.id !== groupId);
    localStorage.setItem("local_groups", JSON.stringify(groups));
  }
  
  window.dispatchEvent(new Event("local_groups_updated"));
}

// REPORTS
export function getLocalReports(): ReportLog[] {
  initializeLocalDb();
  return JSON.parse(localStorage.getItem("local_reports") || "[]");
}

export function saveLocalReport(report: ReportLog) {
  const reports = getLocalReports();
  reports.push(report);
  localStorage.setItem("local_reports", JSON.stringify(reports));
  window.dispatchEvent(new Event("local_reports_updated"));
}

export function resolveLocalReport(reportId: string) {
  const reports = getLocalReports();
  const index = reports.findIndex((r) => r.id === reportId);
  if (index !== -1) {
    reports[index].status = "resolved";
    localStorage.setItem("local_reports", JSON.stringify(reports));
    window.dispatchEvent(new Event("local_reports_updated"));
  }
}

export function deleteLocalReport(reportId: string) {
  let reports = getLocalReports();
  reports = reports.filter((r) => r.id !== reportId);
  localStorage.setItem("local_reports", JSON.stringify(reports));
  window.dispatchEvent(new Event("local_reports_updated"));
}

// NOTIFICATIONS
export function getLocalNotifications(): NotificationAlert[] {
  initializeLocalDb();
  return JSON.parse(localStorage.getItem("local_notifications") || "[]");
}

export function saveLocalNotification(notification: NotificationAlert) {
  const notes = getLocalNotifications();
  notes.unshift(notification);
  localStorage.setItem("local_notifications", JSON.stringify(notes));
  window.dispatchEvent(new Event("local_notes_updated"));
}

export function deleteLocalNotification(noteId: string) {
  let notes = getLocalNotifications();
  notes = notes.filter((n) => n.id !== noteId);
  localStorage.setItem("local_notifications", JSON.stringify(notes));
  window.dispatchEvent(new Event("local_notes_updated"));
}

// GRADING (Point calculation) LOCALLY
export function gradeLocalMatch(matchId: string, resultA: number, resultB: number, status: "scheduled" | "live" | "finished") {
  // Update match status
  const matches = getLocalMatches();
  const matchIndex = matches.findIndex((m) => m.id === matchId);
  if (matchIndex === -1) return;
  
  const originalMatch = matches[matchIndex];
  matches[matchIndex] = {
    ...originalMatch,
    resultA,
    resultB,
    status
  };
  localStorage.setItem("local_matches", JSON.stringify(matches));
  
  // Re-calculate points for all users based on updated match
  if (status === "finished") {
    const users = getLocalUsers();
    const allPreds = getLocalPredictions();
    
    users.forEach((user) => {
      const userPreds = allPreds[user.id] || {};
      const pred = userPreds[matchId];
      if (!pred) return;
      
      let gotExact = false;
      let gotOutcome = false;
      let points = 0;
      
      const realDiff = resultA - resultB;
      const predDiff = pred.predictedA - pred.predictedB;
      
      const realOutcome = realDiff > 0 ? "A" : realDiff < 0 ? "B" : "D";
      const predOutcome = predDiff > 0 ? "A" : predDiff < 0 ? "B" : "D";
      
      if (pred.predictedA === resultA && pred.predictedB === resultB) {
        gotExact = true;
        gotOutcome = true;
        points = 3; // 3 pts for exact score match
      } else if (realOutcome === predOutcome) {
        gotOutcome = true;
        points = 1; // 1 pt for correct outcome
      }
      
      // Update prediction object
      pred.pointsEarned = points;
      pred.exact = gotExact;
      pred.outcomeCorrect = gotOutcome;
      userPreds[matchId] = pred;
      allPreds[user.id] = userPreds;
      
      // Recalculate user totals
      let totalPoints = 0;
      let exactScores = 0;
      let correctOutcomes = 0;
      
      Object.values(userPreds).forEach((p) => {
        totalPoints += p.pointsEarned;
        if (p.exact) exactScores++;
        if (p.outcomeCorrect) correctOutcomes++;
      });
      
      user.globalPoints = totalPoints;
      user.globalExactScores = exactScores;
      user.globalCorrectOutcomes = correctOutcomes;
    });
    
    localStorage.setItem("local_predictions", JSON.stringify(allPreds));
    localStorage.setItem("local_users", JSON.stringify(users));
    
    // Also synchronize groups members
    let members = getLocalMembers();
    members = members.map((m) => {
      const userObj = users.find((u) => u.id === m.userId);
      if (userObj) {
        return {
          ...m,
          points: userObj.globalPoints,
          exactScores: userObj.globalExactScores,
          correctOutcomes: userObj.globalCorrectOutcomes
        };
      }
      return m;
    });
    localStorage.setItem("local_members", JSON.stringify(members));
  }
  
  window.dispatchEvent(new Event("local_matches_updated"));
  window.dispatchEvent(new Event("local_users_updated"));
  window.dispatchEvent(new Event("local_preds_updated"));
  window.dispatchEvent(new Event("local_groups_updated"));
}
