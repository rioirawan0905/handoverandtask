import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { 
  Database, 
  User, 
  ArrowRight, 
  Plus, 
  Trash2, 
  CheckSquare, 
  Square, 
  Archive, 
  History, 
  Clock, 
  FileCheck, 
  HelpCircle, 
  ArrowUpRight, 
  Share2, 
  Volume2, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  Copy,
  CheckCircle2,
  AlertTriangle,
  Info,
  Bell,
  BellRing,
  Settings
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc, getDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { UpcomingTasksChart } from "./components/UpcomingTasksChart";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Define TypeScript interfaces
interface PersonnelItem {
  id: string;
  name: string;
  title: string;
}

interface HandoverTask {
  id: string;
  description: string;
  ownerName: string;
  priority: "High" | "Medium" | "Low";
  dueDate: string;
  completed: boolean;
}

interface BacklogTask {
  id: string;
  description: string;
  ownerName: string;
  priority: "High" | "Medium" | "Low";
  backlogDate: string; // ISO format string
  completed: boolean;
}

interface HandoverHistoryItem {
  id: string;
  date: string;
  outgoingLead: string;
  incomingLead: string;
  logText: string;
  tasksCount: number;
  backlogCount: number;
  signedOffBy: string;
  tasks?: HandoverTask[];
  backlog?: BacklogTask[];
}

interface NotificationItem {
  id: string;
  type: "info" | "success" | "warning";
  message: string;
  timestamp: string;
}

interface NotificationPreference {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

interface NotificationSettings {
  taskAssignment: NotificationPreference;
  overdueAlert: NotificationPreference;
  handoverSignoff: NotificationPreference;
  rosterUpdate: NotificationPreference;
  userEmail: string;
}

interface SimulatedEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  type: string;
  timestamp: string;
  details?: {
    taskName?: string;
    assignee?: string;
    dueDate?: string;
    spaceName?: string;
    operatorName?: string;
    signeeName?: string;
  };
}

interface SimulatedPush {
  id: string;
  title: string;
  body: string;
  timestamp: string;
}

interface SignoffChecklist {
  blockersReviewed: boolean;
  systemsNormal: boolean;
  credsTransferred: boolean;
}

interface HandoverState {
  outgoingLead: string;
  incomingLead: string;
  tasks: HandoverTask[];
  backlog: BacklogTask[];
  history: HandoverHistoryItem[];
  signoffChecklist: SignoffChecklist;
  latestLog: string;
  personnel?: PersonnelItem[];
}

// Fixed baseline time based on metadata: 2026-05-20
const CURRENT_DATE_STR = "2026-05-20";
const CURRENT_DATE_VAL = new Date(CURRENT_DATE_STR);

export const PRESET_MOCK_HANDOVERS: { id: string; title: string; outgoingLead: string; incomingLead: string; date: string; logText: string; tasks: HandoverTask[] }[] = [];

export const DEFAULT_PERSONNEL: PersonnelItem[] = [
  { id: "p-1", name: "George Vance", title: "Senior Operator" },
  { id: "p-2", name: "Sarah Connor", title: "Rig Manager" },
  { id: "p-3", name: "Marcus Crane", title: "Drill Superintendent" },
  { id: "p-4", name: "Markus Webb", title: "Lead Engineer" }
];

// Initial template mock data populated automatically with previous handover states and active tasks, now empty on default
const DEFAULT_WORKSPACE_STATE: HandoverState = {
  outgoingLead: "",
  incomingLead: "",
  personnel: DEFAULT_PERSONNEL,
  tasks: [],
  backlog: [],
  history: [],
  signoffChecklist: {
    blockersReviewed: false,
    systemsNormal: false,
    credsTransferred: false,
  },
  latestLog: ""
};

export const PALETTE_THEMES = [
  {
    id: "steel-slate",
    name: "Steel Slate",
    description: "Modern enterprise slate-gray with deep indigo accents",
    isDark: false,
    bodyBg: "bg-slate-50/50",
    bodyText: "text-slate-800",
    cardBg: "bg-white",
    cardBorder: "border-slate-200",
    cardTitleText: "text-slate-900",
    cardSubText: "text-slate-500",
    mutedBg: "bg-slate-50",
    primaryBtn: "bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-300",
    accentText: "text-indigo-650",
    accentBg: "bg-indigo-50/50",
    accentBorder: "border-indigo-100",
    activeRibbonBg: "bg-indigo-900 border-indigo-950 text-white",
    activeRibbonText: "text-white",
    activeRibbonMutedText: "text-indigo-200",
    activeRibbonSubText: "text-indigo-300",
    activeRibbonMiddle: "bg-indigo-950/40 border-indigo-800",
    activeRibbonBubble: "bg-indigo-950/60 text-indigo-300 border-indigo-800/80",
    successAlertBg: "bg-emerald-50 text-emerald-800 border-emerald-100",
    infoAlertBg: "bg-indigo-50 text-indigo-850 border-indigo-100",
    warningAlertBg: "bg-amber-50 text-amber-800 border-amber-100",
    metaText: "text-slate-400",
    divideColor: "divide-slate-200",
    inputBg: "bg-white text-slate-800 border-slate-200",
    thBg: "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100/80",
    analyticsDarkAccent: "#4f46e5",
  },
  {
    id: "alpine-forest",
    name: "Alpine Forest",
    description: "Crisp timberland & spruce tones, comfortable organic style",
    isDark: false,
    bodyBg: "bg-stone-50",
    bodyText: "text-stone-800",
    cardBg: "bg-white",
    cardBorder: "border-stone-200",
    cardTitleText: "text-stone-900",
    cardSubText: "text-stone-500",
    mutedBg: "bg-stone-50",
    primaryBtn: "bg-emerald-700 hover:bg-emerald-800 text-white focus:ring-emerald-400",
    accentText: "text-emerald-700",
    accentBg: "bg-emerald-50/50",
    accentBorder: "border-emerald-150",
    activeRibbonBg: "bg-emerald-800 border-emerald-950 text-white",
    activeRibbonText: "text-white",
    activeRibbonMutedText: "text-emerald-150",
    activeRibbonSubText: "text-emerald-300",
    activeRibbonMiddle: "bg-emerald-900/50 border-emerald-750",
    activeRibbonBubble: "bg-emerald-950/60 text-emerald-300 border-emerald-750/80",
    successAlertBg: "bg-emerald-50 text-emerald-850 border-emerald-150",
    infoAlertBg: "bg-teal-50 text-teal-850 border-teal-150",
    warningAlertBg: "bg-amber-50 text-amber-800 border-amber-150",
    metaText: "text-stone-400",
    divideColor: "divide-stone-200",
    inputBg: "bg-white text-stone-800 border-stone-200",
    thBg: "bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100",
    analyticsDarkAccent: "#047857",
  },
  {
    id: "deep-oceanic",
    name: "Deep Oceanic",
    description: "High-contrast maritime palette with navy text and ocean accents",
    isDark: false,
    bodyBg: "bg-[#F0F4F8]",
    bodyText: "text-slate-800",
    cardBg: "bg-white",
    cardBorder: "border-slate-200",
    cardTitleText: "text-blue-950",
    cardSubText: "text-slate-500",
    mutedBg: "bg-[#E6EDF5]/40",
    primaryBtn: "bg-blue-700 hover:bg-blue-800 text-white focus:ring-blue-400",
    accentText: "text-blue-700",
    accentBg: "bg-blue-50/70",
    accentBorder: "border-blue-150",
    activeRibbonBg: "bg-blue-900 border-blue-950 text-white",
    activeRibbonText: "text-white",
    activeRibbonMutedText: "text-blue-200",
    activeRibbonSubText: "text-blue-300",
    activeRibbonMiddle: "bg-blue-950/45 border-blue-800",
    activeRibbonBubble: "bg-blue-950/70 text-blue-300 border-blue-800/80",
    successAlertBg: "bg-emerald-50 text-emerald-800 border-emerald-100",
    infoAlertBg: "bg-blue-50 text-blue-850 border-blue-100",
    warningAlertBg: "bg-amber-50 text-amber-800 border-amber-100",
    metaText: "text-slate-400",
    divideColor: "divide-slate-200",
    inputBg: "bg-white text-slate-800 border-slate-200",
    thBg: "bg-slate-100/50 text-slate-505 border-slate-200 hover:bg-slate-100",
    analyticsDarkAccent: "#1d4ed8",
  },
  {
    id: "charcoal-tech",
    name: "Charcoal Tech",
    description: "Low-glare deep dark theme with electric cyan lights & rich contrast",
    isDark: true,
    bodyBg: "bg-[#0B0F19]",
    bodyText: "text-slate-200",
    cardBg: "bg-[#161E2E]",
    cardBorder: "border-slate-800",
    cardTitleText: "text-[#F8FAFC]",
    cardSubText: "text-slate-400",
    mutedBg: "bg-[#1F2937]/70",
    primaryBtn: "bg-indigo-650 hover:bg-indigo-600 text-white focus:ring-indigo-700",
    accentText: "text-[#38BDF8]",
    accentBg: "bg-slate-900/50",
    accentBorder: "border-slate-850",
    activeRibbonBg: "bg-[#0F172A] border hover:border-indigo-900/40 border-slate-800 text-slate-200",
    activeRibbonText: "text-slate-100",
    activeRibbonMutedText: "text-slate-400",
    activeRibbonSubText: "text-indigo-400",
    activeRibbonMiddle: "bg-[#161E2E] border-slate-800/80",
    activeRibbonBubble: "bg-[#0B0F19] text-[#38BDF8] border-slate-800",
    successAlertBg: "bg-emerald-950/50 text-emerald-200 border-emerald-950/40",
    infoAlertBg: "bg-[#1F2937]/50 text-slate-200 border-slate-850",
    warningAlertBg: "bg-amber-955/40 text-amber-200 border-amber-950/40",
    metaText: "text-slate-500",
    divideColor: "divide-slate-800",
    inputBg: "bg-[#1F2937] text-slate-100 border-slate-700 focus:ring-indigo-500",
    thBg: "bg-[#1E293B]/60 text-slate-300 border-slate-800 hover:bg-slate-800",
    analyticsDarkAccent: "#38bdf8",
  }
];

export default function App() {
  const [selectedThemeId, setSelectedThemeId] = useState<string>(() => {
    return localStorage.getItem("handover_dashboard_theme") || "steel-slate";
  });

  const activeTheme = PALETTE_THEMES.find(t => t.id === selectedThemeId) || PALETTE_THEMES[0];

  useEffect(() => {
    localStorage.setItem("handover_dashboard_theme", selectedThemeId);
  }, [selectedThemeId]);

  const [isEnvConfigured, setIsEnvConfigured] = useState(false);
  // App state
  const [dbState, setDbState] = useState<HandoverState>(DEFAULT_WORKSPACE_STATE);

  // Workspace creation modal state
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);
  const [newWorkspaceInputName, setNewWorkspaceInputName] = useState("");
  const [workspaceCreateError, setWorkspaceCreateError] = useState("");

  // Carry Over Tasks modal state
  const [showCarryOverModal, setShowCarryOverModal] = useState(false);
  const [selectedCarryOverTaskIds, setSelectedCarryOverTaskIds] = useState<string[]>([]);

  // Authorized Sign-Off confirmation modal state
  const [showSignoffConfirmationModal, setShowSignoffConfirmationModal] = useState(false);
  const [signoffAgreement, setSignoffAgreement] = useState(false);
  const [signoffEmailOverride, setSignoffEmailOverride] = useState("");
  const [signoffResult, setSignoffResult] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message: string;
    sentTo: string;
  }>({ status: "idle", message: "", sentTo: "" });

  // Previous Read Notifications state hydration
  const [showPreviousNotificationsPopup, setShowPreviousNotificationsPopup] = useState(false);
  const [readNotifications, setReadNotifications] = useState<NotificationItem[]>(() => {
    const saved = localStorage.getItem("handover_read_notifications");
    return saved ? JSON.parse(saved) : [];
  });

  // Delete confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    type: "task" | "backlog" | "workspace" | "person" | "history";
    id: string;
    name: string;
  } | null>(null);

  // Multi-workspace management state
  const [currentSelectedWorkspaceId, setCurrentSelectedWorkspaceId] = useState<string>(() => {
    const saved = localStorage.getItem("handover_active_workspace_id");
    if (saved && saved !== "currentWorkspace") {
      return saved;
    }
    return "ws-primary-shift-space";
  });
  const [workspaces, setWorkspaces] = useState<{ id: string, name: string }[]>(() => {
    const saved = localStorage.getItem("handover_workspace_list");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out user's auto-created or testing workspaces and legacy default space
          const filtered = parsed.filter(w => 
            w.name !== "Handover Testing" && 
            w.id !== "handover-testing" && 
            w.id !== "ws-handover-testing" &&
            w.id !== "currentWorkspace"
          );
          return filtered.length > 0 ? filtered : [{ id: "ws-primary-shift-space", name: "Primary Shift Space" }];
        }
      } catch (e) {
        // ignore and fallback
      }
    }
    return [{ id: "ws-primary-shift-space", name: "Primary Shift Space" }];
  });

  // Standalone Dashboard State
  const [allWorkspacesData, setAllWorkspacesData] = useState<Record<string, HandoverState>>({});
  
  // One-time startup check: clear old data in Primary Shift Space to make it empty
  useEffect(() => {
    const isPrimaryCleaned = localStorage.getItem("handover_primary_cleaned_v2");
    if (!isPrimaryCleaned) {
      localStorage.removeItem("handover_local_demo_db_ws-primary-shift-space");
      localStorage.setItem("handover_primary_cleaned_v2", "true");
      if (currentSelectedWorkspaceId === "ws-primary-shift-space") {
        setDbState(DEFAULT_WORKSPACE_STATE);
      }
    }
  }, [currentSelectedWorkspaceId]);
  
  // Database configuration
  const [firebaseConfigMode, setFirebaseConfigMode] = useState<"demo" | "cloud">("cloud");
  const [configKeys, setConfigKeys] = useState<{
    projectId: string;
    apiKey: string;
    authDomain: string;
    appId: string;
    firestoreDatabaseId?: string;
  }>(() => {
    const env = (import.meta as any).env || {};
    const envProjectId = env.VITE_FIREBASE_PROJECT_ID || "";
    const envApiKey = env.VITE_FIREBASE_API_KEY || "";
    const envAuthDomain = env.VITE_FIREBASE_AUTH_DOMAIN || "";
    const envAppId = env.VITE_FIREBASE_APP_ID || "";
    const envDatabaseId = env.VITE_FIREBASE_DATABASE_ID || "";

    if (envProjectId && envApiKey) {
      return {
        projectId: envProjectId,
        apiKey: envApiKey,
        authDomain: envAuthDomain,
        appId: envAppId,
        firestoreDatabaseId: envDatabaseId
      };
    }
    return {
      projectId: "",
      apiKey: "",
      authDomain: "",
      appId: "",
      firestoreDatabaseId: ""
    };
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [firestoreInstance, setFirestoreInstance] = useState<any>(null);

  // Sorting state for Active Tasks and Backlog Tasks
  const [tasksSortField, setTasksSortField] = useState<"completed" | "description" | "ownerName" | "priority" | "dueDate" | null>(null);
  const [tasksSortDirection, setTasksSortDirection] = useState<"asc" | "desc">("asc");

  const [backlogSortField, setBacklogSortField] = useState<"completed" | "description" | "ownerName" | "priority" | "backlogDate" | null>(null);
  const [backlogSortDirection, setBacklogSortDirection] = useState<"asc" | "desc">("asc");
  
  // Global Personnel references
  const [globalPersonnel, setGlobalPersonnel] = useState<PersonnelItem[]>(() => {
    const saved = localStorage.getItem("handover_global_personnel");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback to default
      }
    }
    return DEFAULT_PERSONNEL;
  });

  // Save changes block to localStorage
  useEffect(() => {
    localStorage.setItem("handover_global_personnel", JSON.stringify(globalPersonnel));
  }, [globalPersonnel]);

  // Cloud Sync for global personnel settings document
  useEffect(() => {
    if (firebaseConfigMode !== "cloud" || !firestoreInstance) return;

    const rosterDocRef = doc(firestoreInstance, "handoverSettings", "roster");
    const unsubscribe = onSnapshot(rosterDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data && Array.isArray(data.list)) {
          setGlobalPersonnel(data.list);
        }
      } else {
        // Initialize remote roster settings with the current local dataset
        setDoc(rosterDocRef, { list: globalPersonnel }).catch(err => {
          console.error("Failed to initialize cloud roster", err);
          handleFirestoreError(err, OperationType.WRITE, "handoverSettings/roster");
        });
      }
    }, (err) => {
      console.warn("Snapshot listening on roster failed (possibly due to Firestore rules). Falling back to local/cached roster data.", err);
      try {
        handleFirestoreError(err, OperationType.GET, "handoverSettings/roster");
      } catch (e) {
        // Just let it log
      }
    });

    return () => unsubscribe();
  }, [firebaseConfigMode, firestoreInstance]);

  const personnelList = globalPersonnel;

  const handleAddPersonnel = (name: string, title: string) => {
    if (!name.trim() || !title.trim()) return;
    const newPerson: PersonnelItem = {
      id: `p-${Date.now()}`,
      name: name.trim(),
      title: title.trim(),
    };
    const updated = [...globalPersonnel, newPerson];
    setGlobalPersonnel(updated);

    if (firebaseConfigMode === "cloud" && firestoreInstance) {
      setDoc(doc(firestoreInstance, "handoverSettings", "roster"), { list: updated }).catch(err => {
        console.error("Failed to sync personnel addition to cloud", err);
        addNotification(`⚠️ Failed to sync personnel addition to cloud: Missing or insufficient permissions. Please make sure your Firestore Security Rules allow read/write access to "/handoverSettings/roster" and "/handoverSystem/*".`, "warning");
        handleFirestoreError(err, OperationType.WRITE, "handoverSettings/roster");
      });
    }

    dispatchNotification({
      event: "rosterUpdate",
      message: `Added personnel globally: ${name.trim()} (${title.trim()})`,
      type: "success",
      details: {
        operatorName: name.trim()
      }
    });
  };

  const handleRemovePersonnel = (id: string, name: string) => {
    const updated = globalPersonnel.filter(p => p.id !== id);
    setGlobalPersonnel(updated);

    if (firebaseConfigMode === "cloud" && firestoreInstance) {
      setDoc(doc(firestoreInstance, "handoverSettings", "roster"), { list: updated }).catch(err => {
        console.error("Failed to sync personnel removal to cloud", err);
        addNotification(`⚠️ Failed to sync personnel removal to cloud: Missing or insufficient permissions. Please make sure your Firestore Security Rules allow read/write access to "/handoverSettings/roster" and "/handoverSystem/*".`, "warning");
        handleFirestoreError(err, OperationType.WRITE, "handoverSettings/roster");
      });
    }

    dispatchNotification({
      event: "rosterUpdate",
      message: `Removed personnel globally: ${name}`,
      type: "warning",
      details: {
        operatorName: name
      }
    });
  };

  const [connectionStatusMsg, setConnectionStatusMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
  }>({ type: "info", text: "Initializing team database cloud synchronization..." });

  // Add Task Forms state
  const [newTask, setNewTask] = useState({
    description: "",
    ownerName: "",
    priority: "Medium" as "High" | "Medium" | "Low",
    dueDate: "2026-05-21"
  });

  const [newBacklog, setNewBacklog] = useState({
    description: "",
    ownerName: "",
    priority: "Medium" as "High" | "Medium" | "Low",
    backlogDate: "2026-05-15"
  });

  // State log edit
  const [logText, setLogText] = useState("");

  // Shift completion requirements
  const isChecklistComplete = !!(
    dbState?.signoffChecklist?.blockersReviewed &&
    dbState?.signoffChecklist?.systemsNormal &&
    dbState?.signoffChecklist?.credsTransferred
  );
  const isNotesFilled = !!(logText || "").trim();
  const areLeadsSet = !!(dbState?.outgoingLead?.trim() && dbState?.incomingLead?.trim());
  const isSignOffCompleteReady = isChecklistComplete && isNotesFilled && areLeadsSet;

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "initial-1",
      type: "info",
      message: "Drilling office operational tracker loaded successfully.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [isNewNotification, setIsNewNotification] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);

  // Granular notification settings state
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() => {
    const saved = localStorage.getItem("handover_notification_rules");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // use default
      }
    }
    return {
      taskAssignment: { inApp: true, email: true, push: true },
      overdueAlert: { inApp: true, email: true, push: true },
      handoverSignoff: { inApp: true, email: false, push: true },
      rosterUpdate: { inApp: true, email: true, push: false },
      userEmail: ""
    };
  });

  // Save rules to localStorage
  useEffect(() => {
    localStorage.setItem("handover_notification_rules", JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  // Outbox & Notification channels simulation state
  const [simulatedEmails, setSimulatedEmails] = useState<SimulatedEmail[]>(() => {
    const saved = localStorage.getItem("handover_simulated_emails");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });

  const [simulatedPushes, setSimulatedPushes] = useState<SimulatedPush[]>(() => {
    const saved = localStorage.getItem("handover_simulated_pushes");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });

  // Floating transient desktop-style push banners
  const [activePushAlerts, setActivePushAlerts] = useState<SimulatedPush[]>([]);
  const [activeSimulationTab, setActiveSimulationTab] = useState<"emails" | "pushes">("emails");
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("handover_simulated_emails", JSON.stringify(simulatedEmails));
  }, [simulatedEmails]);

  useEffect(() => {
    localStorage.setItem("handover_simulated_pushes", JSON.stringify(simulatedPushes));
  }, [simulatedPushes]);

  // Quick system warning or internal inApp log toast helper
  const addNotification = (message: string, type: "info" | "success" | "warning" = "info") => {
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}-${Math.random()}`,
      type,
      message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setNotifications(prev => [newNotif, ...prev.slice(0, 19)]);
    setIsNewNotification(true);
  };

  // Modern Multi-Channel Notification Dispatcher with routing filters
  const dispatchNotification = (args: {
    event: "taskAssignment" | "overdueAlert" | "handoverSignoff" | "rosterUpdate";
    message: string;
    type: "info" | "success" | "warning";
    details?: {
      taskName?: string;
      assignee?: string;
      dueDate?: string;
      spaceName?: string;
      operatorName?: string;
      signeeName?: string;
      handoverRecord?: HandoverHistoryItem;
    };
  }) => {
    const { event, message, type, details } = args;
    const pref = notificationSettings[event];
    if (!pref) return;

    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. In-App delivery
    if (pref.inApp) {
      const newNotif: NotificationItem = {
        id: `notif-${Date.now()}-${Math.random()}`,
        type,
        message,
        timestamp: timestampStr
      };
      setNotifications(prev => [newNotif, ...prev.slice(0, 19)]);
      setIsNewNotification(true);
    }

    // 2. Real & Simulated Transactional Email dispatch
    if (pref.email) {
      // Avoid double/spam emails for minor edits. Only send unified shift log emails on actual clicked Sign-off instances.
      if (event === "handoverSignoff" && !details?.handoverRecord) {
        console.log("Skipping email dispatch for lead updates before final signoff.");
        return;
      }

      let emailSubject = "";
      let emailHtml = "";

      if (event === "handoverSignoff" && details?.handoverRecord) {
        const hr = details.handoverRecord;
        emailSubject = `[COMPLETE HANDOVER ARCHIVE] Shift Handover Completed by ${hr.outgoingLead} ➔ ${hr.incomingLead}`;
        
        const hrTasks = hr.tasks || [];
        const hrBacklogs = hr.backlog || [];

        let tasksRows = "";
        if (hrTasks.length === 0) {
          tasksRows = `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #64748b; font-style: italic; border-top: 1px solid #e2e8f0;">No tasks registered this shift cycle.</td></tr>`;
        } else {
          hrTasks.forEach((t) => {
            const statusBadge = t.completed 
              ? `<span style="background-color: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid #a7f3d0;">COMPLETED</span>`
              : `<span style="background-color: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid #fde68a;">OPEN / CARRIED OVER</span>`;
            
            const pColor = t.priority === "High" ? "#dc2626" : t.priority === "Medium" ? "#d97706" : "#2563eb";
            const priorityBadge = `<span style="color: ${pColor}; font-weight: bold;">${t.priority}</span>`;
            
            tasksRows += `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 8px; font-size: 12px; font-weight: 600; color: #1e293b; text-align: left;">${t.description}</td>
                <td style="padding: 10px 8px; font-size: 11px; color: #475569; text-align: left;">${t.ownerName}</td>
                <td style="padding: 10px 8px; font-size: 11px; text-align: center;">${priorityBadge}</td>
                <td style="padding: 10px 8px; font-size: 11px; text-align: right;">${statusBadge}</td>
              </tr>
            `;
          });
        }

        let backlogRows = "";
        if (hrBacklogs.length === 0) {
          backlogRows = `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #64748b; font-style: italic; border-top: 1px solid #e2e8f0;">No backlog/long-term issues registered.</td></tr>`;
        } else {
          hrBacklogs.forEach((b) => {
            const pColor = b.priority === "High" ? "#dc2626" : b.priority === "Medium" ? "#d97706" : "#2563eb";
            const priorityBadge = `<span style="color: ${pColor}; font-weight: bold;">${b.priority}</span>`;
            backlogRows += `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 8px; font-size: 12px; font-weight: 600; color: #1e293b; text-align: left;">${b.description}</td>
                <td style="padding: 10px 8px; font-size: 11px; color: #475569; text-align: left;">${b.ownerName}</td>
                <td style="padding: 10px 8px; font-size: 11px; text-align: right;">${priorityBadge}</td>
              </tr>
            `;
          });
        }

        emailHtml = `
          <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; background-color: #f1f5f9; padding: 32px 16px; color: #1e293b; direction: ltr; text-align: left; line-height: 1.5;">
            <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);">
              
              <!-- Subject/Title Header -->
              <div style="background-color: #0f172a; padding: 28px 24px; color: #ffffff; text-align: left; border-bottom: 4px solid #10b981;">
                <div style="margin-bottom: 8px;">
                  <span style="background-color: #059669; color: #ffffff; font-size: 10px; font-weight: bold; padding: 4px 8px; border-radius: 100px; text-transform: uppercase; font-family: monospace; letter-spacing: 0.05em;">✓ Shift Certified</span>
                </div>
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; text-transform: uppercase; color: #ffffff; letter-spacing: -0.025em;">Drilling Handover Report</h1>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8; font-family: monospace; line-height: 1;">SPACE: ${details.spaceName || 'Active Space'} • DATE: ${new Date(hr.date).toLocaleString()}</p>
              </div>

              <!-- Content Area -->
              <div style="padding: 24px;">
                
                <!-- Section 1: Digital Signoff Summary Card -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                  <h3 style="margin: 0 0 12px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #475569; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Digital Sign-Off Summary</h3>
                  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tbody>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 45%;">Outgoing Shift Lead:</td>
                        <td style="padding: 6px 0; color: #0f172a; font-weight: 700; text-align: right;">${hr.outgoingLead}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Incoming Counterpart:</td>
                        <td style="padding: 6px 0; color: #0f172a; font-weight: 700; text-align: right;">${hr.incomingLead}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Authorized Signer:</td>
                        <td style="padding: 6px 0; color: #10b981; font-weight: 800; text-align: right;">${hr.signedOffBy} [DIGITAL STAMP]</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Verification Standards:</td>
                        <td style="padding: 6px 0; color: #047857; font-weight: 700; text-align: right;">100% COMPLETE PASS</td>
                      </tr>
                    </tbody>
                  </table>
                  
                  <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #64748b; font-style: italic; line-height: 1.3;">
                    Note: By entering the digital signature and committing this record, both operational parties verified and approved the complete safety status, mud properties, and active task register under high-pressure drilling protocols.
                  </div>
                </div>

                <!-- Section 2: Shift Chronicle Log -->
                <div style="margin-bottom: 24px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">Operations Chronicle & Shift Log</h3>
                  <div style="background-color: #faf5ff; border: 1px solid #e9d5ff; border-left: 4px solid #8b5cf6; border-radius: 6px; padding: 14px 16px; font-size: 13.5px; line-height: 1.6; color: #581c87; text-align: left;">
                    "${hr.logText}"
                  </div>
                </div>

                <!-- Section 3: Active Shift Task Register -->
                <div style="margin-bottom: 24px;">
                  <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">Active Shift Task Register</h3>
                  <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                      <thead>
                        <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                          <th style="padding: 10px 8px; font-weight: 700; color: #475569; text-align: left;">Task Description</th>
                          <th style="padding: 10px 8px; font-weight: 700; color: #475569; text-align: left;">Owner</th>
                          <th style="padding: 10px 8px; font-weight: 700; color: #475569; text-align: center;">Priority</th>
                          <th style="padding: 10px 8px; font-weight: 700; color: #475569; text-align: right;">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${tasksRows}
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Section 4: Shift Backlog Items -->
                <div style="margin-bottom: 24px;">
                  <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">Shift Backlog Registry</h3>
                  <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                      <thead>
                        <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                          <th style="padding: 10px 8px; font-weight: 700; color: #475569; text-align: left;">Backlog Description</th>
                          <th style="padding: 10px 8px; font-weight: 700; color: #475569; text-align: left;">Owner</th>
                          <th style="padding: 10px 8px; font-weight: 700; color: #475569; text-align: right;">Priority</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${backlogRows}
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Action button link -->
                <div style="margin-top: 28px; text-align: center;">
                  <a href="${window.location.origin}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 12px 28px; font-weight: 700; font-size: 13px; text-decoration: none; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.25);">Launch Active Shift Dashboard</a>
                </div>

                <!-- Footer disclaimer -->
                <p style="margin: 32px 0 0 0; font-size: 10.5px; color: #94a3b8; text-align: center; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 18px;">
                  This is an officially certified transactional transmission dispatched to members assigned to shift operations. Real-world transactional delivery powered by Nodemailer SMTP Relay.
                </p>
              </div>
            </div>
          </div>
        `;
      } else {
        emailSubject = `[Drilling Operations Portal] ${
          event === "taskAssignment" ? "Task Assignment Event Alert" :
          event === "overdueAlert" ? "URGENT OVERDUE ACTION REQUIRED" :
          "Global Roster System Event"
        }`;

        emailHtml = `
          <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; background-color: #f8fafc; padding: 24px 16px; color: #1e293b; direction: ltr; text-align: left;">
            <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
              <!-- Subject/Title Header -->
              <div style="background-color: #0f172a; padding: 24px; color: #ffffff; text-align: left;">
                <h1 style="margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase;">Drilling Operations Portal</h1>
                <p style="margin: 4px 0 0 0; font-size: 10px; color: #94a3b8; font-family: monospace;">REAL-TIME SYSTEM RELAY</p>
              </div>

              <!-- Content Area -->
              <div style="padding: 24px;">
                <h2 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 700; color: #0f172a;">${emailSubject}</h2>
                
                <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; border-radius: 4px; padding: 16px; margin-bottom: 24px; text-align: left; line-height: 1.6; font-size: 13px; color: #334155; border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
                  <strong>Event Message:</strong><br/>
                  ${message}
                </div>

                ${details && Object.keys(details).length > 0 ? `
                  <div style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                    <span style="display: block; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 8px;">Structured Payload Details</span>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; font-family: monospace;">
                      <tbody>
                        ${details.taskName ? `
                          <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">TASK SPEC:</td>
                            <td style="padding: 8px 0; color: #0f172a; font-weight: 700; text-align: right;">${details.taskName}</td>
                          </tr>
                        ` : ''}
                        ${details.assignee ? `
                          <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">ASSIGNEE:</td>
                            <td style="padding: 8px 0; color: #0f172a; font-weight: 700; text-align: right;">${details.assignee}</td>
                          </tr>
                        ` : ''}
                        ${details.dueDate ? `
                          <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">DEADLINE:</td>
                            <td style="padding: 8px 0; color: #0f172a; font-weight: 700; text-align: right;">${details.dueDate}</td>
                          </tr>
                        ` : ''}
                        ${details.spaceName ? `
                          <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">SPACE ID:</td>
                            <td style="padding: 8px 0; color: #0f172a; font-weight: 700; text-align: right;">${details.spaceName}</td>
                          </tr>
                        ` : ''}
                        ${details.signeeName ? `
                          <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">AUTHORIZER:</td>
                            <td style="padding: 8px 0; color: #0f172a; font-weight: 700; text-align: right;">${details.signeeName}</td>
                          </tr>
                        ` : ''}
                      </tbody>
                    </table>
                  </div>
                ` : ''}

                <!-- Action button link -->
                <div style="margin-top: 24px; text-align: center;">
                  <a href="${window.location.origin}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 12px 24px; font-weight: 700; font-size: 13px; text-decoration: none; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">Open Portal Dashboard</a>
                </div>

                <!-- Footer disclaimer -->
                <p style="margin: 24px 0 0 0; font-size: 10px; color: #94a3b8; text-align: center; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                  You received this transmission because notification rules are configured on your account settings. This is an automated real-world transactional email sent using nodemailer.
                </p>
              </div>
            </div>
          </div>
        `;
      }

      const targetEmails = notificationSettings.userEmail.trim();
      if (!targetEmails) {
        console.log("Skipping physical SMTP dispatch: No recipient emails are configured inside Settings.");
        return;
      }

      const newEmail: SimulatedEmail = {
        id: `email-${Date.now()}-${Math.random()}`,
        to: targetEmails,
        subject: emailSubject,
        body: message,
        type: event,
        timestamp: new Date().toLocaleString(),
        details: details || {}
      };
      setSimulatedEmails(prev => [newEmail, ...prev]);

      // Note: Automatic physical email dispatch is disabled per scope requirements.
      // Physical emails are strictly dispatched only when of actual sign-off completion modal is confirmed.
      console.log("Simulated email logged to outbox. Automatic physical email dispatch bypassed.");
    }

    // 3. Simulated Mobile/Desktop Push Alert
    if (pref.push) {
      const newPush: SimulatedPush = {
        id: `push-${Date.now()}-${Math.random()}`,
        title: event === "taskAssignment" ? "⚙️ Operational Assignment" :
               event === "overdueAlert" ? "🚨 Escalation: Deadline Overdue" :
               event === "handoverSignoff" ? "📝 Handover Certified" :
               "👥 Roster Registry Synced",
        body: message,
        timestamp: timestampStr
      };
      setSimulatedPushes(prev => [newPush, ...prev]);
      setActivePushAlerts(prev => [...prev, newPush]);

      // Dismiss floating alert toast after 4s
      setTimeout(() => {
        setActivePushAlerts(prev => prev.filter(p => p.id !== newPush.id));
      }, 4000);
    }
  };

  const prevDbStateRef = useRef<HandoverState | null>(null);

  // Monitor database changes and dispatch according to custom preferences
  useEffect(() => {
    if (!dbState) return;
    
    if (prevDbStateRef.current) {
      const prev = prevDbStateRef.current;
      const workspaceName = workspaces.find(w => w.id === currentSelectedWorkspaceId)?.name || "Primary Shift Space";
      
      // Check if tasks count changed
      if (dbState.tasks.length > prev.tasks.length) {
        const addedTask = dbState.tasks[0];
        if (addedTask) {
          dispatchNotification({
            event: "taskAssignment",
            message: `New drilling task assigned: "${addedTask.description}" given to ${addedTask.ownerName} in "${workspaceName}".`,
            type: "success",
            details: {
              taskName: addedTask.description,
              assignee: addedTask.ownerName,
              dueDate: addedTask.dueDate,
              spaceName: workspaceName
            }
          });
        }
      } else if (dbState.tasks.length < prev.tasks.length) {
        dispatchNotification({
          event: "taskAssignment",
          message: `A task was deleted from active track under "${workspaceName}".`,
          type: "warning"
        });
      } else {
        // Check if tasks completed status changed
        dbState.tasks.forEach((task) => {
          const prevTask = prev.tasks.find(t => t.id === task.id);
          if (prevTask && prevTask.completed !== task.completed) {
            dispatchNotification({
              event: "taskAssignment",
              message: `Task status updated: "${task.description}" (assigned to ${task.ownerName}) is now ${task.completed ? "COMPLETED" : "OPEN"}.`,
              type: task.completed ? "success" : "info",
              details: {
                taskName: task.description,
                assignee: task.ownerName,
                dueDate: task.dueDate,
                spaceName: workspaceName
              }
            });
          }
        });
      }

      // Check backlog count changed
      if (dbState.backlog.length > prev.backlog.length) {
        const addedBacklog = dbState.backlog[0];
        if (addedBacklog) {
          dispatchNotification({
            event: "taskAssignment",
            message: `New backlog item filed: "${addedBacklog.description}" owned by ${addedBacklog.ownerName} in "${workspaceName}".`,
            type: "success",
            details: {
              taskName: addedBacklog.description,
              assignee: addedBacklog.ownerName,
              dueDate: addedBacklog.backlogDate,
              spaceName: workspaceName
            }
          });
        }
      } else if (dbState.backlog.length < prev.backlog.length) {
        dispatchNotification({
          event: "taskAssignment",
          message: `A backlog item was removed/archived from track in "${workspaceName}".`,
          type: "warning"
        });
      } else {
        // Check if backlog completed status changed
        dbState.backlog.forEach((item) => {
          const prevItem = prev.backlog.find(b => b.id === item.id);
          if (prevItem && prevItem.completed !== item.completed) {
            dispatchNotification({
              event: "taskAssignment",
              message: `Backlog progress updated: "${item.description}" owned by ${item.ownerName} set to ${item.completed ? 'COMPLETED' : 'OPEN'}.`,
              type: "info",
              details: {
                taskName: item.description,
                assignee: item.ownerName,
                dueDate: item.backlogDate,
                spaceName: workspaceName
              }
            });
          }
        });
      }

      // Leads updated info notifications
      if (dbState.outgoingLead !== prev.outgoingLead && prev.outgoingLead) {
        dispatchNotification({
          event: "handoverSignoff",
          message: `Outgoing Shift Lead is now updated to: "${dbState.outgoingLead}" in "${workspaceName}".`,
          type: "info"
        });
      }
      if (dbState.incomingLead !== prev.incomingLead && prev.incomingLead) {
        dispatchNotification({
          event: "handoverSignoff",
          message: `Incoming Lead Counterpart aligned to: "${dbState.incomingLead}" in "${workspaceName}".`,
          type: "info"
        });
      }
    }
    
    prevDbStateRef.current = dbState;
  }, [dbState, currentSelectedWorkspaceId, workspaces]);

  // Firestore object references
  // (Moved up to prevent hoisting/block-scoping errors)

  // Load Firestore configurations initially
  useEffect(() => {
    // 1. Retrieve dynamic backend configuration keys (works in Dev & Cloud Run production)
    fetch("/api/config")
      .then((res) => {
        if (!res.ok) throw new Error("Backend api not available");
        return res.json();
      })
      .then((apiConfig) => {
        if (apiConfig && apiConfig.projectId && apiConfig.apiKey) {
          const keys = {
            projectId: apiConfig.projectId,
            apiKey: apiConfig.apiKey,
            authDomain: apiConfig.authDomain || "",
            appId: apiConfig.appId || "",
            firestoreDatabaseId: apiConfig.firestoreDatabaseId || ""
          };
          setIsEnvConfigured(true);
          setConfigKeys(keys);
          initializeFirebaseSync(keys);
        } else {
          throw new Error("Missing credentials in api response");
        }
      })
      .catch(() => {
        // 2. Fall back to static compile-time Vite variables
        const env = (import.meta as any).env || {};
        const envProjectId = env.VITE_FIREBASE_PROJECT_ID;
        const envApiKey = env.VITE_FIREBASE_API_KEY;
        const envAuthDomain = env.VITE_FIREBASE_AUTH_DOMAIN || "";
        const envAppId = env.VITE_FIREBASE_APP_ID || "";
        const envDatabaseId = env.VITE_FIREBASE_DATABASE_ID || "";

        if (envProjectId && envApiKey) {
          const keys = {
            projectId: envProjectId,
            apiKey: envApiKey,
            authDomain: envAuthDomain,
            appId: envAppId,
            firestoreDatabaseId: envDatabaseId
          };
          setIsEnvConfigured(true);
          setConfigKeys(keys);
          initializeFirebaseSync(keys);
        } else {
          // 3. Fall back to manually connected client credentials from local storage
          const savedKeys = localStorage.getItem("handover_firebase_keys");
          if (savedKeys) {
            try {
              const parsed = JSON.parse(savedKeys);
              if (parsed.projectId && parsed.apiKey) {
                setConfigKeys(parsed);
                initializeFirebaseSync(parsed);
              } else {
                throw new Error("Invalid keys in localStorage");
              }
            } catch (e) {
              console.error("Error reading saved localStorage keys", e);
              setConnectionStatusMsg({
                type: "error",
                text: "No Firebase configuration detected. Please enter your Firebase config keys in the Settings panel below to connect."
              });
              setIsSettingsOpen(true);
            }
          } else {
            setConnectionStatusMsg({
              type: "error",
              text: "No Firebase configuration detected. Please enter your Firebase config keys in the Settings panel below to connect."
            });
            setIsSettingsOpen(true);
          }
        }
      });
  }, []);

  // Save workspace settings & selection to localStorage
  useEffect(() => {
    localStorage.setItem("handover_workspace_list", JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    localStorage.setItem("handover_active_workspace_id", currentSelectedWorkspaceId);
  }, [currentSelectedWorkspaceId]);

  // Tab state
  const [activeTab, setActiveTab] = useState<"tracker" | "analytics">("tracker");
  const [isRulesCopied, setIsRulesCopied] = useState(false);

  // Synchronize DB states with Firebase if active
  const triggerFirebaseWrite = async (updatedState: HandoverState) => {
    if (firebaseConfigMode === "cloud" && firestoreInstance) {
      try {
        await setDoc(doc(firestoreInstance, "handoverSystem", currentSelectedWorkspaceId), updatedState);
      } catch (err: any) {
        console.error("Error writing document to Firestore", err);
        setConnectionStatusMsg({
          type: "error",
          text: `Write Error: ${err.message}. Please verify Firestore database exists & security policies are writeable.`
        });
        handleFirestoreError(err, OperationType.WRITE, `handoverSystem/${currentSelectedWorkspaceId}`);
      }
    }
  };

  const initializeFirebaseSync = (config: typeof configKeys) => {
    try {
      setConnectionStatusMsg({ type: "info", text: "Connecting to Firebase Database..." });
      
      let app;
      if (getApps().length > 0) {
        app = getApp();
      } else {
        app = initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          appId: config.appId
        });
      }

      const db = config.firestoreDatabaseId 
        ? getFirestore(app, config.firestoreDatabaseId)
        : getFirestore(app);
      setFirestoreInstance(db);
      setFirebaseConfigMode("cloud");
      setIsSettingsOpen(false); // compress panel on success
      
      setConnectionStatusMsg({
        type: "success",
        text: `Connected to Cloud Sync. Querying workspace listing for repository: "${config.projectId}".`
      });

      // Purge currentWorkspace if it exists
      deleteDoc(doc(db, "handoverSystem", "currentWorkspace")).catch(err => {
        console.log("Cleanup of legacy default workspace:", err);
      });

      // Query database for all existing workspaces to populate the dropdown list
      getDocs(collection(db, "handoverSystem")).then((snapshot) => {
        const loadedWorkspaces: { id: string; name: string }[] = [];
        if (!snapshot.empty) {
          snapshot.docs.forEach((docSnapshot) => {
            const displayName = docSnapshot.id === "ws-primary-shift-space" 
              ? "Primary Shift Space" 
              : docSnapshot.id.replace(/^ws-/, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            
            // Filter out "Handover Testing" or similar and legacy default
            if (
              displayName !== "Handover Testing" &&
              docSnapshot.id !== "handover-testing" &&
              docSnapshot.id !== "ws-handover-testing" &&
              docSnapshot.id !== "currentWorkspace"
            ) {
              loadedWorkspaces.push({
                id: docSnapshot.id,
                name: displayName
              });
            }
          });
        }
        
        // Ensure "ws-primary-shift-space" exists in list
        if (!loadedWorkspaces.some(w => w.id === "ws-primary-shift-space")) {
          loadedWorkspaces.unshift({ id: "ws-primary-shift-space", name: "Primary Shift Space" });
        }
        
        setWorkspaces(loadedWorkspaces);
      }).catch(err => {
        console.error("Failed to load existing cloud workspaces list", err);
        handleFirestoreError(err, OperationType.LIST, "handoverSystem");
      });

    } catch (err: any) {
      console.error("Firebase init failed", err);
      setConnectionStatusMsg({
        type: "error",
        text: `Initialization Failed: ${err.message}. Check your configuration formats.`
      });
    }
  };

  // Standalone Dashboard Syncing
  useEffect(() => {
    if (firebaseConfigMode !== "cloud" || !firestoreInstance) return;

    const colRef = collection(firestoreInstance, "handoverSystem");
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const data: Record<string, HandoverState> = {};
      snapshot.docs.forEach((docSnapshot) => {
        if (
          docSnapshot.id !== "currentWorkspace" &&
          docSnapshot.id !== "handover-testing" &&
          docSnapshot.id !== "ws-handover-testing"
        ) {
          data[docSnapshot.id] = docSnapshot.data() as HandoverState;
        }
      });
      setAllWorkspacesData(data);
    }, (err) => {
      console.warn("Failed to listen to all workspaces collection snapshot:", err);
    });

    return () => unsubscribe();
  }, [firebaseConfigMode, firestoreInstance]);

  useEffect(() => {
    if (firebaseConfigMode !== "demo") return;

    const data: Record<string, HandoverState> = {};
    workspaces.forEach((w) => {
      if (w.id === "currentWorkspace") return;
      const saved = localStorage.getItem(`handover_local_demo_db_${w.id}`);
      if (saved) {
        try {
          data[w.id] = JSON.parse(saved);
        } catch (e) {
          data[w.id] = DEFAULT_WORKSPACE_STATE;
        }
      } else {
        data[w.id] = DEFAULT_WORKSPACE_STATE;
      }
    });
    setAllWorkspacesData(data);
  }, [firebaseConfigMode, workspaces, dbState]);

  // Real-time snapshot subscription state effect triggered by active workspace or firestore updates
  useEffect(() => {
    if (firebaseConfigMode !== "cloud" || !firestoreInstance) {
      return;
    }

    setConnectionStatusMsg({
      type: "info",
      text: `Syncing with cloud workspace: "${currentSelectedWorkspaceId}"...`
    });

    const docRef = doc(firestoreInstance, "handoverSystem", currentSelectedWorkspaceId);

    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const cloudData = snapshot.data() as HandoverState;
        
        // Verify cloudData has structures
        if (cloudData.tasks && cloudData.backlog && cloudData.history) {
          setDbState(cloudData);
          setConnectionStatusMsg({
            type: "success",
            text: `Connected to Cloud Sync. Synced active Firebase repository: "${configKeys.projectId}" -> workspace "${currentSelectedWorkspaceId}".`
          });
        }
      } else {
        // Document does not exist yet. Only initialize ws-primary-shift-space automatically.
        // For other workspaces, do NOT automatically recreate them in Firestore to prevent reviving deleted spaces!
        if (currentSelectedWorkspaceId === "ws-primary-shift-space") {
          setDbState((current) => {
            setDoc(docRef, current).then(() => {
              setConnectionStatusMsg({
                type: "success",
                text: `Initialized repository document in your Firestore Cloud: "${configKeys.projectId}" -> workspace "${currentSelectedWorkspaceId}"!`
              });
            }).catch(writeErr => {
              console.error("Initial Firestore document push failed", writeErr);
              handleFirestoreError(writeErr, OperationType.WRITE, `handoverSystem/${currentSelectedWorkspaceId}`);
            });
            return current;
          });
        } else {
          // The database workspace of this ID has been deleted or does not exist in the collection collection.
          // Let's fallback gracefully without writing to Firestore.
          setConnectionStatusMsg({
            type: "warning",
            text: `Workspace "${currentSelectedWorkspaceId}" is empty or has been deleted from cloud database.`
          });
          setDbState(DEFAULT_WORKSPACE_STATE);

          // Gracefully filter out this invalid/deleted workspace from list and switch back to default
          setWorkspaces(prev => {
            const updated = prev.filter(w => w.id !== currentSelectedWorkspaceId);
            localStorage.setItem("handover_workspace_list", JSON.stringify(updated));
            return updated;
          });
          
          handleWorkspaceChange("ws-primary-shift-space");
        }
      }
    }, (err) => {
      console.error("Snapshot subscription error", err);
      setConnectionStatusMsg({
        type: "error",
        text: `Permission / Connection Denied: ${err.message}. Ensure your Rules match 'handoverSystem/{workspaceId}' and your keys are correct.`
      });
      try {
        handleFirestoreError(err, OperationType.GET, `handoverSystem/${currentSelectedWorkspaceId}`);
      } catch (e) {
        // Just let it log
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentSelectedWorkspaceId, firestoreInstance, firebaseConfigMode]);

  const handleWorkspaceChange = (workspaceId: string) => {
    setCurrentSelectedWorkspaceId(workspaceId);
    
    // In cloud mode, immediately clear current UI tables/data to fulfill the 'clear the tables' directive
    // until onSnapshot updates from Firestore.
    // In demo/local mode, load from localStorage or DEFAULT_WORKSPACE_STATE right away to prevent race conditions.
    if (firebaseConfigMode === "cloud") {
      setDbState({
        outgoingLead: "",
        incomingLead: "",
        tasks: [],
        backlog: [],
        history: [],
        signoffChecklist: {
          blockersReviewed: false,
          systemsNormal: false,
          credsTransferred: false,
        },
        latestLog: ""
      });
    } else {
      const saved = localStorage.getItem(`handover_local_demo_db_${workspaceId}`);
      if (saved) {
        try {
          setDbState(JSON.parse(saved));
        } catch (e) {
          setDbState(DEFAULT_WORKSPACE_STATE);
        }
      } else {
        setDbState(DEFAULT_WORKSPACE_STATE);
      }
    }
  };

  const handleCreateNewWorkspace = (rawName: string) => {
    setWorkspaceCreateError("");
    if (!rawName || !rawName.trim()) {
      setWorkspaceCreateError("Workspace name is required.");
      return false;
    }

    const cleanName = rawName.trim();
    const id = "ws-" + cleanName.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") // sanitize to alphanumeric and dashes
      .replace(/(^-|-$)/g, "");    // strip leading/trailing dashes

    if (!id) {
      setWorkspaceCreateError("Invalid name. Please use standard characters.");
      return false;
    }

    // Check if duplicate
    if (workspaces.some(w => w.id === id)) {
      setWorkspaceCreateError("This space already exists. Switching you to it...");
      setTimeout(() => {
        handleWorkspaceChange(id);
        setShowNewWorkspaceModal(false);
        setNewWorkspaceInputName("");
        setWorkspaceCreateError("");
      }, 800);
      return true;
    }

    const newWorkspaceObj = { id, name: cleanName };

    if (firebaseConfigMode === "cloud" && firestoreInstance) {
      // In cloud mode:
      setConnectionStatusMsg({ type: "info", text: `Provisioning cloud workspace "${cleanName}"...` });
      const docRef = doc(firestoreInstance, "handoverSystem", id);
      
      const initialCloudState: HandoverState = {
        outgoingLead: "",
        incomingLead: "",
        tasks: [],
        backlog: [],
        history: [],
        signoffChecklist: {
          blockersReviewed: false,
          systemsNormal: false,
          credsTransferred: false,
        },
        latestLog: "",
        personnel: DEFAULT_PERSONNEL
      };

      setDoc(docRef, initialCloudState).then(() => {
        setWorkspaces(prev => {
          const updated = [...prev, newWorkspaceObj];
          localStorage.setItem("handover_workspace_list", JSON.stringify(updated));
          return updated;
        });
        setCurrentSelectedWorkspaceId(id);
        localStorage.setItem("handover_active_workspace_id", id);
        
        setConnectionStatusMsg({
          type: "success",
          text: `Prepared new workspace document in your Firestore: "${cleanName}"`
        });
        addNotification(`Successfully created handover space "${cleanName}" in Firestore Cloud!`, "success");
        setShowNewWorkspaceModal(false);
        setNewWorkspaceInputName("");
        setWorkspaceCreateError("");
      }).catch(err => {
        console.error("Failed to provision new cloud workspace", err);
        setWorkspaceCreateError(`Failed to write new workspace: ${err.message}`);
        handleFirestoreError(err, OperationType.WRITE, `handoverSystem/${id}`);
      });
    } else {
      // In local demo mode:
      const defaultState: HandoverState = {
        outgoingLead: "",
        incomingLead: "",
        tasks: [],
        backlog: [],
        history: [],
        signoffChecklist: {
          blockersReviewed: false,
          systemsNormal: false,
          credsTransferred: false,
        },
        latestLog: "",
        personnel: DEFAULT_PERSONNEL
      };
      localStorage.setItem(`handover_local_demo_db_${id}`, JSON.stringify(defaultState));
      
      setWorkspaces(prev => {
        const updated = [...prev, newWorkspaceObj];
        localStorage.setItem("handover_workspace_list", JSON.stringify(updated));
        return updated;
      });
      setCurrentSelectedWorkspaceId(id);
      localStorage.setItem("handover_active_workspace_id", id);
      
      addNotification(`Successfully created handover space "${cleanName}" in Local Storage!`, "success");
      setShowNewWorkspaceModal(false);
      setNewWorkspaceInputName("");
      setWorkspaceCreateError("");
    }
    return true;
  };

  const handleDeleteWorkspace = (id: string) => {
    if (workspaces.length <= 1) {
      addNotification("At least one active handover space must exist.", "warning");
      return;
    }

    const wsName = workspaces.find(w => w.id === id)?.name || id;
    
    // Filter workspaces
    const updatedWorkspaces = workspaces.filter(w => w.id !== id);
    setWorkspaces(updatedWorkspaces);
    localStorage.setItem("handover_workspace_list", JSON.stringify(updatedWorkspaces));

    // Remove local storage state in case of demo mode
    localStorage.removeItem(`handover_local_demo_db_${id}`);

    // If in cloud, try to delete doc
    if (firebaseConfigMode === "cloud" && firestoreInstance) {
      const docRef = doc(firestoreInstance, "handoverSystem", id);
      deleteDoc(docRef).then(() => {
        addNotification(`Deleted workspace "${wsName}" from Cloud Sync.`, "success");
      }).catch(err => {
        console.error("Failed to delete workspace doc from Firestore", err);
        handleFirestoreError(err, OperationType.DELETE, `handoverSystem/${id}`);
      });
    }

    // Switch selection if current was deleted
    if (currentSelectedWorkspaceId === id) {
      const fallbackId = updatedWorkspaces[0]?.id || "ws-primary-shift-space";
      handleWorkspaceChange(fallbackId);
    }

    addNotification(`Handover workspace "${wsName}" deleted successfully.`, "success");
  };

  const confirmDelete = () => {
    if (!deleteConfirmation) return;
    const { type, id, name } = deleteConfirmation;
    setDeleteConfirmation(null);

    switch (type) {
      case "workspace":
        handleDeleteWorkspace(id);
        break;
      case "task":
        handleDeleteTask(id);
        break;
      case "backlog":
        handleDeleteBacklog(id);
        break;
      case "person":
        handleRemovePersonnel(id, name);
        break;
      case "history":
        handleDeleteHistory(id);
        break;
    }
  };

  const handleConnectFirebase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!configKeys.projectId || !configKeys.apiKey) {
      setConnectionStatusMsg({
        type: "error",
        text: "Project ID and API Key are strict requirements."
      });
      return;
    }

    // Save configuration settings
    localStorage.setItem("handover_firebase_keys", JSON.stringify(configKeys));
    initializeFirebaseSync(configKeys);
  };

  const handleDisconnectFirebase = () => {
    localStorage.removeItem("handover_firebase_keys");
    setIsEnvConfigured(false);
    setFirebaseConfigMode("demo");
    setFirestoreInstance(null);
    setConfigKeys({
      projectId: "",
      apiKey: "",
      authDomain: "",
      appId: ""
    });
    setConnectionStatusMsg({
      type: "info",
      text: "Database cloud integration terminated. Reverted to local session state."
    });
    addNotification("Disconnected from Firebase Cloud Sync. Offline/Local mode is active.", "info");
    setIsSettingsOpen(true);
  };

  const handleTasksSort = (field: "completed" | "description" | "ownerName" | "priority" | "dueDate") => {
    if (tasksSortField === field) {
      if (tasksSortDirection === "asc") {
        setTasksSortDirection("desc");
      } else {
        setTasksSortField(null);
      }
    } else {
      setTasksSortField(field);
      setTasksSortDirection("asc");
    }
  };

  const handleBacklogSort = (field: "completed" | "description" | "ownerName" | "priority" | "backlogDate") => {
    if (backlogSortField === field) {
      if (backlogSortDirection === "asc") {
        setBacklogSortDirection("desc");
      } else {
        setBacklogSortField(null);
      }
    } else {
      setBacklogSortField(field);
      setBacklogSortDirection("asc");
    }
  };

  const getSortedTasks = () => {
    if (!tasksSortField) return dbState.tasks;
    return [...dbState.tasks].sort((a, b) => {
      let valA = a[tasksSortField];
      let valB = b[tasksSortField];

      if (tasksSortField === "priority") {
        const priorityWeights = { High: 3, Medium: 2, Low: 1 };
        valA = priorityWeights[a.priority] || 0;
        valB = priorityWeights[b.priority] || 0;
      } else if (typeof valA === "boolean") {
        valA = valA ? 1 : 0;
        valB = valB ? 1 : 0;
      } else if (typeof valA === "string" && typeof valB === "string") {
        return tasksSortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      if (valA < valB) return tasksSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return tasksSortDirection === "asc" ? 1 : -1;
      return 0;
    });
  };

  const getSortedBacklog = () => {
    if (!backlogSortField) return dbState.backlog;
    return [...dbState.backlog].sort((a, b) => {
      let valA = a[backlogSortField];
      let valB = b[backlogSortField];

      if (backlogSortField === "priority") {
        const priorityWeights = { High: 3, Medium: 2, Low: 1 };
        valA = priorityWeights[a.priority] || 0;
        valB = priorityWeights[b.priority] || 0;
      } else if (typeof valA === "boolean") {
        valA = valA ? 1 : 0;
        valB = valB ? 1 : 0;
      } else if (typeof valA === "string" && typeof valB === "string") {
        return backlogSortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      if (valA < valB) return backlogSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return backlogSortDirection === "asc" ? 1 : -1;
      return 0;
    });
  };

  const renderSortIcon = (
    field: string,
    currentField: string | null,
    direction: "asc" | "desc"
  ) => {
    if (currentField !== field) {
      return <span className="opacity-30 text-[10px] ml-1">↕</span>;
    }
    return direction === "asc" ? (
      <span className="text-indigo-650 text-xs font-bold font-sans ml-1 text-center">▲</span>
    ) : (
      <span className="text-indigo-650 text-xs font-bold font-sans ml-1 text-center">▼</span>
    );
  };

  // Helper: dynamic calculation of days difference
  const calculateDaysRemaining = (dateString: string) => {
    const targetDate = new Date(dateString);
    const diffTime = targetDate.getTime() - CURRENT_DATE_VAL.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)} days overdue`, isOverdue: true };
    } else if (diffDays === 0) {
      return { text: `Due today`, isOverdue: false, isToday: true };
    } else if (diffDays === 1) {
      return { text: `Due in 1 day`, isOverdue: false };
    }
    return { text: `Due in ${diffDays} days`, isOverdue: false };
  };

  // Helper: dynamic calculation of aging in days
  const calculateAgingDays = (dateString: string) => {
    const start = new Date(dateString);
    const diffTime = CURRENT_DATE_VAL.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? 0 : diffDays;
  };

  // State modifier wrappers to handle both demo state or firebase writes
  const updateWorkspaceState = (updater: (prev: HandoverState) => HandoverState) => {
    setDbState((prev) => {
      const next = updater(prev);
      if (firebaseConfigMode === "cloud" && firestoreInstance) {
        triggerFirebaseWrite(next);
      } else if (firebaseConfigMode === "demo") {
        localStorage.setItem(`handover_local_demo_db_${currentSelectedWorkspaceId}`, JSON.stringify(next));
      }
      return next;
    });
  };

  // Form Handlers
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.description || !newTask.ownerName) return;

    const taskItem: HandoverTask = {
      id: `task-${Date.now()}`,
      description: newTask.description,
      ownerName: newTask.ownerName,
      priority: newTask.priority,
      dueDate: newTask.dueDate,
      completed: false
    };

    updateWorkspaceState((prev) => ({
      ...prev,
      tasks: [taskItem, ...prev.tasks]
    }));

    setNewTask({
      description: "",
      ownerName: "",
      priority: "Medium",
      dueDate: "2026-05-21"
    });
  };

  const handleToggleTask = (taskId: string) => {
    updateWorkspaceState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => t.id === taskId ? { ...t, completed: !t.completed } : t)
    }));
  };

  const handleDeleteTask = (taskId: string) => {
    updateWorkspaceState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== taskId)
    }));
  };

  const handleAddBacklog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBacklog.description || !newBacklog.ownerName) return;

    const backlogItem: BacklogTask = {
      id: `backlog-${Date.now()}`,
      description: newBacklog.description,
      ownerName: newBacklog.ownerName,
      priority: newBacklog.priority,
      backlogDate: newBacklog.backlogDate,
      completed: false
    };

    updateWorkspaceState((prev) => ({
      ...prev,
      backlog: [backlogItem, ...prev.backlog]
    }));

    setNewBacklog({
      description: "",
      ownerName: "",
      priority: "Medium",
      backlogDate: "2026-05-15"
    });
  };

  const handleToggleBacklog = (backlogId: string) => {
    updateWorkspaceState((prev) => ({
      ...prev,
      backlog: prev.backlog.map((b) => b.id === backlogId ? { ...b, completed: !b.completed } : b)
    }));
  };

  const handleDeleteBacklog = (backlogId: string) => {
    updateWorkspaceState((prev) => ({
      ...prev,
      backlog: prev.backlog.filter((b) => b.id !== backlogId)
    }));
  };

  const handleDeleteHistory = (historyId: string) => {
    updateWorkspaceState((prev) => ({
      ...prev,
      history: prev.history.filter((h) => h.id !== historyId)
    }));
    addNotification("Historical handover archive record deleted successfully.", "success");
  };

  const handlePromoteBacklog = (backlogId: string) => {
    const item = dbState.backlog.find(b => b.id === backlogId);
    if (!item) return;

    // Remove from backlog, add to active tasks
    updateWorkspaceState((prev) => {
      const activeTask: HandoverTask = {
        id: `task-promoted-${Date.now()}`,
        description: `[PROMOTED] ${item.description}`,
        ownerName: item.ownerName,
        priority: item.priority,
        dueDate: CURRENT_DATE_STR, // Due today
        completed: false
      };

      return {
        ...prev,
        backlog: prev.backlog.filter(b => b.id !== backlogId),
        tasks: [activeTask, ...prev.tasks]
      };
    });
  };

  // Toggle checklist items
  const handleToggleChecklist = (key: keyof SignoffChecklist) => {
    const isLeadOut = !!dbState.outgoingLead?.trim();
    const isLeadIn = !!dbState.incomingLead?.trim();
    if (!isLeadOut || !isLeadIn) {
      alert("Verification Restricted!\n\nYou must first select both the Outgoing Shift Lead and the Incoming Counterpart in the Shift Rotation panel before certifying any safety checklists.");
      addNotification("⚠️ Select Outgoing & Incoming Leads first to unlock checklist", "warning");
      return;
    }
    updateWorkspaceState((prev) => ({
      ...prev,
      signoffChecklist: {
        ...prev.signoffChecklist,
        [key]: !prev.signoffChecklist[key]
      }
    }));
  };

  // Handle Complete Handover Sign-off with popup verification dialog, agreement checks, and email override controls
  const handleConfirmSignOffSubmit = async () => {
    setSignoffResult({ status: "submitting", message: "Processing handover rotation and logs archiving...", sentTo: signoffEmailOverride });
    
    // Auto-update email override inside local settings so they don't lose it!
    setNotificationSettings(prev => ({ ...prev, userEmail: signoffEmailOverride }));

    // Capture precise, non-stale copies of current active tasks and backlog
    const currentTasks = [...dbState.tasks];
    const currentBacklog = [...dbState.backlog];

    const newHistoryItem: HandoverHistoryItem = {
      id: `history-${Date.now()}`,
      date: new Date().toISOString(),
      outgoingLead: dbState.outgoingLead,
      incomingLead: dbState.incomingLead,
      logText: logText,
      tasksCount: currentTasks.length,
      backlogCount: currentBacklog.length,
      signedOffBy: dbState.outgoingLead,
      tasks: currentTasks,
      backlog: currentBacklog
    };

    // Advanced rotation logic: 
    updateWorkspaceState((prev) => {
      const uncompletedTasks = prev.tasks.filter(t => !t.completed);
      return {
        ...prev,
        outgoingLead: prev.incomingLead, // Rotation!
        incomingLead: "", // Blank wait for input
        tasks: uncompletedTasks, // Keep uncompleted
        history: [newHistoryItem, ...prev.history],
        signoffChecklist: {
          blockersReviewed: false,
          systemsNormal: false,
          credsTransferred: false,
        },
        latestLog: ""
      };
    });

    const workspaceName = workspaces.find(w => w.id === currentSelectedWorkspaceId)?.name || currentSelectedWorkspaceId;

    // Trigger physical SMTP dispatch directly to parse standard SMTP results
    if (signoffEmailOverride.trim()) {
      try {
        const response = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipients: signoffEmailOverride,
            handover_data: {
              workspaceName: workspaceName,
              outgoingLead: newHistoryItem.outgoingLead,
              incomingLead: newHistoryItem.incomingLead,
              logText: newHistoryItem.logText,
              date: newHistoryItem.date,
              tasksCount: newHistoryItem.tasksCount,
              backlogCount: newHistoryItem.backlogCount,
              signedOffBy: newHistoryItem.signedOffBy,
              tasks: newHistoryItem.tasks,
              backlog: newHistoryItem.backlog
            }
          })
        });
        const totalText = await response.text();
        let data: any;
        try {
          data = JSON.parse(totalText);
        } catch (jsonErr: any) {
          throw new Error(`Response from server is not valid JSON (StatusCode ${response.status}): ${totalText.substring(0, 200) || "(Empty Body)"}`);
        }
        if (data.success) {
          setSignoffResult({
            status: "success",
            message: `Handover transaction successfully completed and database archived! Real-time email relay dispatched via secure SMTP. (Alert verification ID: ${data.messageId || "SMTP-OK"})`,
            sentTo: signoffEmailOverride
          });
          addNotification(`📧 Notification sent successfully: ${signoffEmailOverride}`, "success");
        } else if (data.reason === "SMTP_NOT_CONFIGURED") {
          setSignoffResult({
            status: "success",
            message: `Handover rotation completed successfully. (Real SMTP credentials are not configured in your environment; outbox saved strictly into the Simulation Sandbox panel).`,
            sentTo: signoffEmailOverride
          });
          addNotification(`📧 Handover notice saved to Simulation Box!`, "info");
        } else {
          setSignoffResult({
            status: "error",
            message: `Handover saved & archived, but real SMTP service reported an error: ${data.message || "Endpoint block"}.`,
            sentTo: signoffEmailOverride
          });
          addNotification(`⚠️ SMTP block: ${data.message}`, "warning");
        }
      } catch (err: any) {
        setSignoffResult({
          status: "error",
          message: `Handover database entry saved, but request failed to connect to email endpoint API server: ${err.message}`,
          sentTo: signoffEmailOverride
        });
        addNotification(`⚠️ SMTP response timeout`, "warning");
      }
    } else {
      setSignoffResult({
        status: "success",
        message: `Handover rotation completed and saved into historical archive. (No recipient emails were selected to dispatch notifications)`,
        sentTo: "None"
      });
    }

    // Trigger normal in-app / log dispatches
    dispatchNotification({
      event: "handoverSignoff",
      message: `Handover signed off by ${newHistoryItem.signedOffBy}. Shift rota successfully archived for space "${workspaceName}".`,
      type: "success",
      details: {
        signeeName: newHistoryItem.signedOffBy,
        spaceName: workspaceName,
        handoverRecord: newHistoryItem
      }
    });

    setLogText("");
  };

  const handleCompleteSignOff = () => {
    const isLeadOut = !!dbState.outgoingLead?.trim();
    const isLeadIn = !!dbState.incomingLead?.trim();
    const checklist = dbState.signoffChecklist;
    const isChecklistComplete = !!(checklist?.blockersReviewed && checklist?.systemsNormal && checklist?.credsTransferred);
    const isNotesFilled = !!(logText || "").trim();

    if (!isLeadOut || !isLeadIn || !isChecklistComplete || !isNotesFilled) {
      const missing = [];
      if (!isLeadOut) missing.push("Outgoing Shift Lead");
      if (!isLeadIn) missing.push("Incoming Counterpart");
      if (!checklist?.blockersReviewed) missing.push("Direct Counterpart Briefing");
      if (!checklist?.systemsNormal) missing.push("Outstanding Tasks & Backlog Review");
      if (!checklist?.credsTransferred) missing.push("Master & Important Documents Handover");
      if (!isNotesFilled) missing.push("Handover Summary Notes");

      const warnMsg = `Verification incomplete! Missing: ${missing.join(", ")}.`;
      addNotification(`⚠️ ${warnMsg}`, "warning");
      alert(`Cannot complete handover sign-off.\n\nPlease resolve the following mandatory requirements:\n${missing.map(m => `• ${m}`).join("\n")}`);
      return;
    }

    // Instead of completing instantly, open the interactive confirmation modal
    setSignoffEmailOverride(notificationSettings.userEmail);
    setSignoffAgreement(false);
    setSignoffResult({ status: "idle", message: "", sentTo: "" });
    setShowSignoffConfirmationModal(true);
  };

  // Utility to obtain styled initials backdrops
  const getInitials = (name: string) => {
    if (!name) return "??";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Computed status calculations
  const calculateWorkspaceStatus = () => {
    const checklistCheckedCount = Object.values(dbState.signoffChecklist).filter(Boolean).length;
    
    if (checklistCheckedCount === 3 && logText.trim().length > 0) {
      return {
        label: "Ready to Sign Off",
        badgeStyle: "bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse",
        textStyle: "text-emerald-700"
      };
    } else if (checklistCheckedCount > 0) {
      return {
        label: "Pending Review",
        badgeStyle: "bg-amber-100 text-amber-800 border border-amber-300",
        textStyle: "text-amber-800"
      };
    } else {
      return {
        label: "Cloud Synced",
        badgeStyle: "bg-indigo-50 text-indigo-700 border border-indigo-200",
        textStyle: "text-indigo-700"
      };
    }
  };

  // Statistics for progress bars
  const completedCount = dbState.tasks.filter(t => t.completed).length;
  const totalTasksCount = dbState.tasks.length;
  const percentComplete = totalTasksCount > 0 ? Math.round((completedCount / totalTasksCount) * 100) : 0;

  const currentStatus = calculateWorkspaceStatus();

  return (
    <div className="bg-white min-h-screen text-slate-800 font-sans pb-16 antialiased">
      {/* Custom Inline Modal for adding independent handover space */}
      {showNewWorkspaceModal && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all animate-in fade-in duration-250">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateNewWorkspace(newWorkspaceInputName);
            }}
            className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 font-display flex items-center gap-2 text-sm uppercase tracking-tight">
                <Plus className="w-4 h-4 text-indigo-600" />
                New Handover Tracking Space
              </h3>
              <button
                type="button"
                onClick={() => setShowNewWorkspaceModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-mono p-1 rounded-full hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <p className="text-xs text-slate-500 leading-normal">
                Create an independent handover environment. Each space maintains custom rotational status, task lists, persistent backlog items, and history logs.
              </p>
              
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 font-mono tracking-wider">
                  Handover Space Name
                </label>
                <input
                  type="text"
                  placeholder="Handover from A to B on DD-MMM-YYY"
                  value={newWorkspaceInputName}
                  onChange={(e) => {
                    setNewWorkspaceInputName(e.target.value);
                    if (workspaceCreateError) setWorkspaceCreateError("");
                  }}
                  className="bg-white border border-slate-200 rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full shadow-xs"
                  autoFocus
                />
              </div>

              {workspaceCreateError && (
                <div className={`p-2.5 rounded text-xs text-left ${
                  workspaceCreateError.includes("Redirecting") || workspaceCreateError.includes("exists")
                    ? "bg-amber-50 text-amber-700 border border-amber-100"
                    : "bg-rose-50 text-rose-700 border border-rose-100"
                }`}>
                  {workspaceCreateError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewWorkspaceModal(false)}
                className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded text-slate-600 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded text-xs font-bold shadow-xs active:scale-98 transition-transform cursor-pointer"
              >
                Create Handover Space
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Warning Confirmation Modal */}
      {deleteConfirmation?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200 text-left">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <AlertTriangle className="w-6 h-6 shrink-0" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 font-display text-base">
                  Delete {deleteConfirmation.type === "workspace" ? "Handover Space" : 
                          deleteConfirmation.type === "task" ? "Active Task" : 
                          deleteConfirmation.type === "backlog" ? "Backlog Task" : 
                          deleteConfirmation.type === "history" ? "Handover Archive" : "Roster Entry"}?
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Target: <span className="text-slate-800 font-bold">{deleteConfirmation.name}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              {deleteConfirmation.type === "workspace" && (
                "Warning: This will permanently delete the selected handover workspace and all associated tasks, checklist states, roster allocations, and chronological logs. This process represents an irreversible purge, removing all traces from Local Storage and connected Live Firebase instances."
              )}
              {deleteConfirmation.type === "task" && (
                "Are you sure you want to remove this active tracking task? Other team members will lose visibility of this item."
              )}
              {deleteConfirmation.type === "backlog" && (
                "Are you sure you want to remove this item from the backlog queue?"
              )}
              {deleteConfirmation.type === "person" && (
                "This will remove the selected operator from the global personnel roster references."
              )}
              {deleteConfirmation.type === "history" && (
                "Are you absolutely sure you want to delete this completed shift handover record from the historical archives? This represents an irreversible deletion: the details, tasks active at sign-off, backlog snapshot, and chronological shift logs will be permanently erased."
              )}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded text-xs shadow-xs transition-colors cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteConfirmation?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200 text-left">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <AlertTriangle className="w-6 h-6 shrink-0" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 font-display text-base">
                  Delete {deleteConfirmation.type === "workspace" ? "Handover Space" : 
                          deleteConfirmation.type === "task" ? "Active Task" : 
                          deleteConfirmation.type === "backlog" ? "Backlog Task" : 
                          deleteConfirmation.type === "history" ? "Handover Archive" : "Roster Entry"}?
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Target: <span className="text-slate-800 font-bold">{deleteConfirmation.name}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              {deleteConfirmation.type === "workspace" && (
                "Warning: This will permanently delete the selected handover workspace and all associated tasks, checklist states, roster allocations, and chronological logs. This process represents an irreversible purge, removing all traces from Local Storage and connected Live Firebase instances."
              )}
              {deleteConfirmation.type === "task" && (
                "Are you sure you want to remove this active tracking task? Other team members will lose visibility of this item."
              )}
              {deleteConfirmation.type === "backlog" && (
                "Are you sure you want to remove this item from the backlog queue?"
              )}
              {deleteConfirmation.type === "person" && (
                "This will remove the selected operator from the global personnel roster references."
              )}
              {deleteConfirmation.type === "history" && (
                "Are you absolutely sure you want to delete this completed shift handover record from the historical archives? This represents an irreversible deletion: the details, tasks active at sign-off, backlog snapshot, and chronological shift logs will be permanently erased."
              )}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded text-xs shadow-xs transition-colors cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Carry Over Tasks Historic Modal */}
      {showCarryOverModal && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden p-5 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 text-slate-850">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <h3 className="font-bold text-slate-900 font-display flex items-center gap-2 text-sm uppercase tracking-tight">
                <Copy className="w-4 h-4 text-amber-500" />
                Carry Over Past Rotation Tasks
              </h3>
              <button
                type="button"
                onClick={() => setShowCarryOverModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-mono p-1 rounded-full hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-normal mb-3 text-left">
              Select and import pending or key operational safety tasks from historically complete handover rotations into the current active cycle. This fetches checklists across all historical registered records.
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 border border-slate-100 rounded-lg p-3 bg-slate-50/50">
              {(() => {
                const historicTasks = dbState.history.flatMap(record => {
                  const items = record.tasks || [];
                  return items.map(item => ({
                    ...item,
                    recordDate: record.date,
                    recordOut: record.outgoingLead,
                    recordIn: record.incomingLead
                  }));
                });

                if (historicTasks.length === 0) {
                  return (
                    <div className="p-8 text-center text-xs text-slate-450 italic">
                      No past tasks found in the history logs to carry over.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2.5">
                    {historicTasks.map((t) => {
                      const isSelected = selectedCarryOverTaskIds.includes(t.id);
                      const formattedDate = new Date(t.recordDate).toLocaleDateString([], { month: "short", day: "numeric" });
                      return (
                        <div 
                          key={t.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedCarryOverTaskIds(prev => prev.filter(id => id !== t.id));
                            } else {
                              setSelectedCarryOverTaskIds(prev => [...prev, t.id]);
                            }
                          }}
                          className={`p-3 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-3 select-none ${
                            isSelected 
                              ? "bg-amber-500/5 border-amber-500/30 shadow-2xs" 
                              : "bg-white border-slate-200 hover:border-slate-350"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} 
                            className="mt-1 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer w-4 h-4 shrink-0"
                          />
                          <div className="flex-1 space-y-1">
                            <p className={`text-xs font-semibold ${isSelected ? "text-amber-900" : "text-slate-800"}`}>
                              {t.description}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-[9px] text-slate-500 font-mono">
                              <span className="px-1 py-0.2 rounded bg-slate-100 border border-slate-200">Owner: {t.ownerName}</span>
                              <span className={`px-1 py-0.2 rounded ${t.priority === 'High' ? 'bg-rose-50 text-rose-500' : 'bg-slate-100'}`}>{t.priority}</span>
                              <span className="text-slate-400">Rot: {formattedDate} ({t.recordOut.split(" ")[0]} ➔ {t.recordIn.split(" ")[0]})</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = dbState.history.flatMap(h => h.tasks || []).map(t => t.id);
                    setSelectedCarryOverTaskIds(allIds);
                  }}
                  className="text-[10px] text-slate-650 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded font-bold transition-all cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCarryOverTaskIds([])}
                  className="text-[10px] text-slate-650 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded font-bold transition-all cursor-pointer"
                >
                  Clear All
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCarryOverModal(false)}
                  className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded text-slate-600 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedCarryOverTaskIds.length === 0}
                  onClick={() => {
                    const tasksToClone = dbState.history
                      .flatMap(h => h.tasks || [])
                      .filter(t => selectedCarryOverTaskIds.includes(t.id));

                    if (tasksToClone.length === 0) return;

                    const clonedTasks: HandoverTask[] = tasksToClone.map(t => ({
                      ...t,
                      id: `task-carry-${Date.now()}-${Math.random()}`,
                      completed: false
                    }));

                    updateWorkspaceState((prev) => ({
                      ...prev,
                      tasks: [...prev.tasks, ...clonedTasks]
                    }));

                    addNotification(`Imported & carried over ${clonedTasks.length} tasks matching historical records!`, "success");
                    setShowCarryOverModal(false);
                  }}
                  className="px-3.5 py-1.5 bg-amber-600 text-white hover:bg-amber-750 disabled:opacity-45 disabled:cursor-not-allowed rounded text-xs font-bold shadow-xs transition-colors cursor-pointer font-mono"
                >
                  Carry Over ({selectedCarryOverTaskIds.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Full Verification Sign-Off Modal */}
      {showSignoffConfirmationModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200 text-slate-800">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden p-5 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 font-display flex items-center gap-2 text-sm uppercase tracking-tight">
                📝 Authorized Shift Handover Sign-Off
              </h3>
              {signoffResult.status === "idle" && (
                <button
                  type="button"
                  onClick={() => setShowSignoffConfirmationModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-mono p-1 rounded-full hover:bg-slate-100"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-left">
              {signoffResult.status === "idle" ? (
                <>
                  <p className="text-xs text-slate-500 leading-normal">
                    You are finalizing the shift rotation. Please review the transitional briefing scope, verify recipient email endpoints, and explicitly confirm authorization.
                  </p>

                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-705 border-b border-slate-200 pb-1.5">
                      🔄 Shift Operator Rotation Details
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Outgoing shift lead</span>
                        <strong className="text-slate-800 block text-xs truncate">{dbState.outgoingLead}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Incoming counterparts</span>
                        <strong className="text-slate-800 block text-xs truncate">{dbState.incomingLead}</strong>
                      </div>
                    </div>
                    {logText.trim() && (
                      <div className="pt-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">transitional synopsis notes</span>
                        <p className="text-[11px] text-slate-600 bg-white border border-slate-200 p-2 rounded italic mt-1 leading-relaxed max-h-24 overflow-y-auto">
                          &quot;{logText}&quot;
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono font-bold text-slate-505">
                      Destination SMTP Alert Email Recipients
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., ops@drill-portal.com, duty-officer@drill-portal.com"
                      value={signoffEmailOverride}
                      onChange={(e) => setSignoffEmailOverride(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 font-mono text-xs focus:ring-1 focus:ring-indigo-400 outline-none"
                    />
                    <p className="text-[10px] text-slate-400">Multiple email addresses can be separated by commas.</p>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer p-3 bg-indigo-505/5 rounded-lg border border-indigo-550/10 hover:bg-indigo-50 border-rose-100 bg-rose-50/20">
                    <input
                      type="checkbox"
                      checked={signoffAgreement}
                      onChange={(e) => setSignoffAgreement(e.target.checked)}
                      className="mt-0.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer w-4 h-4 shrink-0"
                    />
                    <span className="text-[11px] text-slate-755 leading-normal font-sans">
                      I hereby authorize and certify that all shift logs, active safety checklists, outstanding tasks, and transition materials have been reviewed and successfully handed over in proper operational order.
                    </span>
                  </label>
                </>
              ) : signoffResult.status === "submitting" ? (
                <div className="p-8 text-center space-y-3.5">
                  <div className="w-8 h-8 rounded-full border-2 border-t-2 border-slate-200 border-t-indigo-600 animate-spin mx-auto"></div>
                  <p className="text-xs font-semibold text-slate-800">{signoffResult.message}</p>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-slate-100 bg-white text-center space-y-4">
                  <div className="text-4xl">
                    {signoffResult.status === "success" ? "🎉" : "⚠️"}
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
                    {signoffResult.status === "success" ? "Handover Rotation Success!" : "Handover Saved with SMTP Warning"}
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-150 text-left">
                    {signoffResult.message}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Dispatched recipients list: <strong className="font-mono text-slate-700 break-all">{signoffResult.sentTo}</strong>
                  </p>
                  
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSignoffConfirmationModal(false);
                        setSignoffResult({ status: "idle", message: "", sentTo: "" });
                      }}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded text-xs tracking-wide shadow-xs cursor-pointer"
                    >
                      Acknowledge & Close
                    </button>
                  </div>
                </div>
              )}
            </div>

            {signoffResult.status === "idle" && (
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 mt-4.5">
                <button
                  type="button"
                  onClick={() => setShowSignoffConfirmationModal(false)}
                  className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded text-slate-600 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!signoffAgreement || !signoffEmailOverride.trim()}
                  onClick={() => {
                    handleConfirmSignOffSubmit();
                  }}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] text-white rounded text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  Confirm & Authorize Rotation
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. See Previous Read Notifications Modal */}
      {showPreviousNotificationsPopup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200 text-slate-800">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden p-5 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-155">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3.5">
              <h3 className="font-bold text-slate-900 font-display flex items-center gap-2 text-sm uppercase tracking-tight text-left">
                📜 Archived Operational Notifications
              </h3>
              <button
                type="button"
                onClick={() => setShowPreviousNotificationsPopup(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-mono p-1 rounded-full hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-normal mb-3 text-left">
              These are cleared push/email operational notification records saved to browser local session storage.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 border border-slate-100 rounded-lg p-3 bg-slate-50/50">
              {readNotifications.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-450 italic">
                  No archived notifications in your local shift storage.
                </div>
              ) : (
                readNotifications.map((n, idx) => (
                  <div key={idx} className="bg-white border border-slate-250 rounded-lg p-3 text-left space-y-1 hover:shadow-2xs transition-shadow">
                    <p className="text-xs text-slate-700 leading-normal font-sans">{n.message}</p>
                    <span className="text-[9px] text-slate-400 font-mono block">{new Date(n.timestamp).toLocaleString() || n.timestamp}</span>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => {
                  if (confirm("Are you sure you want to permanently clear your historical notification archive?")) {
                    localStorage.removeItem("handover_read_notifications");
                    setReadNotifications([]);
                    addNotification("Notification archive cleared successfully.", "info");
                  }
                }}
                className="px-3 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-650 rounded text-xs font-semibold cursor-pointer"
              >
                🗑️ Clear Archive
              </button>
              <button
                type="button"
                onClick={() => setShowPreviousNotificationsPopup(false)}
                className="px-4 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded text-xs font-bold shadow-xs cursor-pointer"
              >
                Close Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Navigation/Info Header */}
      <header className="border-b border-rose-100 bg-white/85 sticky top-0 backdrop-blur z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-650 flex items-center justify-center text-white shadow-md">
              <Database className="w-5 h-5 active-pulse text-indigo-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-display font-bold tracking-tight text-slate-900">
                  Team Handover & Task Backlog
                </h1>
                <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-full bg-emerald-100 text-emerald-800 animate-pulse">
                  Live Cloud Sync
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Workspaces Sync Session: doc(db, &quot;handoverSystem&quot;, &quot;{currentSelectedWorkspaceId}&quot;)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
            {/* Active Handover Dropdown Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
              <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 font-mono">
                Active Handover:
              </span>
              <select
                value={currentSelectedWorkspaceId}
                onChange={(e) => handleWorkspaceChange(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              {workspaces.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const wsName = workspaces.find(w => w.id === currentSelectedWorkspaceId)?.name || currentSelectedWorkspaceId;
                    setDeleteConfirmation({
                      isOpen: true,
                      type: "workspace",
                      id: currentSelectedWorkspaceId,
                      name: wsName
                    });
                  }}
                  className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                  title="Delete current handover space"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Prominent, Clearly Visible Create Handover Space Button */}
            <button
              onClick={() => {
                setNewWorkspaceInputName("");
                setWorkspaceCreateError("");
                setShowNewWorkspaceModal(true);
              }}
              className="px-3.5 py-1.5 bg-indigo-650 hover:bg-indigo-700 bg-indigo-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm cursor-pointer select-none"
              title="Create New Handover Space..."
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Create Handover Space</span>
            </button>

            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              Settings
              {isSettingsOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {/* Notification Bell Icon Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotificationDropdown(!showNotificationDropdown);
                  setIsNewNotification(false);
                }}
                className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg flex items-center justify-center transition-colors relative cursor-pointer"
                title="Operational Alerts"
                type="button"
              >
                {isNewNotification ? (
                  <BellRing className="w-4 h-4 text-indigo-600 animate-bounce" />
                ) : (
                  <Bell className="w-4 h-4 text-slate-500" />
                )}
                {isNewNotification && (
                  <>
                    <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border border-white animate-ping"></span>
                    <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
                  </>
                )}
              </button>

              {showNotificationDropdown && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in-95 slide-in-from-top-2 duration-150 text-slate-800">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                      🔔 Operational Handover Alerts
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (notifications.length > 0) {
                          setReadNotifications(prev => {
                            const updated = [...notifications, ...prev];
                            localStorage.setItem("handover_read_notifications", JSON.stringify(updated));
                            return updated;
                          });
                        }
                        setNotifications([]);
                      }}
                      className="text-[10px] text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-medium cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No recent activity logs recorded.
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="p-3 text-xs flex items-start gap-2.5 hover:bg-slate-50/50 transition-colors">
                          <span className="mt-0.5 shrink-0">
                            {n.type === "success" && "🟢"}
                            {n.type === "warning" && "⚠️"}
                            {n.type === "info" && "🔹"}
                          </span>
                          <div className="flex-1 space-y-0.5 text-left">
                            <p className="text-slate-700 leading-normal font-medium font-sans">{n.message}</p>
                            <span className="text-[9px] text-slate-400 font-mono block">{n.timestamp}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {/* Archived Notifications Footer Link */}
                  <div className="bg-slate-50 border-t border-slate-100 p-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPreviousNotificationsPopup(true);
                        setShowNotificationDropdown(false);
                      }}
                      className="text-[10px] text-indigo-600 hover:text-indigo-850 hover:underline font-bold font-mono inline-flex items-center gap-1 cursor-pointer"
                    >
                      📜 See Previous Notifications ({readNotifications.length})
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        
        {/* Connection Status Banner */}
        <div className={`p-3.5 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm transition-all duration-300 ${
          connectionStatusMsg.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : connectionStatusMsg.type === "error"
            ? "bg-rose-50 border-rose-200 text-rose-800"
            : "bg-indigo-50 border-indigo-100 text-indigo-800"
        }`}>
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5">
              {connectionStatusMsg.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : connectionStatusMsg.type === "error" ? (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-indigo-500 shrink-0" />
              )}
            </div>
            <div>
              <p className="font-medium font-mono text-xs">{connectionStatusMsg.text}</p>
            </div>
          </div>
        </div>

        {/* 1. Collapsible Settings Control Panel */}
        {isSettingsOpen && (
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-5 shadow-md relative overflow-hidden space-y-5 animate-in slide-in-from-top-4 duration-200">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
            
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 pl-2">
              <div className="flex items-center gap-2 text-indigo-700 font-bold">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h2 className="text-xs uppercase tracking-wider font-display text-slate-900">
                  Settings / Roster & Cloud Panel
                </h2>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-900 border border-slate-300 rounded px-2.5 py-1 bg-white shadow-3xs cursor-pointer select-none"
              >
                ✕ Close Settings
              </button>
            </div>

            <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 pl-2 ${activeTheme.isDark ? 'text-slate-250' : 'text-slate-800'}`}>
              {/* Left Column: Personnel Roster Management */}
              <div className={`lg:col-span-4 space-y-4 border-b lg:border-b-0 pb-6 lg:pb-0 lg:border-r ${activeTheme.isDark ? 'border-slate-800' : 'border-slate-200'} lg:pr-6 text-left`}>
                <div>
                  <h3 className={`text-xs uppercase tracking-wider font-extrabold ${activeTheme.cardTitleText} font-mono flex items-center gap-1`}>
                    <span>👥</span> Add / Manage Personnel
                  </h3>
                  <p className={`text-[11px] ${activeTheme.cardSubText} leading-normal mt-1`}>
                    Add active drilling operators, superintendents, or offshore engineers. These roster members are used to assign task owners and shift transitions.
                  </p>
                </div>

                {/* Adding New Personnel Form */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const nameInput = (form.elements.namedItem("personName") as HTMLInputElement).value;
                    const titleInput = (form.elements.namedItem("personTitle") as HTMLInputElement).value;
                    if (nameInput && titleInput) {
                      handleAddPersonnel(nameInput, titleInput);
                      form.reset();
                    }
                  }} 
                  className={`space-y-3 ${activeTheme.mutedBg} p-3 border ${activeTheme.cardBorder} rounded-lg shadow-3xs`}
                >
                  <div className="space-y-1">
                    <label className={`text-[9px] uppercase font-bold tracking-wider ${activeTheme.cardSubText} font-mono block`}>
                      Full Name
                    </label>
                    <input
                      name="personName"
                      type="text"
                      placeholder="e.g., David Kim"
                      className={`${activeTheme.inputBg} border rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full shadow-xs`}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={`text-[9px] uppercase font-bold tracking-wider ${activeTheme.cardSubText} font-mono block`}>
                      Title / Role Spec
                    </label>
                    <input
                      name="personTitle"
                      type="text"
                      placeholder="e.g., Night Superintendent"
                      className={`${activeTheme.inputBg} border rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full shadow-xs`}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className={`w-full ${activeTheme.primaryBtn} text-[11px] font-bold py-1.5 px-3 rounded transition-colors cursor-pointer`}
                  >
                    + Add to Roster
                  </button>
                </form>

                {/* Personnel List */}
                <div className="space-y-1.5 flex flex-col">
                  <span className={`text-[9px] uppercase font-extrabold tracking-wider ${activeTheme.cardSubText} font-mono block`}>
                    Active Roster ({personnelList.length})
                  </span>
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {personnelList.length === 0 ? (
                      <div className={`p-4 text-center rounded border ${activeTheme.cardBorder} text-[10px] ${activeTheme.cardSubText}`}>
                        No engineers registered. Add personnel above.
                      </div>
                    ) : (
                      personnelList.map((p) => (
                        <div 
                          key={p.id} 
                          className={`flex items-center justify-between text-xs p-2 ${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-md shadow-3xs hover:opacity-90 transition-opacity`}
                        >
                          <div className="text-left">
                            <p className={`font-semibold ${activeTheme.cardTitleText}`}>{p.name}</p>
                            <p className={`text-[10px] ${activeTheme.cardSubText} font-medium`}>{p.title}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmation({
                              isOpen: true,
                              type: "person",
                              id: p.id,
                              name: p.name
                            })}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50/10 cursor-pointer"
                            title="Delete Personnel"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Middle Column: Visual Theme Selector */}
              <div className={`lg:col-span-4 space-y-4 border-b lg:border-b-0 pb-6 lg:pb-0 lg:border-r ${activeTheme.isDark ? 'border-slate-800' : 'border-slate-200'} lg:pr-6 text-left`}>
                <div>
                  <h3 className={`text-xs uppercase tracking-wider font-extrabold ${activeTheme.cardTitleText} font-mono flex items-center gap-1`}>
                    <span>🎨</span> Paint & Styling Themes
                  </h3>
                  <p className={`text-[11px] ${activeTheme.cardSubText} leading-normal mt-1`}>
                    Switch between highly polished themes with secure, readable contrast ratios and modern professional colors.
                  </p>
                </div>

                <div className="space-y-2 mt-2">
                  <label className={`text-[9px] uppercase font-bold tracking-wider ${activeTheme.cardSubText} font-mono block`}>
                    Active Workspace Palette
                  </label>
                  <div className="grid grid-cols-1 gap-2.5 max-h-[310px] overflow-y-auto pr-1">
                    {PALETTE_THEMES.map((theme) => {
                      const isSelected = selectedThemeId === theme.id;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => setSelectedThemeId(theme.id)}
                          className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                            isSelected 
                              ? `${theme.mutedBg} shadow-2xs` 
                              : `${theme.cardBg}`
                          } ${
                            theme.isDark 
                              ? 'bg-[#1e293b]/75 border-slate-700/80 text-white' 
                              : 'bg-white border-slate-200/85 text-slate-800'
                          } ${
                            isSelected 
                              ? 'ring-2 ring-indigo-500' 
                              : 'hover:scale-[1.01]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold font-sans flex items-center gap-1.5">
                              {isSelected ? "●" : "○"} {theme.name}
                            </span>
                            <div className="flex gap-1.5">
                              <span className={`w-3.5 h-3.5 rounded-full inline-block ${theme.bodyBg} border border-slate-300`}></span>
                              <span className={`w-3.5 h-3.5 rounded-full inline-block ${theme.activeRibbonBg} border border-slate-350`}></span>
                            </div>
                          </div>
                          <p className="text-[10px] opacity-75 mt-0.5 leading-tight">{theme.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Database Configuration */}
              <div className="lg:col-span-4 space-y-4 text-left">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className={`text-xs uppercase tracking-wider font-extrabold ${activeTheme.cardTitleText} font-mono flex items-center gap-1`}>
                      <span>🔌</span> Firebase Database Connection
                    </h3>
                    <p className={`text-[11px] ${activeTheme.cardSubText} leading-normal mt-1`}>
                      Link your workspace to a Google Cloud Firestore instance. All rotation checks, checklists, tasks, and historical entries sync in real-time.
                    </p>
                  </div>
                </div>

                {isEnvConfigured ? (
                  <div className={`${activeTheme.isDark ? 'bg-slate-900 border-slate-800' : 'bg-indigo-50/70 border border-indigo-200'} rounded-lg p-5 space-y-4 shadow-2xs`}>
                    <div className={`flex items-center gap-2 ${activeTheme.cardTitleText} font-bold text-xs font-mono uppercase tracking-wider`}>
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                      <span>Cloud Sync Active</span>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${activeTheme.cardSubText}`}>
                      This system connects automatically to your centralized Cloud Firestore cluster for continuous, cross-device updates.
                    </p>
                    <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-200/60 font-mono text-[10px]">
                      <div>
                        <span className="block font-bold text-slate-400">PROJECT ID:</span>
                        <span className={`font-bold tracking-tight ${activeTheme.cardTitleText}`}>{configKeys.projectId}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-400">ACCESS PROTOCOL:</span>
                        <span className={`font-bold ${activeTheme.accentText}`}>Enterprise Direct Link</span>
                      </div>
                    </div>

                    <div className={`rounded-md p-3 ${activeTheme.isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border border-slate-200'} space-y-2 text-left`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-extrabold font-mono tracking-wider ${activeTheme.cardTitleText} uppercase`}>
                          Required Firestore Security Rules
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const rulesStr = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /handoverSystem/{workspaceId} {\n      allow read, write: if true;\n    }\n    match /handoverSettings/{settingsId} {\n      allow read, write: if true;\n    }\n  }\n}`;
                            navigator.clipboard.writeText(rulesStr).then(() => {
                              setIsRulesCopied(true);
                              setTimeout(() => setIsRulesCopied(false), 2000);
                              addNotification("Firestore Rules copied to clipboard!", "success");
                            });
                          }}
                          className={`flex items-center gap-1 text-[9px] font-bold py-1 px-2 rounded border ${isRulesCopied ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600' : (activeTheme.isDark ? 'border-slate-800 hover:bg-slate-900 bg-slate-950 text-slate-400' : 'border-slate-300 hover:bg-slate-100 bg-white text-slate-600')} transition-colors cursor-pointer`}
                        >
                          <Copy className="w-3 h-3" />
                          <span>{isRulesCopied ? "Copied!" : "Copy Rules"}</span>
                        </button>
                      </div>
                      <p className={`text-[10px] ${activeTheme.cardSubText} leading-relaxed`}>
                        If you encounter <strong>"Missing or insufficient permissions"</strong> when adding personnel or items, make sure these rules are published in your Firebase Rules console.
                      </p>
                      <pre className="text-[9px] font-mono p-2 rounded bg-slate-900 text-slate-300 overflow-x-auto select-all leading-normal">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /handoverSystem/{workspaceId} {
      allow read, write: if true;
    }
    match /handoverSettings/{settingsId} {
      allow read, write: if true;
    }
  }
}`}
                      </pre>
                    </div>

                    <div className={`pt-2.5 border-t ${activeTheme.cardBorder} flex justify-end`}>
                      <button
                        type="button"
                        onClick={handleDisconnectFirebase}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold py-1.5 px-3 rounded transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        Disconnect from Cloud
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleConnectFirebase} className="space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className={`text-[9px] uppercase font-bold tracking-wider ${activeTheme.cardSubText} font-mono`}>Project ID <span className="text-rose-500">*</span></label>
                        <input
                          type="text"
                          placeholder="project-x-42"
                          value={configKeys.projectId}
                          onChange={(e) => setConfigKeys({ ...configKeys, projectId: e.target.value })}
                          className={`${activeTheme.inputBg} border rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full font-mono shadow-xs`}
                          required
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className={`text-[9px] uppercase font-bold tracking-wider ${activeTheme.cardSubText} font-mono`}>API Key <span className="text-rose-500">*</span></label>
                        <input
                          type="password"
                          placeholder="AIzaSyD-fake-key"
                          value={configKeys.apiKey}
                          onChange={(e) => setConfigKeys({ ...configKeys, apiKey: e.target.value })}
                          className={`${activeTheme.inputBg} border rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full font-mono shadow-xs`}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className={`text-[9px] uppercase font-bold tracking-wider ${activeTheme.cardSubText} font-mono`}>Auth Domain</label>
                        <input
                          type="text"
                          placeholder="app.firebaseapp.com"
                          value={configKeys.authDomain}
                          onChange={(e) => setConfigKeys({ ...configKeys, authDomain: e.target.value })}
                          className={`${activeTheme.inputBg} border rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full font-mono shadow-xs`}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className={`text-[9px] uppercase font-bold tracking-wider ${activeTheme.cardSubText} font-mono`}>App ID</label>
                        <input
                          type="text"
                          placeholder="1:2345:web:abc"
                          value={configKeys.appId}
                          onChange={(e) => setConfigKeys({ ...configKeys, appId: e.target.value })}
                          className={`${activeTheme.inputBg} border rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full font-mono shadow-xs`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        className={`flex-1 ${activeTheme.primaryBtn} text-xs font-bold py-2 px-4 rounded transition-colors cursor-pointer`}
                      >
                        Connect to Firebase Cloud
                      </button>
                      {firebaseConfigMode === "cloud" && (
                        <button
                          type="button"
                          onClick={handleDisconnectFirebase}
                          className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded transition-colors cursor-pointer shadow-3xs"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </form>
                )}

                <div className={`pt-2 text-[11px] ${activeTheme.cardSubText} border-t ${activeTheme.cardBorder} flex items-center justify-between`}>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <span className={`w-1.5 h-1.5 rounded-full ${activeTheme.id === 'alpine-forest' ? 'bg-emerald-600' : 'bg-indigo-600'} inline-block`}></span>
                    Database configurations are managed client-side.
                  </span>
                </div>

                {connectionStatusMsg.text && (
                  <div className={`p-2.5 rounded text-[11px] leading-relaxed flex items-center gap-2 ${
                    connectionStatusMsg.type === "success" 
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-100" 
                      : connectionStatusMsg.type === "error" 
                        ? "bg-rose-50 text-rose-800 border border-rose-100" 
                        : "bg-indigo-50/70 text-indigo-800 border border-indigo-100/60"
                  }`}>
                    <span>📣</span>
                    <span className="font-semibold">{connectionStatusMsg.text}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Divider line separating main roster/themes and granular notifications prefs */}
            <div className={`border-t my-6 ${activeTheme.cardBorder}`} />

            <div className="pl-2 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-3 border-slate-200/65">
                <div>
                  <h3 className={`text-sm uppercase tracking-wider font-extrabold ${activeTheme.cardTitleText} flex items-center gap-2 font-display`}>
                    <span>🔔</span> Operational Notification Dispatch Controls
                  </h3>
                  <p className={`text-[11px] ${activeTheme.cardSubText} leading-relaxed mt-0.5 max-w-2xl text-left`}>
                    Configure rules to selectively relay drilling events over multiple communication protocols. Test custom setups by triggering live overdue evaluations below.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      // Manual Scan for overdue alerts
                      const overdueTasks = dbState.tasks.filter(t => !t.completed && calculateDaysRemaining(t.dueDate).isOverdue);
                      if (overdueTasks.length === 0) {
                        addNotification("Scan complete: No overdue tasks currently found in active space.", "success");
                        return;
                      }
                      overdueTasks.forEach(task => {
                        dispatchNotification({
                          event: "overdueAlert",
                          message: `ALERT ESC-11: Checklist item "${task.description}" assigned to operator ${task.ownerName} is past due date (${task.dueDate})!`,
                          type: "warning",
                          details: {
                            taskName: task.description,
                            assignee: task.ownerName,
                            dueDate: task.dueDate,
                            spaceName: workspaces.find(w => w.id === currentSelectedWorkspaceId)?.name || "Primary Shift Space"
                          }
                        });
                      });
                      addNotification(`Live scanning compiled! Triggered ${overdueTasks.length} overdue alerts across active channels. Check outbox logs below!`, "success");
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    🚨 Scan & Dispatch Overdue Alerts
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSimulatedEmails([]);
                      setSimulatedPushes([]);
                      addNotification("Simulation trail logs and outbox records cleared.", "info");
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 border border-slate-350 hover:bg-slate-50/10 rounded cursor-pointer transition-colors"
                  >
                    ♻️ Reset Sim Outboxes
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Rule Matrix & Toggles */}
                <div className="lg:col-span-6 space-y-4">
                  <div className={`overflow-hidden border ${activeTheme.cardBorder} rounded-xl shadow-3xs`}>
                    <table className="w-full text-left font-sans text-xs border-collapse">
                      <thead>
                        <tr className={`${activeTheme.mutedBg} ${activeTheme.cardSubText} font-mono border-b ${activeTheme.cardBorder} uppercase font-bold text-[10px]`}>
                          <th className="p-3">Event Type Trigger</th>
                          <th className="p-3 text-center">Email</th>
                          <th className="p-3 text-center">Push</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${activeTheme.cardBorder} ${activeTheme.isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                        {/* Row 1: Task Assignment */}
                        <tr className="hover:opacity-90 transition-opacity">
                          <td className="p-3">
                            <span className="font-semibold block text-slate-900 dark:text-white text-left">⚙️ Task Assignments</span>
                            <span className={`text-[10px] ${activeTheme.cardSubText} block text-left`}>Assigning/updating actions & sub-checklists</span>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={notificationSettings.taskAssignment.email}
                              onChange={(e) => setNotificationSettings({
                                ...notificationSettings,
                                taskAssignment: { ...notificationSettings.taskAssignment, email: e.target.checked }
                              })}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={notificationSettings.taskAssignment.push}
                              onChange={(e) => setNotificationSettings({
                                ...notificationSettings,
                                taskAssignment: { ...notificationSettings.taskAssignment, push: e.target.checked }
                              })}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                            />
                          </td>
                        </tr>

                        {/* Row 2: Overdue Alert */}
                        <tr className="hover:opacity-90 transition-opacity">
                          <td className="p-3">
                            <span className="font-semibold block text-slate-900 dark:text-white text-left">🚨 Overdue Deadlines</span>
                            <span className={`text-[10px] ${activeTheme.cardSubText} block text-left`}>Warnings for tasks running past due limits</span>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={notificationSettings.overdueAlert.email}
                              onChange={(e) => setNotificationSettings({
                                ...notificationSettings,
                                overdueAlert: { ...notificationSettings.overdueAlert, email: e.target.checked }
                              })}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={notificationSettings.overdueAlert.push}
                              onChange={(e) => setNotificationSettings({
                                ...notificationSettings,
                                overdueAlert: { ...notificationSettings.overdueAlert, push: e.target.checked }
                              })}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                            />
                          </td>
                        </tr>

                        {/* Row 3: Handover Signoff */}
                        <tr className="hover:opacity-90 transition-opacity">
                          <td className="p-3">
                            <span className="font-semibold block text-slate-900 dark:text-white text-left">📝 Handover Sign-Offs</span>
                            <span className={`text-[10px] ${activeTheme.cardSubText} block text-left`}>Official shift transitions & lead certifications</span>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={notificationSettings.handoverSignoff.email}
                              onChange={(e) => setNotificationSettings({
                                ...notificationSettings,
                                handoverSignoff: { ...notificationSettings.handoverSignoff, email: e.target.checked }
                              })}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={notificationSettings.handoverSignoff.push}
                              onChange={(e) => setNotificationSettings({
                                ...notificationSettings,
                                handoverSignoff: { ...notificationSettings.handoverSignoff, push: e.target.checked }
                              })}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                            />
                          </td>
                        </tr>

                        {/* Row 4: Roster Update */}
                        <tr className="hover:opacity-90 transition-opacity">
                          <td className="p-3">
                            <span className="font-semibold block text-slate-900 dark:text-white text-left">👥 Personnel Roster Updates</span>
                            <span className={`text-[10px] ${activeTheme.cardSubText} block text-left`}>Registry changes in core workspace operators</span>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={notificationSettings.rosterUpdate.email}
                              onChange={(e) => setNotificationSettings({
                                ...notificationSettings,
                                rosterUpdate: { ...notificationSettings.rosterUpdate, email: e.target.checked }
                              })}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={notificationSettings.rosterUpdate.push}
                              onChange={(e) => setNotificationSettings({
                                ...notificationSettings,
                                rosterUpdate: { ...notificationSettings.rosterUpdate, push: e.target.checked }
                              })}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className={`p-4 border ${activeTheme.cardBorder} rounded-xl ${activeTheme.mutedBg} space-y-3 text-xs text-left`}>
                    <label className={`text-[10px] uppercase font-bold tracking-wider ${activeTheme.cardSubText} font-mono block text-left`}>
                      Alert Destination Email Endpoint
                    </label>
                    <div className="flex gap-2.5">
                      <input
                        type="text"
                        value={notificationSettings.userEmail}
                        onChange={(e) => setNotificationSettings({ ...notificationSettings, userEmail: e.target.value })}
                        className={`flex-1 ${activeTheme.inputBg} border rounded px-3 py-1.5 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-500 outline-none font-mono`}
                        placeholder="e.g. lead-operator@drill-portal.com, supervisor@drill-portal.com"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const raw = notificationSettings.userEmail;
                          const cleanEmails = raw
                            .split(/[;,]/)
                            .map(e => e.trim())
                            .filter(Boolean);

                          if (cleanEmails.length === 0) {
                            alert("Please enter at least one valid email address.");
                            return;
                          }

                          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                          const invalidEmails = cleanEmails.filter(e => !emailRegex.test(e));
                          if (invalidEmails.length > 0) {
                            alert(`Invalid email format detected for:\n${invalidEmails.join("\n")}\n\nPlease verify and try again.`);
                            return;
                          }

                          const formatted = cleanEmails.join(", ");
                          setNotificationSettings(prev => ({ ...prev, userEmail: formatted }));
                          addNotification(`Destination alert endpoint updated to: ${formatted}`, "success");
                          alert(`Success!\n\nEmail endpoint(s) verified & updated: \n• ${cleanEmails.join("\n• ")}\n\nNodemailer will relay shift rotation notices to all listed recipients.`);
                        }}
                        className={`px-3.5 py-1.5 ${activeTheme.primaryBtn} rounded text-xs font-bold transition-all cursor-pointer`}
                      >
                        Apply Override
                      </button>
                    </div>
                    <div className="space-y-1">
                      <p className={`text-[10px] ${activeTheme.cardSubText} text-left leading-normal`}>
                        <strong>📧 Email Dispatch Info:</strong> Direct HTML reports with current logs, active checklist tasks, and backlog tallies are automatically compiled and delivered using a secure Express SMTP relay. Support multiple emails by dividing them with commas.
                      </p>
                      <p className={`text-[10px] ${activeTheme.cardSubText} text-left leading-normal`}>
                        <strong>📲 Push Notification Info:</strong> Instant alerts regarding shift handover updates, new roster joins, and pending checklist items are sent as system pushes, accessible in the sandbox simulatoroutbox right beside.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Simulated Delivery Station Column */}
                <div className="lg:col-span-6 flex flex-col h-full min-h-[480px] border border-slate-200/90 rounded-xl overflow-hidden shadow-3xs bg-slate-900/5">
                  <div className="bg-slate-900/5 pb-0 border-b border-slate-200">
                    <div className="flex items-center justify-between px-4 pt-3 pb-1">
                      <span className="text-xs font-extrabold uppercase tracking-widest text-[#475569] font-mono text-left block">
                        📡 Operational Relay Simulator
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 text-[10px] font-bold border border-indigo-500/20 font-mono">
                        Active Sandbox
                      </span>
                    </div>
                    {/* Simulator tabs */}
                    <div className="flex px-3 mt-1.5 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSimulationTab("emails");
                          setExpandedEmailId(null);
                        }}
                        className={`px-3.5 py-1.5 text-xs font-bold font-sans rounded-t-lg transition-all cursor-pointer ${
                          activeSimulationTab === "emails"
                            ? "bg-white text-indigo-600 border-t border-x border-slate-200"
                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                        }`}
                      >
                        📬 Outbox Inbox ({simulatedEmails.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSimulationTab("pushes");
                          setExpandedEmailId(null);
                        }}
                        className={`px-3.5 py-1.5 text-xs font-bold font-sans rounded-t-lg transition-all cursor-pointer ${
                          activeSimulationTab === "pushes"
                            ? "bg-white text-indigo-600 border-t border-x border-slate-200"
                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                        }`}
                      >
                        📱 Push Payloads ({simulatedPushes.length})
                      </button>
                    </div>
                  </div>

                  {/* Sandbox Content Body */}
                  <div className="bg-white flex-1 overflow-y-auto p-4 flex flex-col text-slate-800">
                    {activeSimulationTab === "emails" ? (
                      expandedEmailId ? (
                        // Expanded Single Transactional Email Template
                        (() => {
                          const mail = simulatedEmails.find(e => e.id === expandedEmailId);
                          if (!mail) return null;
                          return (
                            <div className="space-y-3.5 text-left border border-slate-100 rounded-lg p-3 bg-[#FCFDFE] flex-1">
                              <button
                                type="button"
                                onClick={() => setExpandedEmailId(null)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer font-sans"
                              >
                                ← Return to Outbox List
                              </button>
                              
                              {/* Transactional Email Frame simulation */}
                              <div className="border border-slate-200 rounded-lg shadow-4xs overflow-hidden font-sans text-xs">
                                <div className="bg-slate-950 text-white p-3 space-y-1 font-mono text-[10px] text-left">
                                  <div><span className="text-slate-400 font-semibold select-none pr-1">FROM:</span>relays@drill-handover-portal.org</div>
                                  <div><span className="text-slate-400 font-semibold select-none pr-1">TO:</span>{mail.to}</div>
                                  <div><span className="text-slate-400 font-semibold select-none pr-1">DATE:</span>{mail.timestamp}</div>
                                  <div><span className="text-slate-400 font-semibold select-none pr-1">SUBJECT:</span>{mail.subject}</div>
                                </div>
                                
                                <div className="p-4 bg-white text-slate-800 space-y-4">
                                  {/* Header banner */}
                                  <div className="flex items-center justify-between border-b pb-2">
                                    <span className="text-xs font-bold tracking-tight text-slate-900">🔔 Core Portal Update</span>
                                    <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-mono font-bold uppercase select-none">
                                      {mail.type}
                                    </span>
                                  </div>
                                  
                                  {/* Main Email Message */}
                                  <div className="leading-relaxed text-slate-700 bg-slate-5/50 border border-slate-150 rounded p-3 text-[11px] font-sans text-left">
                                    {mail.body}
                                  </div>

                                  {/* Render structural alert context details of the Event */}
                                  {mail.details && Object.keys(mail.details).length > 0 && (
                                    <div className="space-y-1.5 border-t pt-3 text-left">
                                      <span className="text-[9px] uppercase font-extrabold font-mono tracking-wider text-slate-400 block select-none">Structured Payload Context</span>
                                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-slate-50 rounded-lg p-2.5 border border-slate-200/50">
                                        {mail.details.taskName && (
                                          <div>
                                            <span className="block text-slate-400 font-semibold text-[9px] select-none">TASK SPEC</span>
                                            <span className="text-slate-800 font-bold truncate block">{mail.details.taskName}</span>
                                          </div>
                                        )}
                                        {mail.details.assignee && (
                                          <div>
                                            <span className="block text-slate-400 font-semibold text-[9px] select-none">ASSIGNEE</span>
                                            <span className="text-slate-800 font-bold block">{mail.details.assignee}</span>
                                          </div>
                                        )}
                                        {mail.details.dueDate && (
                                          <div>
                                            <span className="block text-slate-400 font-semibold text-[9px] select-none">DEADLINE TARGET</span>
                                            <span className="text-slate-800 font-bold block">{mail.details.dueDate}</span>
                                          </div>
                                        )}
                                        {mail.details.spaceName && (
                                          <div>
                                            <span className="block text-slate-400 font-semibold text-[9px] select-none">HANDOVER ROTATION SPACE</span>
                                            <span className="text-slate-800 font-bold truncate block">{mail.details.spaceName}</span>
                                          </div>
                                        )}
                                        {mail.details.operatorName && (
                                          <div>
                                            <span className="block text-slate-400 font-semibold text-[9px] select-none">PERSONNEL KEY</span>
                                            <span className="text-slate-800 font-bold block">{mail.details.operatorName}</span>
                                          </div>
                                        )}
                                        {mail.details.signeeName && (
                                          <div>
                                            <span className="block text-slate-400 font-semibold text-[9px] select-none">AUTHORIZER</span>
                                            <span className="text-slate-800 font-bold block">{mail.details.signeeName}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Transactional Email footer */}
                                  <div className="text-[10px] text-slate-400 text-center pt-3 border-t select-none">
                                    You received this automated transmission because notifications rules are synced inside your browser's workspace settings.
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        // List Simulated Sent Emails
                        <div className="space-y-2 flex-1 flex flex-col justify-between">
                          <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {simulatedEmails.length === 0 ? (
                              <div className="py-12 text-center text-slate-400 text-xs">
                                <span className="text-2xl block mb-1">📬</span>
                                No outbound emails generated yet.<br />Assign tasks, add Roster personnel, or toggle sign-off.
                              </div>
                            ) : (
                              simulatedEmails.map(mail => (
                                <button
                                  type="button"
                                  key={mail.id}
                                  onClick={() => setExpandedEmailId(mail.id)}
                                  className="w-full text-left p-2.5 border border-slate-100 hover:border-slate-200 bg-[#FCFDFE] hover:bg-slate-50/50 rounded-lg transition-all shadow-4xs cursor-pointer block space-y-1 font-sans text-xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-800 truncate flex-1 block pr-2">
                                      {mail.subject}
                                    </span>
                                    <span className="text-[9px] text-slate-400 font-mono shrink-0 select-none">
                                      {mail.timestamp.split(", ")[1] || mail.timestamp}
                                    </span>
                                  </div>
                                  <p className="text-slate-500 truncate text-[10px] w-full text-left">{mail.body}</p>
                                  <div className="flex justify-between items-center pt-1 border-t border-slate-100/50 mt-1">
                                    <span className="text-[9px] font-mono font-medium text-slate-400 truncate block">TO: {mail.to}</span>
                                    <span className="text-[9px] font-mono font-bold text-indigo-500 uppercase tracking-wide bg-indigo-50 px-1 rounded shrink-0 select-none">
                                      {mail.type}
                                    </span>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                          
                          {simulatedEmails.length > 0 && (
                            <span className="block text-[10.5px] text-slate-450 text-center font-mono pt-2 border-t mt-auto select-none">
                              Click any email above to preview full rich HTML layout.
                            </span>
                          )}
                        </div>
                      )
                    ) : (
                      // Tab 2: Simulated Push Log payloads
                      <div className="space-y-2 text-left">
                        {simulatedPushes.length === 0 ? (
                          <div className="py-12 text-center text-slate-400 text-xs">
                            <span className="text-2xl block mb-1">📱</span>
                            No desktop/mobile push payloads recorded. Ensure that 'Push' is enabled for triggered events in the rules on the left.
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                            {simulatedPushes.map(push => (
                              <div 
                                key={push.id} 
                                className="p-3 border border-slate-800 rounded-lg bg-slate-950 text-slate-100 shadow-3xs font-mono text-[11px] space-y-1 relative"
                              >
                                <div className="flex items-center justify-between border-b border-slate-900 pb-1 text-[10px] text-slate-450">
                                  <span>PUSH_NOTIF_PAYLOAD // INTERCEPTED</span>
                                  <span>{push.timestamp}</span>
                                </div>
                                <p className="font-bold text-emerald-400 text-[11px] font-sans flex items-center gap-1">
                                  🔔 {push.title}
                                </p>
                                <p className="text-slate-300 font-sans text-[11px] leading-relaxed text-left">{push.body}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* 2. Header & Active Rotation Ribbon */}
        {activeTab === "tracker" ? (
          <section className={`${activeTheme.activeRibbonBg} border rounded-xl p-6 shadow-md transition-all`}>
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
              
              {/* Left Box: Active state description */}
              <div className="space-y-1">
                <span className={`text-[10px] uppercase tracking-wider font-bold ${activeTheme.activeRibbonSubText} font-mono`}>
                  ACTIVE ROTATION SHIFT INTERVAL
                </span>
                <h2 className={`text-lg font-bold font-display ${activeTheme.activeRibbonText}`}>
                  Rotational Handover Interval
                </h2>
                <div className={`text-xs ${activeTheme.activeRibbonMutedText} flex items-center gap-1`}>
                  <span>Active Cycle Boundary: </span>
                  <span className={`font-mono ${activeTheme.activeRibbonMiddle} px-1.5 py-0.5 rounded border font-medium text-xs`}>
                    {CURRENT_DATE_STR} 13:13:56 UTC
                  </span>
                </div>
              </div>

              {/* Middle: Active Shift Rotation flow */}
              <div className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-4 ${activeTheme.activeRibbonMiddle} border rounded-lg p-4 max-w-2xl`}>
                
                {/* Outgoing Outbox */}
                <div className="flex-1 w-full text-center space-y-1.5">
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-rose-300 font-mono bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/30">
                    Outgoing Shift Lead
                  </span>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center justify-center border border-rose-500/30 shrink-0">
                      {getInitials(dbState.outgoingLead)}
                    </div>
                    <select
                      value={dbState.outgoingLead}
                      onChange={(e) => updateWorkspaceState((prev) => ({ ...prev, outgoingLead: e.target.value }))}
                      className={`text-xs sm:text-sm font-semibold text-white bg-slate-900/40 hover:bg-slate-900/60 focus:bg-slate-900/80 border ${activeTheme.isDark ? 'border-slate-700' : 'border-white/20'} focus:border-white focus:outline-none rounded px-2.5 py-1.5 max-w-[210px] text-center font-display cursor-pointer`}
                    >
                      <option value="" className="text-slate-800 bg-white">Select Outgoing Lead</option>
                      {personnelList.map(p => (
                        <option key={p.id} value={`${p.name} (${p.title})`} className="text-slate-800 bg-white text-left">
                          {p.name} ({p.title})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Transit Arrow Icon */}
                <div className="shrink-0 flex flex-col items-center">
                  <ArrowRight className={`w-5 h-5 ${activeTheme.activeRibbonSubText} animate-bounce`} />
                  <span className={`text-[9px] ${activeTheme.activeRibbonMutedText} font-mono`}>Transfer</span>
                </div>

                {/* Incoming Counterpart */}
                <div className="flex-1 w-full text-center space-y-1.5">
                  <span className={`text-[9px] uppercase tracking-wider font-semibold ${activeTheme.activeRibbonSubText} font-mono bg-[#3b82f6]/10 px-2 py-0.5 rounded-full border border-[#3b82f6]/30`}>
                    Incoming Counterpart
                  </span>
                  <div className="flex items-center justify-center gap-2">
                    <div className={`w-8 h-8 rounded-full ${activeTheme.activeRibbonBubble} text-xs font-bold flex items-center justify-center border shrink-0`}>
                      {getInitials(dbState.incomingLead)}
                    </div>
                    <select
                      value={dbState.incomingLead}
                      onChange={(e) => updateWorkspaceState((prev) => ({ ...prev, incomingLead: e.target.value }))}
                      className={`text-xs sm:text-sm font-semibold text-white bg-slate-900/40 hover:bg-slate-900/60 focus:bg-slate-900/80 border ${activeTheme.isDark ? 'border-slate-700' : 'border-white/20'} focus:border-white focus:outline-none rounded px-2.5 py-1.5 max-w-[210px] text-center font-display cursor-pointer`}
                    >
                      <option value="" className="text-slate-800 bg-white">Select Incoming Lead</option>
                      {personnelList.map(p => (
                        <option key={p.id} value={`${p.name} (${p.title})`} className="text-slate-800 bg-white text-left">
                          {p.name} ({p.title})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

              </div>

              {/* Right: Dynamic high visibility status badge */}
              <div className="flex flex-col items-center justify-center min-w-36 text-center">
                <span className={`text-[10px] uppercase font-bold ${activeTheme.activeRibbonMutedText} font-mono mb-1`}>
                  TRANSITION STATUS
                </span>
                <div className={`px-4 py-2 rounded-full font-bold text-xs border shadow-xs tracking-tight uppercase ${currentStatus.badgeStyle}`}>
                  ● {currentStatus.label}
                </div>
              </div>

            </div>
          </section>
        ) : (
          <section className={`${activeTheme.activeRibbonBg} border rounded-xl p-6 shadow-md transition-all`}>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-1">
                <span className={`text-[10px] uppercase tracking-wider font-bold ${activeTheme.activeRibbonSubText} font-mono`}>
                  CONSOLIDATED OPERATIONS DASHBOARD
                </span>
                <h2 className={`text-lg font-bold font-display ${activeTheme.activeRibbonText}`}>
                  Federated Analytics & Outstanding Deliverables
                </h2>
                <p className={`text-xs ${activeTheme.activeRibbonMutedText}`}>
                  Aggregated metrics, bottlenecks, queues, and task structures compiled dynamically across all active shift repositories.
                </p>
              </div>
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-2.5 rounded-lg text-white font-sans">
                <div className="text-right">
                  <span className={`text-[9px] uppercase font-bold ${activeTheme.activeRibbonSubText} font-mono block leading-none mb-1`}>
                    Total Tracks
                  </span>
                  <span className="text-xl font-bold font-display leading-none">
                    {workspaces.length}
                  </span>
                </div>
                <div className="h-8 w-px bg-white/20" />
                <div className="text-right">
                  <span className={`text-[9px] uppercase font-bold ${activeTheme.activeRibbonSubText} font-mono block leading-none mb-1`}>
                    Consolidated Tasks
                  </span>
                  <span className="text-xl font-bold font-display leading-none">
                    {Object.values(allWorkspacesData).reduce<number>((sum, ws: HandoverState) => sum + (ws.tasks?.length || 0), 0) + 
                     Object.values(allWorkspacesData).reduce<number>((sum, ws: HandoverState) => sum + (ws.backlog?.length || 0), 0)}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Main Content Tab Navigation */}
        <div className={`flex items-center justify-start border-b ${activeTheme.cardBorder} pb-2 pt-1`}>
          <div className={`flex ${activeTheme.mutedBg} p-1 rounded-xl border ${activeTheme.cardBorder} shadow-3xs`}>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "analytics"
                  ? `${activeTheme.cardBg} ${activeTheme.cardTitleText} shadow-2xs border ${activeTheme.cardBorder}`
                  : `${activeTheme.cardSubText} hover:${activeTheme.cardTitleText}`
              }`}
            >
              <span>📊</span> Analytics Dashboard
            </button>
            <button
              onClick={() => setActiveTab("tracker")}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "tracker"
                  ? `${activeTheme.cardBg} ${activeTheme.cardTitleText} shadow-2xs border ${activeTheme.cardBorder}`
                  : `${activeTheme.cardSubText} hover:${activeTheme.cardTitleText}`
              }`}
            >
              <span>📋</span> Workspace Tracker
            </button>
          </div>
        </div>

        {/* Main Content Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Panel (Left and Middle - Width: 2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {activeTab === "tracker" ? (
              <>
                       <section className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl overflow-hidden shadow-xs ${activeTheme.isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              
              {/* Header Box styled with design theme */}
              <div className={`${activeTheme.cardBg} p-4 border-b ${activeTheme.cardBorder} flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-4 ${activeTheme.id === 'alpine-forest' ? 'bg-emerald-600' : 'bg-indigo-600'} rounded-full shrink-0 animate-pulse bg-indigo-505`}></span>
                  <div>
                    <h3 className={`text-sm font-bold font-display ${activeTheme.cardTitleText} flex flex-col sm:flex-row sm:items-center gap-2`}>
                      <span>Active Handover Cycle Tasks</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCarryOverTaskIds([]);
                          setShowCarryOverModal(true);
                        }}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 hover:scale-[1.02] active:scale-[0.98] text-white rounded text-[10px] font-bold font-mono inline-flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                        title="Import and carry over tasks from any historical registered handover"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        Carry Over Past Tasks
                      </button>
                    </h3>
                    <p className={`text-[11px] ${activeTheme.cardSubText} leading-none mt-1.5 sm:mt-1`}>
                      Critical tasks verified and actioned during the active transition window.
                    </p>
                  </div>
                </div>
                {/* Micro Progress Tracker Bar */}
                <div className="text-right space-y-1 min-w-40">
                  <div className="flex justify-between text-[11px] font-medium">
                    <span className={`${activeTheme.cardSubText}`}>Cycle Completeness</span>
                    <span className="text-emerald-500 font-bold">{percentComplete}%</span>
                  </div>
                  <div className={`w-full h-2 ${activeTheme.mutedBg} border ${activeTheme.cardBorder} rounded-full overflow-hidden`}>
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-550"
                      style={{ width: `${percentComplete}%` }}
                    />
                  </div>
                  <p className={`text-[10px] ${activeTheme.cardSubText} font-mono leading-none`}>
                    {completedCount} of {totalTasksCount} signed off
                  </p>
                </div>
              </div>

              {/* Task table / Card layout */}
              <div className={`p-4 ${activeTheme.mutedBg}`}>
                <div className={`overflow-x-auto border ${activeTheme.cardBorder} rounded-lg`}>
                  <table className={`w-full text-left text-xs ${activeTheme.cardBg} border-collapse`}>
                    <thead>
                      <tr className={`${activeTheme.mutedBg} ${activeTheme.cardSubText} border-b ${activeTheme.cardBorder} font-mono text-[10px] uppercase font-bold select-none`}>
                        <th className={`p-3 w-16 text-center cursor-pointer hover:opacity-85 transition-opacity ${activeTheme.cardBorder}`} onClick={() => handleTasksSort("completed")}>
                          <div className="flex items-center justify-center gap-0.5">
                            Done {renderSortIcon("completed", tasksSortField, tasksSortDirection)}
                          </div>
                        </th>
                        <th className="p-3 cursor-pointer hover:opacity-85 transition-opacity text-left" onClick={() => handleTasksSort("description")}>
                          <div className="flex items-center gap-0.5 justify-start">
                            Task Description {renderSortIcon("description", tasksSortField, tasksSortDirection)}
                          </div>
                        </th>
                        <th className="p-3 w-28 text-center cursor-pointer hover:opacity-85 transition-opacity" onClick={() => handleTasksSort("ownerName")}>
                          <div className="flex items-center justify-center gap-0.5">
                            Owner {renderSortIcon("ownerName", tasksSortField, tasksSortDirection)}
                          </div>
                        </th>
                        <th className="p-3 w-24 text-center cursor-pointer hover:opacity-85 transition-opacity" onClick={() => handleTasksSort("priority")}>
                          <div className="flex items-center justify-center gap-0.5">
                            Priority {renderSortIcon("priority", tasksSortField, tasksSortDirection)}
                          </div>
                        </th>
                        <th className="p-3 w-32 text-center cursor-pointer hover:opacity-85 transition-opacity" onClick={() => handleTasksSort("dueDate")}>
                          <div className="flex items-center justify-center gap-0.5">
                            Countdown {renderSortIcon("dueDate", tasksSortField, tasksSortDirection)}
                          </div>
                        </th>
                        <th className="p-3 w-12 text-center text-slate-400">Trash</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${activeTheme.cardBorder}`}>
                      {getSortedTasks().length === 0 ? (
                        <tr>
                          <td colSpan={6} className={`p-8 text-center ${activeTheme.cardSubText} ${activeTheme.mutedBg}`}>
                            <CheckCircle2 className="w-8 h-8 mx-auto text-slate-350 mb-2 opacity-60" />
                            <p className="font-semibold text-xs">No active tasks in current rotation.</p>
                            <p className="text-[10px] opacity-75 mt-0.5">Use the prompt box beneath to queue transition tasks.</p>
                          </td>
                        </tr>
                      ) : (
                        getSortedTasks().map((task) => {
                          const countdown = calculateDaysRemaining(task.dueDate);
                          
                          return (
                            <tr 
                              key={task.id} 
                              className={`hover:opacity-95 transition-opacity ${
                                task.completed ? "bg-emerald-500/5 text-slate-400 opacity-80" : ""
                              } ${activeTheme.mutedBg}/10 border-b ${activeTheme.cardBorder}`}
                            >
                              <td className="p-3 text-center">
                                <motion.button
                                  whileTap={{ scale: 0.9 }}
                                  whileHover={{ scale: 1.1 }}
                                  onClick={() => handleToggleTask(task.id)}
                                  className={`focus:outline-none inline-block align-middle cursor-pointer ${activeTheme.cardSubText} hover:${activeTheme.accentText}`}
                                >
                                  <motion.div
                                    key={task.completed ? "completed" : "pending"}
                                    initial={{ scale: 0.82, rotate: task.completed ? -15 : 15 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    transition={{ type: "spring", stiffness: 450, damping: 15 }}
                                  >
                                    {task.completed ? (
                                      <CheckSquare className="w-5 h-5 text-emerald-600 fill-emerald-500/10" />
                                    ) : (
                                      <Square className="w-5 h-5 text-slate-305" />
                                    )}
                                  </motion.div>
                                </motion.button>
                              </td>

                              <td className="p-3 font-medium leading-relaxed">
                                <span className={task.completed ? "line-through text-slate-400" : activeTheme.cardTitleText}>
                                  {task.description}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 ${activeTheme.mutedBg} border ${activeTheme.cardBorder} ${activeTheme.cardSubText} font-semibold rounded-full text-[10px]`}>
                                  {task.ownerName}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
                                  task.priority === "High" 
                                    ? "bg-rose-500/10 text-rose-500 border-rose-500/20" 
                                    : task.priority === "Medium"
                                    ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                    : `${activeTheme.accentBg} ${activeTheme.accentText} ${activeTheme.accentBorder}`
                                }`}>
                                  {task.priority}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  {task.completed ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase font-mono">
                                      Signed Off
                                    </span>
                                  ) : (
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                      countdown.isOverdue 
                                        ? "bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse" 
                                        : countdown.isToday
                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                        : `${activeTheme.mutedBg} ${activeTheme.cardTitleText} ${activeTheme.cardBorder}`
                                    }`}>
                                      <Clock className="w-3 h-3 text-slate-400" />
                                      {countdown.text}
                                    </span>
                                  )}
                                  <span className={`text-[9px] font-mono ${activeTheme.cardSubText} block`}>
                                    Due: {task.dueDate}
                                  </span>
                                </div>
                              </td>

                              <td className="p-3 text-center">
                                <button
                                  onClick={() => setDeleteConfirmation({
                                    isOpen: true,
                                    type: "task",
                                    id: task.id,
                                    name: task.description
                                  })}
                                  className="text-slate-350 hover:text-rose-550 rounded transition-colors"
                                  title="Remove Task"
                                >
                                  <Trash2 className="w-3.5 h-3.5 hover:text-rose-500" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Active Task Form */}
              <div className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl p-4 m-4 space-y-3`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                  <h4 className={`text-xs font-bold uppercase tracking-wider ${activeTheme.accentText} font-mono flex items-center gap-1.5`}>
                    <Plus className="w-3.5 h-3.5" />
                    Add Shift Task to Current Cycle
                  </h4>
                </div>

                <form onSubmit={handleAddTask} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5 space-y-1">
                    <label className={`text-[10px] font-bold ${activeTheme.cardSubText} uppercase tracking-wide block`}>Task Description</label>
                    <input
                      type="text"
                      placeholder='e.g., Verify 9-5/8" intermediate casing tally and check cement slurry weight'
                      value={newTask.description}
                      onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                      className={`${activeTheme.inputBg} border rounded px-3 py-1.5 text-xs outline-none w-full shadow-xs`}
                      required
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className={`text-[10px] font-bold ${activeTheme.cardSubText} uppercase tracking-wide block`}>Owner Name</label>
                    <select
                      value={newTask.ownerName}
                      onChange={(e) => setNewTask({ ...newTask, ownerName: e.target.value })}
                      className={`${activeTheme.inputBg} border rounded px-3 py-1.5 text-xs outline-none w-full shadow-xs cursor-pointer`}
                      required
                    >
                      <option value="">Select Owner</option>
                      {personnelList.map(p => (
                        <option key={p.id} value={`${p.name} (${p.title})`}>{p.name} ({p.title})</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className={`text-[10px] font-bold ${activeTheme.cardSubText} uppercase tracking-wide block`}>Priority</label>
                    <select
                      value={newTask.priority}
                      onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}
                      className={`${activeTheme.inputBg} border rounded px-3 py-1.5 text-xs outline-none w-full shadow-xs cursor-pointer`}
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className={`text-[10px] font-bold ${activeTheme.cardSubText} uppercase tracking-wide block`}>Due Date</label>
                    <input
                      type="date"
                      value={newTask.dueDate}
                      onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                      className={`${activeTheme.inputBg} border rounded px-2 py-1.5 text-xs outline-none w-full font-mono shadow-xs`}
                      required
                    />
                  </div>

                  <div className="md:col-span-1">
                    <button
                      type="submit"
                      className={`w-full h-[32px] ${activeTheme.primaryBtn} rounded text-xs font-bold flex items-center justify-center transition-colors cursor-pointer`}
                      title="Add to table"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </div>

            </section>

            {/* 4. Persistent Task Backlog Section */}
            <section className={`${activeTheme.isDark ? 'bg-red-950/5' : 'bg-rose-50/15'} border ${activeTheme.cardBorder} rounded-xl overflow-hidden shadow-xs relative`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
              
              {/* Header block with red-accent banner styling */}
              <div className={`${activeTheme.cardBg} p-4 border-b ${activeTheme.cardBorder} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-rose-500 rounded-full shrink-0"></span>
                  <div>
                    <h3 className={`text-sm font-bold font-display ${activeTheme.cardTitleText} inline-flex items-center gap-1.5`}>
                      Persistent Backlog Block
                    </h3>
                    <p className={`text-[11px] ${activeTheme.cardSubText}`}>
                      Unresolved tasks carried over across cycles. Keeps long-term issues visible until closure.
                    </p>
                  </div>
                </div>
                {/* Visual badge highlight */}
                <div className="px-2.5 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded font-mono text-[9px] font-bold leading-none shrink-0 uppercase tracking-wide">
                  ACTIVE AGING TICKER
                </div>
              </div>

              {/* Backlog table container */}
              <div className={`p-4 ${activeTheme.mutedBg}`}>
                <div className={`overflow-x-auto border ${activeTheme.cardBorder} rounded-lg ${activeTheme.cardBg}`}>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className={`${activeTheme.mutedBg} ${activeTheme.cardSubText} border-b ${activeTheme.cardBorder} font-mono text-[10px] uppercase font-bold select-none`}>
                        <th className="p-3 w-16 text-center cursor-pointer hover:opacity-85 transition-opacity" onClick={() => handleBacklogSort("completed")}>
                          <div className="flex items-center justify-center gap-0.5">
                            Done {renderSortIcon("completed", backlogSortField, backlogSortDirection)}
                          </div>
                        </th>
                        <th className="p-3 cursor-pointer hover:opacity-85 transition-opacity text-left" onClick={() => handleBacklogSort("description")}>
                          <div className="flex items-center gap-0.5 justify-start">
                            Backlog Task Description {renderSortIcon("description", backlogSortField, backlogSortDirection)}
                          </div>
                        </th>
                        <th className="p-3 w-28 text-center cursor-pointer hover:opacity-85 transition-opacity" onClick={() => handleBacklogSort("ownerName")}>
                          <div className="flex items-center justify-center gap-0.5">
                            Owner {renderSortIcon("ownerName", backlogSortField, backlogSortDirection)}
                          </div>
                        </th>
                        <th className="p-3 w-24 text-center cursor-pointer hover:opacity-85 transition-opacity" onClick={() => handleBacklogSort("priority")}>
                          <div className="flex items-center justify-center gap-0.5">
                            Priority {renderSortIcon("priority", backlogSortField, backlogSortDirection)}
                          </div>
                        </th>
                        <th className="p-3 w-36 text-center cursor-pointer hover:opacity-85 transition-opacity" onClick={() => handleBacklogSort("backlogDate")}>
                          <div className="flex items-center justify-center gap-0.5">
                            Aging Days {renderSortIcon("backlogDate", backlogSortField, backlogSortDirection)}
                          </div>
                        </th>
                        <th className="p-3 w-32 text-center text-slate-400 font-bold">Interaction</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${activeTheme.cardBorder}`}>
                      {getSortedBacklog().length === 0 ? (
                        <tr>
                          <td colSpan={6} className={`p-8 text-center ${activeTheme.cardSubText} ${activeTheme.mutedBg}`}>
                            <CheckCircle2 className="w-8 h-8 mx-auto text-slate-355 mb-2 opacity-60" />
                            <p className="font-semibold text-xs">The Backlog is clean!</p>
                            <p className="text-[10px] opacity-75 mt-0.5">All persistent items checked off or closed.</p>
                          </td>
                        </tr>
                      ) : (
                        getSortedBacklog().map((item) => {
                          const agingDays = calculateAgingDays(item.backlogDate);
                          
                          return (
                            <tr 
                              key={item.id} 
                              className={`hover:opacity-95 transition-opacity ${
                                item.completed ? "bg-emerald-500/5 text-slate-400 opacity-80" : ""
                              } border-b ${activeTheme.cardBorder}`}
                            >
                              <td className="p-3 text-center">
                                <motion.button
                                  whileTap={{ scale: 0.9 }}
                                  whileHover={{ scale: 1.1 }}
                                  onClick={() => handleToggleBacklog(item.id)}
                                  className={`focus:outline-none inline-block align-middle cursor-pointer ${activeTheme.cardSubText} hover:${activeTheme.accentText}`}
                                >
                                  <motion.div
                                    key={item.completed ? "completed" : "pending"}
                                    initial={{ scale: 0.82, rotate: item.completed ? -15 : 15 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    transition={{ type: "spring", stiffness: 450, damping: 15 }}
                                  >
                                    {item.completed ? (
                                      <CheckSquare className="w-5 h-5 text-emerald-600 fill-emerald-500/10" />
                                    ) : (
                                      <Square className="w-5 h-5 text-slate-305" />
                                    )}
                                  </motion.div>
                                </motion.button>
                              </td>

                              <td className="p-3 font-medium leading-relaxed">
                                <span className={item.completed ? "line-through text-slate-400" : activeTheme.cardTitleText}>
                                  {item.description}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 ${activeTheme.mutedBg} border ${activeTheme.cardBorder} ${activeTheme.cardSubText} font-semibold rounded-full text-[10px]`}>
                                  {item.ownerName}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
                                  item.priority === "High" 
                                    ? "bg-rose-500/10 text-rose-500 border-rose-500/20" 
                                    : item.priority === "Medium"
                                    ? "bg-amber-500/10 text-amber-550 border-amber-500/20"
                                    : `${activeTheme.accentBg} ${activeTheme.accentText} ${activeTheme.accentBorder}`
                                }`}>
                                  {item.priority}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                {item.completed ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 font-bold bg-emerald-500/10 text-emerald-550 text-emerald-600 border border-emerald-500/20 rounded text-[10px] uppercase font-mono">
                                    Signed Off
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                    agingDays >= 20 
                                      ? "bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse" 
                                      : agingDays >= 10
                                      ? "bg-amber-500/10 text-amber-550 border-amber-500/20"
                                      : `${activeTheme.mutedBg} ${activeTheme.cardSubText} ${activeTheme.cardBorder}`
                                  }`}>
                                    In Backlog: {agingDays} Days
                                  </span>
                                )}
                              </td>

                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {!item.completed && (
                                    <button
                                      onClick={() => handlePromoteBacklog(item.id)}
                                      className="px-2 py-1 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 text-[10px] rounded font-semibold inline-flex items-center gap-0.5 transition-colors cursor-pointer"
                                      title="Move this task to active rotation due today."
                                    >
                                      Promote
                                      <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setDeleteConfirmation({
                                      isOpen: true,
                                      type: "backlog",
                                      id: item.id,
                                      name: item.description
                                    })}
                                    className="text-slate-350 hover:text-rose-550 rounded transition-colors"
                                    title="Remove Backlog Item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 hover:text-rose-500" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Backlog item Form */}
              <div className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl p-4 m-4 space-y-3 shadow-xs`}>
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-500 font-mono flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  File New Backlog Item
                </h4>
                <form onSubmit={handleAddBacklog} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-12 lg:col-span-5 space-y-1">
                    <label className={`text-[10px] font-bold ${activeTheme.cardSubText} uppercase tracking-wide block`}>Task Description</label>
                    <input
                      type="text"
                      placeholder="e.g., Design offset structural template and finalize pore pressure logs"
                      value={newBacklog.description}
                      onChange={(e) => setNewBacklog({ ...newBacklog, description: e.target.value })}
                      className={`${activeTheme.inputBg} border rounded px-3 py-1.5 text-xs outline-none w-full shadow-xs`}
                      required
                    />
                  </div>

                  <div className="md:col-span-4 lg:col-span-2 space-y-1">
                    <label className={`text-[10px] font-bold ${activeTheme.cardSubText} uppercase tracking-wide block`}>Owner Name</label>
                    <select
                      value={newBacklog.ownerName}
                      onChange={(e) => setNewBacklog({ ...newBacklog, ownerName: e.target.value })}
                      className={`${activeTheme.inputBg} border rounded px-3 py-1.5 text-xs outline-none w-full shadow-xs cursor-pointer`}
                      required
                    >
                      <option value="">Select Owner</option>
                      {personnelList.map(p => (
                        <option key={p.id} value={`${p.name} (${p.title})`}>{p.name} ({p.title})</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3 lg:col-span-2 space-y-1">
                    <label className={`text-[10px] font-bold ${activeTheme.cardSubText} uppercase tracking-wide block`}>Priority</label>
                    <select
                      value={newBacklog.priority}
                      onChange={(e) => setNewBacklog({ ...newBacklog, priority: e.target.value as any })}
                      className={`${activeTheme.inputBg} border rounded px-3 py-1.5 text-xs outline-none w-full shadow-xs cursor-pointer`}
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>

                  <div className="md:col-span-3 lg:col-span-2 space-y-1">
                    <label className={`text-[10px] font-bold ${activeTheme.cardSubText} uppercase tracking-wide block`}>Created Date</label>
                    <input
                      type="date"
                      value={newBacklog.backlogDate}
                      onChange={(e) => setNewBacklog({ ...newBacklog, backlogDate: e.target.value })}
                      className={`${activeTheme.inputBg} border rounded px-2 py-1.5 text-xs outline-none w-full font-mono shadow-xs`}
                      required
                    />
                  </div>

                  <div className="md:col-span-2 lg:col-span-1">
                    <button
                      type="submit"
                      className={`w-full h-[32px] ${activeTheme.primaryBtn} rounded text-xs font-bold flex items-center justify-center transition-colors cursor-pointer`}
                    >
                      File
                    </button>
                  </div>
                </form>
              </div>

            </section>
              </>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const allTasks = Object.values(allWorkspacesData).flatMap((ws: HandoverState) => ws.tasks || []);
                  const allBacklog = Object.values(allWorkspacesData).flatMap((ws: HandoverState) => ws.backlog || []);

                  return (
                    <>
                      {/* 1. Global KPI Cards Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        
                        {/* Card 1: Open Shift Tasks */}
                        <div className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl p-4 shadow-3xs flex flex-col justify-between relative overflow-hidden h-28 hover:shadow-2xs transition-shadow`}>
                          <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 font-mono">
                            Open Shift Tasks
                          </span>
                          <div className="flex items-baseline justify-between mt-2">
                            <span className={`text-3xl font-black font-display leading-none ${activeTheme.cardTitleText}`}>
                              {allTasks.filter((t) => !t.completed).length}
                            </span>
                            <span className={`text-xs ${activeTheme.cardSubText} font-mono font-medium`}>
                              active cycle
                            </span>
                          </div>
                        </div>

                        {/* Card 2: Critical Bottlenecks */}
                        <div className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl p-4 shadow-3xs flex flex-col justify-between relative overflow-hidden h-28 hover:shadow-2xs transition-shadow`}>
                          <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 font-mono">
                            Critical Bottlenecks
                          </span>
                          <div className="flex items-baseline justify-between mt-2">
                            <span className="text-3xl font-black font-display text-rose-500 leading-none">
                              {allTasks.filter((t) => !t.completed && (t.priority === "High" || calculateDaysRemaining(t.dueDate).isOverdue)).length}
                            </span>
                            <span className="text-xs text-rose-400 font-mono font-medium">
                              high & overdue
                            </span>
                          </div>
                        </div>

                        {/* Card 3: Total Persistent Backlog */}
                        <div className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl p-4 shadow-3xs flex flex-col justify-between relative overflow-hidden h-28 hover:shadow-2xs transition-shadow`}>
                          <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 font-mono">
                            Total Persistent Backlog
                          </span>
                          <div className="flex items-baseline justify-between mt-2">
                            <span className={`text-3xl font-black font-display leading-none ${activeTheme.cardTitleText}`}>
                              {allBacklog.filter((b) => !b.completed).length}
                            </span>
                            <span className={`text-xs ${activeTheme.cardSubText} font-mono font-medium`}>
                              pending log
                            </span>
                          </div>
                        </div>

                        {/* Card 4: Rotation Sign-Off Rate */}
                        <div className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl p-4 shadow-3xs flex flex-col justify-between relative overflow-hidden h-28 hover:shadow-2xs transition-shadow`}>
                          <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 font-mono">
                            Rotation Sign-Off Rate
                          </span>
                          <div className="flex items-baseline justify-between mt-2">
                            <span className="text-3xl font-black font-display text-emerald-500 leading-none">
                              {(() => {
                                const total = allTasks.length + allBacklog.length;
                                const completed = allTasks.filter((t) => t.completed).length + allBacklog.filter((b) => b.completed).length;
                                return total > 0 ? Math.round((completed / total) * 100) : 100;
                              })()}%
                            </span>
                            <span className={`text-xs ${activeTheme.cardSubText} font-mono font-medium`}>
                              overall completed
                            </span>
                          </div>
                        </div>

                      </div>

                      {/* 1.5. Dynamic Upcoming Tasks D3.js Chart */}
                      <UpcomingTasksChart
                        tasks={allTasks}
                        activeTheme={activeTheme}
                        referenceDateStr={CURRENT_DATE_STR}
                      />

                      {/* 2. Secondary Panel Grid: Aging and Resource Matrix side-by-side on lg */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Task Aging & Distribution Panel */}
                        <div className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl overflow-hidden shadow-xs p-5 space-y-4`}>
                          <div className={`border-b ${activeTheme.cardBorder} pb-2.5`}>
                            <h4 className={`text-xs font-bold font-display uppercase tracking-wider ${activeTheme.cardTitleText} flex items-center gap-1.5`}>
                              ⏳ Backlog Aging and Distribution Timeline
                            </h4>
                            <p className={`text-[10px] ${activeTheme.cardSubText} mt-0.5 leading-relaxed font-sans`}>
                              Evaluates outstanding backlogs grouped by duration since record creation (relative to current date).
                            </p>
                          </div>

                          <div className="space-y-4 pt-1">
                            {(() => {
                              const openBacklogs = allBacklog.filter(b => !b.completed);
                              const totalCount = openBacklogs.length;
                              
                              const groups = [
                                { label: "Critical Age (> 30 Days)", count: openBacklogs.filter(b => calculateAgingDays(b.backlogDate) > 30).length, color: "bg-rose-500" },
                                { label: "Warning Age (15 - 30 Days)", count: openBacklogs.filter(b => { const d = calculateAgingDays(b.backlogDate); return d > 14 && d <= 30; }).length, color: "bg-amber-500" },
                                { label: "Moderate Age (8 - 14 Days)", count: openBacklogs.filter(b => { const d = calculateAgingDays(b.backlogDate); return d > 7 && d <= 14; }).length, color: "bg-indigo-500" },
                                { label: "Recent Queue (≤ 7 Days)", count: openBacklogs.filter(b => calculateAgingDays(b.backlogDate) <= 7).length, color: "bg-emerald-500" },
                              ];

                              return (
                                <>
                                  {totalCount === 0 ? (
                                    <div className={`py-12 text-center text-slate-400 ${activeTheme.mutedBg} border ${activeTheme.cardBorder} rounded-lg p-4`}>
                                      <span className="text-xl">✨</span>
                                      <p className={`font-semibold text-xs mt-1 ${activeTheme.cardTitleText}`}>All Backlog Items Cleared!</p>
                                      <p className={`text-[10px] ${activeTheme.cardSubText} mt-0.5`}>There are zero open persistent items aging in storage.</p>
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      {groups.map((g) => {
                                        const pct = totalCount > 0 ? Math.round((g.count / totalCount) * 100) : 0;
                                        return (
                                          <div key={g.label} className="space-y-1">
                                            <div className="flex justify-between items-center text-xs">
                                              <span className={`font-semibold ${activeTheme.cardTitleText}`}>{g.label}</span>
                                              <span className={`font-mono ${activeTheme.cardTitleText} font-bold`}>{g.count} <span className={`text-[10px] ${activeTheme.cardSubText}`}>({pct}%)</span></span>
                                            </div>
                                            <div className={`w-full h-2.5 ${activeTheme.mutedBg} rounded-full border ${activeTheme.cardBorder} overflow-hidden`}>
                                              <div 
                                                className={`h-full ${g.color} rounded-full transition-all duration-500`} 
                                                style={{ width: `${pct}%` }} 
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                      <p className={`text-[10px] ${activeTheme.cardSubText} text-center font-mono pt-1`}>
                                        Evaluated against reference date {CURRENT_DATE_STR} across {totalCount} open backlogs.
                                      </p>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Resource Workload Matrix Panel */}
                        <div className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl overflow-hidden shadow-xs p-5 space-y-4`}>
                          <div className={`border-b ${activeTheme.cardBorder} pb-2.5`}>
                            <h4 className={`text-xs font-bold font-display uppercase tracking-wider ${activeTheme.cardTitleText} flex items-center gap-1.5`}>
                              👥 Resource Workload & Priority Matrix
                            </h4>
                            <p className={`text-[10px] ${activeTheme.cardSubText} mt-0.5 leading-relaxed font-sans`}>
                              Tracks open task counts assigned across active on-shift operators and backlog queues.
                            </p>
                          </div>

                          <div className={`overflow-x-auto border ${activeTheme.cardBorder} rounded-lg`}>
                            {(() => {
                              const activeOpenTasks = allTasks.filter(t => !t.completed);
                              const activeOpenBacklog = allBacklog.filter(b => !b.completed);
                              
                              const uniqOwners = Array.from(new Set([
                                ...activeOpenTasks.map(t => t.ownerName),
                                ...activeOpenBacklog.map(b => b.ownerName)
                              ])).filter(Boolean);

                              const matrixRows = uniqOwners.map(owner => {
                                const high = activeOpenTasks.filter(t => t.ownerName === owner && t.priority === "High").length +
                                             activeOpenBacklog.filter(b => b.ownerName === owner && b.priority === "High").length;
                                const med = activeOpenTasks.filter(t => t.ownerName === owner && t.priority === "Medium").length +
                                            activeOpenBacklog.filter(b => b.ownerName === owner && b.priority === "Medium").length;
                                const low = activeOpenTasks.filter(t => t.ownerName === owner && t.priority === "Low").length +
                                            activeOpenBacklog.filter(b => b.ownerName === owner && b.priority === "Low").length;
                                return { owner, high, med, low, total: high + med + low };
                              }).sort((a, b) => b.total - a.total);

                              if (matrixRows.length === 0) {
                                return (
                                  <div className={`py-12 text-center text-slate-400 ${activeTheme.mutedBg} p-4`}>
                                    <span className="text-xl">✅</span>
                                    <p className={`font-semibold text-xs mt-1 ${activeTheme.cardTitleText}`}>Perfect Workload Balance</p>
                                    <p className={`text-[10px] ${activeTheme.cardSubText} mt-0.5`}>All engineers currently have zero pending open actions.</p>
                                  </div>
                                );
                              }

                              return (
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className={`${activeTheme.mutedBg} ${activeTheme.cardSubText} border-b ${activeTheme.cardBorder} font-mono text-[10px] uppercase font-bold`}>
                                      <th className="p-2.5">Resource Name</th>
                                      <th className="p-2.5 text-center text-rose-500">High</th>
                                      <th className="p-2.5 text-center text-amber-500">Med</th>
                                      <th className="p-2.5 text-center text-indigo-500 font-bold">Low</th>
                                      <th className="p-2.5 text-center font-bold">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className={`divide-y ${activeTheme.cardBorder}`}>
                                    {matrixRows.map(row => (
                                      <tr key={row.owner} className="hover:opacity-90 transition-opacity">
                                        <td className={`p-2.5 font-semibold ${activeTheme.cardTitleText}`}>{row.owner}</td>
                                        <td className={`p-2.5 text-center font-mono font-bold ${row.high ? "text-rose-500 bg-rose-500/10" : "text-slate-350"}`}>
                                          {row.high || "-"}
                                        </td>
                                        <td className={`p-2.5 text-center font-mono font-bold ${row.med ? "text-amber-500 bg-amber-500/10" : "text-slate-355"}`}>
                                          {row.med || "-"}
                                        </td>
                                        <td className={`p-2.5 text-center font-mono font-bold ${row.low ? "text-indigo-500 bg-indigo-500/10" : "text-slate-355"}`}>
                                          {row.low || "-"}
                                        </td>
                                        <td className={`p-2.5 text-center font-mono font-bold ${activeTheme.mutedBg} ${activeTheme.cardTitleText} border-l ${activeTheme.cardBorder}`}>
                                          {row.total}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              );
                            })()}
                          </div>
                        </div>

                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Sidebar Area (Right - Width: 1 col) */}
          <div className="space-y-6">
            
            {/* 6. Digital Sign-Off Panel */}
            {activeTab === "tracker" && (
              <section className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl overflow-hidden shadow-xs`}>
                
                <div className={`p-4 border-b ${activeTheme.cardBorder}`}>
                  <h3 className={`text-sm font-bold font-display ${activeTheme.cardTitleText} flex items-center gap-1.5`}>
                    🛡️ Digital Sign-off Panel
                  </h3>
                  <p className={`text-[11px] ${activeTheme.cardSubText}`}>
                    Confirm rotational procedures prior to finalizing operational handover.
                  </p>
                </div>

                {/* Checklist */}
                <div className="p-4 space-y-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className={`text-[10px] uppercase font-bold tracking-wider ${activeTheme.cardSubText} font-mono block`}>
                        Mandatory Operating Verifications
                      </label>
                      {!areLeadsSet && (
                        <span className="text-[9px] font-semibold text-rose-600 bg-rose-500/10 border border-rose-200/50 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono uppercase animate-pulse">
                          🔒 Selection Required
                        </span>
                      )}
                    </div>

                    {/* Checkbox item 1 */}
                    <button
                      type="button"
                      onClick={() => handleToggleChecklist("blockersReviewed")}
                      className={`w-full flex items-start gap-2.5 text-left p-2.5 ${activeTheme.mutedBg} border ${activeTheme.cardBorder} rounded-lg transition-all text-xs cursor-pointer group ${
                        !areLeadsSet ? "opacity-55 cursor-not-allowed hover:border-slate-200" : "hover:border-emerald-500"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {dbState.signoffChecklist.blockersReviewed ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className={`w-4 h-4 ${activeTheme.cardSubText} group-hover:opacity-85`} />
                        )}
                      </span>
                      <div>
                        <span className={`font-semibold ${activeTheme.cardTitleText} block leading-tight`}>Direct Counterpart Briefing Completed</span>
                        <span className={`text-[10px] ${activeTheme.cardSubText} leading-normal block mt-0.5`}>Conducted a direct, line-by-line sync on all critical ongoing files, look-ahead plans, and active team challenges.</span>
                      </div>
                    </button>

                    {/* Checkbox item 2 */}
                    <button
                      type="button"
                      onClick={() => handleToggleChecklist("systemsNormal")}
                      className={`w-full flex items-start gap-2.5 text-left p-2.5 ${activeTheme.mutedBg} border ${activeTheme.cardBorder} rounded-lg transition-all text-xs cursor-pointer group ${
                        !areLeadsSet ? "opacity-55 cursor-not-allowed hover:border-slate-200" : "hover:border-emerald-500"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {dbState.signoffChecklist.systemsNormal ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className={`w-4 h-4 ${activeTheme.cardSubText} group-hover:opacity-85`} />
                        )}
                      </span>
                      <div>
                        <span className={`font-semibold ${activeTheme.cardTitleText} block leading-tight`}>Outstanding Tasks & High-Priority Backlog Noticed</span>
                        <span className={`text-[10px] ${activeTheme.cardSubText} leading-normal block mt-0.5`}>Incoming engineer has explicitly reviewed the active deadlines list and verified assigned ownership for pending items.</span>
                      </div>
                    </button>

                    {/* Checkbox item 3 */}
                    <button
                      type="button"
                      onClick={() => handleToggleChecklist("credsTransferred")}
                      className={`w-full flex items-start gap-2.5 text-left p-2.5 ${activeTheme.mutedBg} border ${activeTheme.cardBorder} rounded-lg transition-all text-xs cursor-pointer group ${
                        !areLeadsSet ? "opacity-55 cursor-not-allowed hover:border-slate-200" : "hover:border-emerald-500"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {dbState.signoffChecklist.credsTransferred ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className={`w-4 h-4 ${activeTheme.cardSubText} group-hover:opacity-85`} />
                        )}
                      </span>
                      <div>
                        <span className={`font-semibold ${activeTheme.cardTitleText} block leading-tight`}>Master & Important Documents Handovered</span>
                        <span className={`text-[10px] ${activeTheme.cardSubText} leading-normal block mt-0.5`}>Saved all the latest versions of documents.</span>
                      </div>
                    </button>
                  </div>

                  {/* Handover Logs Note Area */}
                  <div className="space-y-1">
                    <label className={`text-[10px] uppercase font-bold tracking-wider ${activeTheme.cardSubText} font-mono block`}>
                      Handover Summary Notes <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <textarea
                      placeholder="e.g., Aligned casing designs, reviewed Phase-2 tender status for Rig-42. Confirmed long-lead casing AFE approvals are in progress, dispatched material procurement sheets."
                      rows={4}
                      value={logText}
                      onChange={(e) => setLogText(e.target.value)}
                      className={`w-full text-xs p-2.5 ${activeTheme.inputBg} border ${activeTheme.cardBorder} rounded-lg focus:outline-none placeholder:text-slate-450 font-sans resize-y shadow-xs`}
                      required
                    />
                  </div>

                  {!isSignOffCompleteReady && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs space-y-1.5 text-left animate-in fade-in duration-200">
                      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Sign-off Warning Checklist</span>
                      </div>
                      <p className={`text-[10px] ${activeTheme.cardSubText} leading-relaxed`}>
                        Please satisfy the following pending requirements to authorize the handover:
                      </p>
                      <ul className="text-[10px] list-disc list-inside space-y-0.5 text-amber-700 dark:text-amber-400 font-mono">
                        {!dbState?.outgoingLead?.trim() && <li>Select Outgoing Shift Lead</li>}
                        {!dbState?.incomingLead?.trim() && <li>Select Incoming Counterpart</li>}
                        {!dbState?.signoffChecklist?.blockersReviewed && <li>Check "Direct Counterpart Briefing Completed"</li>}
                        {!dbState?.signoffChecklist?.systemsNormal && <li>Check "Outstanding Tasks & High-Priority Backlog Noticed"</li>}
                        {!dbState?.signoffChecklist?.credsTransferred && <li>Check "Master & Important Documents Handovered"</li>}
                        {!logText.trim() && <li>Write Handover Summary Notes</li>}
                      </ul>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleCompleteSignOff}
                      className={`w-full py-2.5 font-bold rounded text-xs leading-none transition-colors shadow-xs inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                        isSignOffCompleteReady
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-amber-600/20 hover:bg-amber-600/30 text-amber-700 dark:text-amber-400 border border-dashed border-amber-500/30"
                      }`}
                    >
                      <FileCheck className="w-4 h-4" />
                      Acknowledge & Save Handover
                    </button>
                    <p className={`text-[9px] ${activeTheme.cardSubText} text-center mt-2 font-mono leading-none`}>
                      Triggering commits rotation & logs write action dynamically.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* 5. Handover History Archive */}
            <section className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl overflow-hidden shadow-xs`}>
              
              <div className={`p-4 border-b ${activeTheme.cardBorder}`}>
                <h3 className={`text-sm font-bold font-display ${activeTheme.cardTitleText} flex items-center gap-1.5`}>
                  🕒 Historical Handover Archive
                </h3>
                <p className={`text-[11px] ${activeTheme.cardSubText}`}>
                  Audit tracker of past sign-offs, dates, shift logs, and statistics.
                </p>
              </div>

              <div className="p-4 space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                {dbState.history.length === 0 ? (
                  <div className={`p-6 text-center ${activeTheme.cardSubText} ${activeTheme.mutedBg} border ${activeTheme.cardBorder} rounded-lg`}>
                    <History className={`w-6 h-6 mx-auto ${activeTheme.cardSubText} mb-2`} />
                    <p className="text-xs font-semibold">No shift history found.</p>
                  </div>
                ) : (
                  dbState.history.map((record) => {
                    const localDate = new Date(record.date).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric"
                    });
                    const localTime = new Date(record.date).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit"
                    });

                    return (
                      <div 
                        key={record.id} 
                        className={`${activeTheme.mutedBg} border ${activeTheme.cardBorder} p-3 rounded-lg space-y-2.5 hover:shadow-xs transition-shadow shadow-2xs`}
                      >
                        <div className={`flex items-center justify-between border-b ${activeTheme.cardBorder} pb-1 w-full`}>
                          <span className={`font-mono text-[9px] font-bold ${activeTheme.cardSubText}`}>
                            {localDate} @ {localTime}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-50/10 text-emerald-550 text-emerald-550 text-emerald-500 font-bold border border-emerald-500/20 uppercase font-mono leading-none">
                              Signed Off
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteConfirmation({
                                  isOpen: true,
                                  type: "history",
                                  id: record.id,
                                  name: `${record.outgoingLead} ➔ ${record.incomingLead} (${localDate})`
                                });
                              }}
                              className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                              title="Delete shift record"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Transition Flow Initials */}
                        <div className="flex items-center gap-1 text-xs">
                          <div className={`${activeTheme.inputBg} border ${activeTheme.cardBorder} px-1.5 py-0.5 rounded flex items-center gap-1`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block"></span>
                            <span className={`font-bold ${activeTheme.cardTitleText} text-[10px] leading-none`}>{record.outgoingLead}</span>
                          </div>
                          <ArrowRight className={`w-3 h-3 ${activeTheme.cardSubText} shrink-0`} />
                          <div className={`${activeTheme.inputBg} border ${activeTheme.cardBorder} px-1.5 py-0.5 rounded flex items-center gap-1`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"></span>
                            <span className={`font-bold ${activeTheme.cardTitleText} text-[10px] leading-none`}>{record.incomingLead}</span>
                          </div>
                        </div>

                        {/* Summary Log memo */}
                        <div className={`${activeTheme.inputBg} rounded p-2 border ${activeTheme.cardBorder} text-[10px] ${activeTheme.cardSubText} italic font-sans leading-relaxed`}>
                          &quot;{record.logText}&quot;
                        </div>

                        <div className={`flex items-center justify-between text-[9px] ${activeTheme.cardSubText} font-mono leading-none border-t ${activeTheme.cardBorder} pt-2`}>
                          <span>Report: {record.tasksCount} Tasks • {record.backlogCount} Backlog</span>
                          <span className="font-sans">Lead: <strong>{record.signedOffBy}</strong></span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

          </div>
        </div>
      </main>

      <footer className={`mt-16 border-t ${activeTheme.cardBorder} py-6 text-center text-xs ${activeTheme.cardSubText} font-mono`}>
        <p>Team Handover & Task Backlog Platform • Professional Core Operations Dashboard</p>
        <p className="mt-1">Vite + React Core Runtime environment successfully validated</p>
      </footer>

      {/* Floating Push Notifications Sandbox overlays */}
      <div className="fixed bottom-5 right-5 z-100 flex flex-col gap-3.5 max-w-sm w-full select-none pointer-events-none pr-2">
        {activePushAlerts.map(push => (
          <motion.div
            key={push.id}
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            className="pointer-events-auto bg-slate-900 text-slate-100 border border-slate-700/80 rounded-xl shadow-2xl p-4 font-sans space-y-1 relative cursor-pointer"
            onClick={() => setActivePushAlerts(prev => prev.filter(p => p.id !== push.id))}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-mono text-[9px] text-slate-400 text-left">
              <span className="flex items-center gap-1 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                SYSTEM PUSH DISPATCH
              </span>
              <span>{push.timestamp}</span>
            </div>
            <p className="font-extrabold text-xs text-emerald-400 tracking-tight leading-snug text-left pt-0.5">
              {push.title}
            </p>
            <p className="text-slate-200 text-xs leading-relaxed text-left">{push.body}</p>
            <span className="absolute top-2.5 right-2.5 text-slate-500 hover:text-slate-350 text-xs font-bold leading-none select-none">×</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
