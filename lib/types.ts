// Tipos compartidos entre cliente y servidor.

export type StatusCategoryKey = "new" | "indeterminate" | "done";

export interface JiraStatusCategory {
  key: StatusCategoryKey;
  name: string;
  colorName: string;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: JiraStatusCategory;
}

export interface JiraIssueType {
  id: string;
  name: string;
  iconUrl?: string;
  subtask?: boolean;
}

export interface JiraPriority {
  id: string;
  name: string;
  iconUrl?: string;
}

export interface JiraAssignee {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls?: { "16x16"?: string; "24x24"?: string; "32x32"?: string; "48x48"?: string };
}

export interface JiraIssueFields {
  summary: string;
  status: JiraStatus;
  issuetype: JiraIssueType;
  priority?: JiraPriority;
  assignee: JiraAssignee | null;
  updated: string;
  labels: string[];
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
  /** No siempre viene; lo enriquecemos en el server. */
  webUrl?: string;
}

export interface SprintFetchResult {
  /** Lista de issues del / los sprint(s) activo(s). */
  issues: JiraIssue[];
  /** Nombre del sitio Jira de origen. */
  site: string;
  /** Clave del proyecto. */
  projectKey: string;
  /** Cuándo se hizo el fetch (ISO). */
  fetchedAt: string;
}

export interface SessionUser {
  accountId: string;
  displayName: string;
  email?: string;
  avatar?: string;
}

export interface JiraSprintRef {
  id: number;
  name: string;
  state: "active" | "closed" | "future";
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

export interface QaIssueMetrics {
  key: string;
  summary: string;
  webUrl: string;
  sprintId: number;
  sprintName: string;
  assignee: string | null;
  currentStatus: string;
  labels: string[];
  msInQa: number;
  msInReturned: number;
  qaEnters: number;
  returnedEnters: number;
  stillOpen: boolean;
}

export interface QaSprintSummary {
  sprintId: number;
  sprintName: string;
  state: JiraSprintRef["state"];
  taskCount: number;
  avgMsInQa: number;
  totalReturns: number;
}

export interface QaCompletionBucket {
  qa: number;
  noQa: number;
}

export interface QaCompletionPerSprint extends QaCompletionBucket {
  sprintId: number;
  sprintName: string;
}

export interface QaCompletionStats {
  perSprint: QaCompletionPerSprint[];
  global: QaCompletionBucket;
}

export interface QaReport {
  fetchedAt: string;
  sprints: JiraSprintRef[];
  issues: QaIssueMetrics[];
  perSprint: QaSprintSummary[];
  global: {
    taskCount: number;
    avgMsInQa: number;
    totalMsInQa: number;
    totalReturns: number;
  };
  completion: QaCompletionStats;
}

export interface SessionData {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  cloudId?: string;
  site?: string;
  user?: SessionUser;
  oauthState?: string;
}
