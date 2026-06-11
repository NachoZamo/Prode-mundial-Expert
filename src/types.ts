export interface UserProfile {
  id: string;
  displayName: string;
  photoURL: string;
  email: string;
  globalPoints: number;
  globalExactScores: number;
  globalCorrectOutcomes: number;
  role: "user" | "admin";
}

export interface Match {
  id: string;
  teamA: string;
  teamB: string;
  teamAFlag: string;
  teamBFlag: string;
  group: string;
  stadium: string;
  date: string; // ISO date-time string
  resultA: number | null;
  resultB: number | null;
  status: "scheduled" | "live" | "finished";
}

export interface Group {
  id: string;
  name: string;
  code: string;
  creatorId: string;
  creatorName: string;
  createdAt: any; // firestore timestamp
}

export interface GroupMember {
  userId: string;
  displayName: string;
  photoURL: string;
  points: number;
  exactScores: number;
  correctOutcomes: number;
  joinedAt: any; // firestore timestamp
}

export interface Prediction {
  matchId: string;
  predictedA: number;
  predictedB: number;
  pointsEarned: number;
  exact: boolean;
  outcomeCorrect: boolean;
  updatedAt: any; // firestore timestamp
}

export interface NotificationAlert {
  id: string;
  title: string;
  body: string;
  createdAt: any; // firestore timestamp
  type: "alert" | "match_reminder" | "ranking_update";
}

export interface ReportLog {
  id: string;
  reporterId: string;
  reporterName: string;
  content: string;
  createdAt: any; // firestore timestamp
  status: "pending" | "resolved";
}
