import React, { useState, useEffect, useRef } from "react";
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
}

interface NotificationItem {
  id: string;
  type: "info" | "success" | "warning";
  message: string;
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

export const DEFAULT_PERSONNEL: PersonnelItem[] = [];

// Initial template mock data
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

export default function App() {
  const isEnvConfigured = !!(((import.meta as any).env || {}).VITE_FIREBASE_PROJECT_ID);
  // App state
  const [dbState, setDbState] = useState<HandoverState>(DEFAULT_WORKSPACE_STATE);

  // Workspace creation modal state
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);
  const [newWorkspaceInputName, setNewWorkspaceInputName] = useState("");
  const [workspaceCreateError, setWorkspaceCreateError] = useState("");

  // Multi-workspace management state
  const [currentSelectedWorkspaceId, setCurrentSelectedWorkspaceId] = useState<string>(() => {
    return localStorage.getItem("handover_active_workspace_id") || "currentWorkspace";
  });
  const [workspaces, setWorkspaces] = useState<{ id: string, name: string }[]>(() => {
    const saved = localStorage.getItem("handover_workspace_list");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out user's auto-created or testing workspaces with naming 'Handover Testing'
          const filtered = parsed.filter(w => 
            w.name !== "Handover Testing" && 
            w.id !== "handover-testing" && 
            w.id !== "ws-handover-testing"
          );
          return filtered.length > 0 ? filtered : [{ id: "currentWorkspace", name: "Default Handover Space" }];
        }
      } catch (e) {
        // ignore and fallback
      }
    }
    return [{ id: "currentWorkspace", name: "Default Handover Space" }];
  });
  
  // Database configuration
  const [firebaseConfigMode, setFirebaseConfigMode] = useState<"demo" | "cloud">("demo");
  const [configKeys, setConfigKeys] = useState<{
    projectId: string;
    apiKey: string;
    authDomain: string;
    appId: string;
  }>(() => {
    const env = (import.meta as any).env || {};
    const envProjectId = env.VITE_FIREBASE_PROJECT_ID || "";
    const envApiKey = env.VITE_FIREBASE_API_KEY || "";
    const envAuthDomain = env.VITE_FIREBASE_AUTH_DOMAIN || "";
    const envAppId = env.VITE_FIREBASE_APP_ID || "";

    if (envProjectId && envApiKey) {
      return {
        projectId: envProjectId,
        apiKey: envApiKey,
        authDomain: envAuthDomain,
        appId: envAppId
      };
    }
    return {
      projectId: "",
      apiKey: "",
      authDomain: "",
      appId: ""
    };
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [firestoreInstance, setFirestoreInstance] = useState<any>(null);
  
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
        });
      }
    }, (err) => {
      console.warn("Snapshot listening on roster failed (possibly due to Firestore rules). Falling back to local/cached roster data.", err);
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
      });
    }

    addNotification(`Added personnel globally: ${name.trim()} (${title.trim()})`, "success");
  };

  const handleRemovePersonnel = (id: string, name: string) => {
    const updated = globalPersonnel.filter(p => p.id !== id);
    setGlobalPersonnel(updated);

    if (firebaseConfigMode === "cloud" && firestoreInstance) {
      setDoc(doc(firestoreInstance, "handoverSettings", "roster"), { list: updated }).catch(err => {
        console.error("Failed to sync personnel removal to cloud", err);
      });
    }

    addNotification(`Removed personnel globally: ${name}`, "warning");
  };

  const [connectionStatusMsg, setConnectionStatusMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
  }>({ type: "info", text: "Running in Standard Local Mode. Data is persisted securely in your web browser." });

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

  const prevDbStateRef = useRef<HandoverState | null>(null);

  useEffect(() => {
    if (!dbState) return;
    
    if (prevDbStateRef.current) {
      const prev = prevDbStateRef.current;
      
      // Check if tasks count changed
      if (dbState.tasks.length > prev.tasks.length) {
        const addedTask = dbState.tasks[0];
        if (addedTask) {
          addNotification(`New drilling task added: "${addedTask.description}" by ${addedTask.ownerName}`, "success");
        }
      } else if (dbState.tasks.length < prev.tasks.length) {
        addNotification("A drilling task was deleted from active track.", "warning");
      } else {
        // Check if tasks completed status changed
        dbState.tasks.forEach((task) => {
          const prevTask = prev.tasks.find(t => t.id === task.id);
          if (prevTask && prevTask.completed !== task.completed) {
            addNotification(
              `Task status updated: "${task.description}" is now ${task.completed ? "COMPLETED" : "OPEN"}`,
              task.completed ? "success" : "info"
            );
          }
        });
      }

      // Check backlog count changed
      if (dbState.backlog.length > prev.backlog.length) {
        const addedBacklog = dbState.backlog[0];
        if (addedBacklog) {
          addNotification(`New backlog filed: "${addedBacklog.description}" owned by ${addedBacklog.ownerName}`, "success");
        }
      } else if (dbState.backlog.length < prev.backlog.length) {
        addNotification("A backlog item was removed or archived.", "warning");
      } else {
        // Check if backlog completed status changed
        dbState.backlog.forEach((item) => {
          const prevItem = prev.backlog.find(b => b.id === item.id);
          if (prevItem && prevItem.completed !== item.completed) {
            addNotification(
              `Backlog progress changed: "${item.description}"`,
              "info"
            );
          }
        });
      }

      // Check if leads updated
      if (dbState.outgoingLead !== prev.outgoingLead && prev.outgoingLead) {
        addNotification(`Outgoing lead updated to: "${dbState.outgoingLead}"`, "info");
      }
      if (dbState.incomingLead !== prev.incomingLead && prev.incomingLead) {
        addNotification(`Incoming lead counterpart aligned to: "${dbState.incomingLead}"`, "info");
      }

      // Check if history log changed
      if (dbState.history.length > prev.history.length) {
        const record = dbState.history[0];
        addNotification(`Handover signed off by ${record.signedOffBy}. Shift rota updated!`, "success");
      }
    }
    
    prevDbStateRef.current = dbState;
  }, [dbState, currentSelectedWorkspaceId]);

  // Firestore object references
  // (Moved up to prevent hoisting/block-scoping errors)

  // Load Firestore configurations initially
  useEffect(() => {
    const env = (import.meta as any).env || {};
    const envProjectId = env.VITE_FIREBASE_PROJECT_ID;
    const envApiKey = env.VITE_FIREBASE_API_KEY;
    const envAuthDomain = env.VITE_FIREBASE_AUTH_DOMAIN || "";
    const envAppId = env.VITE_FIREBASE_APP_ID || "";

    if (envProjectId && envApiKey) {
      const keys = {
        projectId: envProjectId,
        apiKey: envApiKey,
        authDomain: envAuthDomain,
        appId: envAppId
      };
      setConfigKeys(keys);
      initializeFirebaseSync(keys);
    } else {
      const savedKeys = localStorage.getItem("handover_firebase_keys");
      if (savedKeys) {
        try {
          const parsed = JSON.parse(savedKeys);
          if (parsed.projectId && parsed.apiKey) {
            setConfigKeys(parsed);
            initializeFirebaseSync(parsed);
          }
        } catch (e) {
          console.error("Error reading saved localStorage keys", e);
        }
      }
    }
  }, []);

  // Save workspace settings & selection to localStorage
  useEffect(() => {
    localStorage.setItem("handover_workspace_list", JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    localStorage.setItem("handover_active_workspace_id", currentSelectedWorkspaceId);
  }, [currentSelectedWorkspaceId]);

  // Load local demo workspace state when switching in demo mode
  useEffect(() => {
    if (firebaseConfigMode === "demo") {
      const savedLocalState = localStorage.getItem(`handover_local_demo_db_${currentSelectedWorkspaceId}`);
      if (savedLocalState) {
        try {
          setDbState(JSON.parse(savedLocalState));
        } catch (e) {
          console.error("Failed to parse saved local state for " + currentSelectedWorkspaceId, e);
          setDbState(DEFAULT_WORKSPACE_STATE);
        }
      } else {
        setDbState(DEFAULT_WORKSPACE_STATE);
      }
    }
  }, [currentSelectedWorkspaceId, firebaseConfigMode]);

  // Tab state
  const [activeTab, setActiveTab] = useState<"tracker" | "analytics">("tracker");

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

      const db = getFirestore(app);
      setFirestoreInstance(db);
      setFirebaseConfigMode("cloud");
      setIsSettingsOpen(false); // compress panel on success
      
      setConnectionStatusMsg({
        type: "success",
        text: `Connected to Cloud Sync. Querying workspace listing for repository: "${config.projectId}".`
      });

      // Query database for all existing workspaces to populate the dropdown list
      getDocs(collection(db, "handoverSystem")).then((snapshot) => {
        const loadedWorkspaces: { id: string; name: string }[] = [];
        if (!snapshot.empty) {
          snapshot.docs.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            const displayName = data.workspaceName || (docSnapshot.id === "currentWorkspace" 
              ? "Default Handover Space" 
              : docSnapshot.id.replace(/^ws-/, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
            
            // Filter out "Handover Testing" or similar
            if (
              displayName !== "Handover Testing" &&
              docSnapshot.id !== "handover-testing" &&
              docSnapshot.id !== "ws-handover-testing"
            ) {
              loadedWorkspaces.push({
                id: docSnapshot.id,
                name: displayName
              });
            }
          });
        }
        
        // Ensure "currentWorkspace" exists in list
        if (!loadedWorkspaces.some(w => w.id === "currentWorkspace")) {
          loadedWorkspaces.unshift({ id: "currentWorkspace", name: "Default Handover Space" });
        }
        
        setWorkspaces(loadedWorkspaces);
      }).catch(err => {
        console.error("Failed to load existing cloud workspaces list", err);
      });

    } catch (err: any) {
      console.error("Firebase init failed", err);
      setConnectionStatusMsg({
        type: "error",
        text: `Initialization Failed: ${err.message}. Check your configuration formats.`
      });
      setFirebaseConfigMode("demo");
    }
  };

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
        // Document does not exist yet. Initialize it with our current local or default state
        setDbState((current) => {
          setDoc(docRef, current).then(() => {
            setConnectionStatusMsg({
              type: "success",
              text: `Initialized repository document in your Firestore Cloud: "${configKeys.projectId}" -> workspace "${currentSelectedWorkspaceId}"!`
            });
          }).catch(writeErr => {
            console.error("Initial Firestore document push failed", writeErr);
          });
          return current;
        });
      }
    }, (err) => {
      console.error("Snapshot subscription error", err);
      setConnectionStatusMsg({
        type: "error",
        text: `Permission / Connection Denied: ${err.message}. Ensure your Rules match 'handoverSystem/{workspaceId}' and your keys are correct.`
      });
      setFirebaseConfigMode("demo");
    });

    return () => {
      unsubscribe();
    };
  }, [currentSelectedWorkspaceId, firestoreInstance, firebaseConfigMode]);

  const handleWorkspaceChange = (workspaceId: string) => {
    setCurrentSelectedWorkspaceId(workspaceId);
    
    if (firebaseConfigMode === "demo") {
      const savedLocalState = localStorage.getItem(`handover_local_demo_db_${workspaceId}`);
      if (savedLocalState) {
        try {
          setDbState(JSON.parse(savedLocalState));
        } catch (e) {
          console.error("Failed to parse saved local state for " + workspaceId, e);
          setDbState(DEFAULT_WORKSPACE_STATE);
        }
      } else {
        setDbState(DEFAULT_WORKSPACE_STATE);
      }
    } else {
      // In cloud mode: Immediately clear current UI tables/data to fulfill the 'clear the tables' directive
      // until onSnapshot updates from Firestore
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
        setShowNewWorkspaceModal(false);
        setNewWorkspaceInputName("");
        setWorkspaceCreateError("");
      }).catch(err => {
        console.error("Failed to provision new cloud workspace", err);
        setWorkspaceCreateError(`Failed to write new workspace: ${err.message}`);
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
      
      setShowNewWorkspaceModal(false);
      setNewWorkspaceInputName("");
      setWorkspaceCreateError("");
    }
    return true;
  };

  const handleDeleteWorkspace = (id: string) => {
    if (id === "currentWorkspace") {
      addNotification("The Default Handover Space cannot be deleted.", "warning");
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
      });
    }

    // Switch selection if current was deleted
    if (currentSelectedWorkspaceId === id) {
      const fallbackId = updatedWorkspaces[0]?.id || "currentWorkspace";
      handleWorkspaceChange(fallbackId);
    }

    addNotification(`Handover workspace "${wsName}" deleted successfully.`, "success");
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
    setConfigKeys({ projectId: "", apiKey: "", authDomain: "", appId: "" });
    setFirestoreInstance(null);
    setFirebaseConfigMode("demo");
    setWorkspaces([{ id: "currentWorkspace", name: "Default Handover Space" }]);
    setCurrentSelectedWorkspaceId("currentWorkspace");
    setConnectionStatusMsg({
      type: "info",
      text: "Disconnected from Cloud Sync. Returned to local browser storage."
    });
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
      triggerFirebaseWrite(next);
      if (firebaseConfigMode === "demo") {
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
    updateWorkspaceState((prev) => ({
      ...prev,
      signoffChecklist: {
        ...prev.signoffChecklist,
        [key]: !prev.signoffChecklist[key]
      }
    }));
  };

  // Handle Complete Handover Sign-off
  const handleCompleteSignOff = () => {
    if (!dbState.outgoingLead.trim()) {
      alert("Please specify the Outgoing Shift Lead.");
      return;
    }
    if (!dbState.incomingLead.trim()) {
      alert("Please specify the Incoming Counterpart.");
      return;
    }
    if (!logText.trim()) {
      alert("Please provide the shift log text in the field below before completing the Handover.");
      return;
    }

    // Capture counts of tasks and backlog
    const activeRemaining = dbState.tasks.filter(t => !t.completed).length;
    const backlogCount = dbState.backlog.filter(b => !b.completed).length;

    const newHistoryItem: HandoverHistoryItem = {
      id: `history-${Date.now()}`,
      date: new Date().toISOString(),
      outgoingLead: dbState.outgoingLead,
      incomingLead: dbState.incomingLead,
      logText: logText,
      tasksCount: dbState.tasks.length,
      backlogCount: dbState.backlog.length,
      signedOffBy: dbState.outgoingLead
    };

    // Advanced rotation logic: 
    // Outgoing Lead becomes the previous incoming, 
    // Completed tasks are archived, unresolved active tasks are retained
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

    setLogText("");
    alert(`Handover signed off successfully! Rotation updated: ${dbState.incomingLead} is now the Outgoing Lead.`);
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
    } else if (firebaseConfigMode === "cloud") {
      return {
        label: "Cloud Synced",
        badgeStyle: "bg-indigo-50 text-indigo-700 border border-indigo-200",
        textStyle: "text-indigo-700"
      };
    } else {
      return {
        label: "Standard Local",
        badgeStyle: "bg-slate-100 text-slate-700 border border-slate-300",
        textStyle: "text-slate-600"
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
                <Plus className="w-4 h-4 text-indigo-650" />
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
                className="px-3.5 py-1.5 bg-indigo-650 text-white hover:bg-indigo-700 rounded text-xs font-bold shadow-xs active:scale-98 transition-transform cursor-pointer"
              >
                Create Handover Space
              </button>
            </div>
          </form>
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
                <span className={`px-2 py-0.5 text-xs font-mono font-semibold rounded-full ${
                  firebaseConfigMode === "cloud" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"
                }`}>
                  {firebaseConfigMode === "cloud" ? "Live Cloud Sync" : "Standard Local"}
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
              {currentSelectedWorkspaceId !== "currentWorkspace" && (
                <button
                  type="button"
                  onClick={() => handleDeleteWorkspace(currentSelectedWorkspaceId)}
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
                      onClick={() => setNotifications([])}
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
              {firebaseConfigMode === "demo" && (
                <p className="text-xs text-slate-500 mt-0.5">
                  To sync across engineers in real-time or secure logs, configure your Firestore database below.
                </p>
              )}
            </div>
          </div>
          {firebaseConfigMode === "cloud" && !isEnvConfigured && (
            <button
              onClick={handleDisconnectFirebase}
              className="px-2 py-1 bg-white hover:bg-slate-50 text-rose-600 border border-rose-200 hover:border-rose-300 text-xs rounded transition-colors"
            >
              Disconnect Cloud
            </button>
          )}
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pl-2">
              {/* Left Column: Personnel Roster Management */}
              <div className="lg:col-span-5 space-y-4 border-b border-slate-200 pb-6 lg:border-b-0 lg:pb-0 lg:border-r lg:border-slate-200 lg:pr-6 text-left">
                <div>
                  <h3 className="text-xs uppercase tracking-wider font-extrabold text-slate-705 text-indigo-950 font-mono flex items-center gap-1">
                    <span>👥</span> Add / Manage Personnel
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">
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
                  className="space-y-3 bg-white p-3 border border-slate-200 rounded-lg shadow-3xs"
                >
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold tracking-wider text-slate-500 font-mono block">
                      Full Name
                    </label>
                    <input
                      name="personName"
                      type="text"
                      placeholder="e.g., David Kim"
                      className="bg-white border border-[#E2E8F0] rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold tracking-wider text-slate-500 font-mono block">
                      Title / Role Spec
                    </label>
                    <input
                      name="personTitle"
                      type="text"
                      placeholder="e.g., Night Superintendent"
                      className="bg-white border border-[#E2E8F0] rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-indigo-650 hover:bg-indigo-700 bg-indigo-600 text-white text-[11px] font-bold py-1.5 px-3 rounded transition-colors cursor-pointer"
                  >
                    + Add to Roster
                  </button>
                </form>

                {/* Personnel List */}
                <div className="space-y-1.5">
                  <span className="text-[9px] uppercase font-extrabold tracking-wider text-slate-400 font-mono block">
                    Active Roster ({personnelList.length})
                  </span>
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {personnelList.map((p) => (
                      <div 
                        key={p.id} 
                        className="flex items-center justify-between text-xs p-2 bg-white border border-slate-100 rounded-md shadow-3xs hover:bg-slate-50/55 transition-colors"
                      >
                        <div className="text-left">
                          <p className="font-semibold text-slate-800">{p.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{p.title}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePersonnel(p.id, p.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                          title="Delete Personnel"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Database Configuration */}
              <div className="lg:col-span-7 space-y-4 text-left">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xs uppercase tracking-wider font-extrabold text-indigo-950 font-mono flex items-center gap-1">
                      <span>🔌</span> Firebase Database Connection
                    </h3>
                    <p className="text-[11px] text-slate-500 leading-normal mt-1">
                      Link your workspace to a Google Cloud Firestore instance. All rotation checks, checklists, tasks, and historical entries will synchronize in real-time across users.
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-tighter ${
                    firebaseConfigMode === "cloud" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"
                  }`}>
                    {firebaseConfigMode === "cloud" ? "Live Cloud Sync" : "Standard Local Mode"}
                  </span>
                </div>

                {isEnvConfigured ? (
                  <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-5 space-y-3.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs font-mono uppercase tracking-wider">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                      <span>Production Live Cloud Sync Active</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      This system has been successfully promoted to Live Production. It connects automatically to your centralized Cloud Firestore cluster. All rosters, tasks, items, logs, and workspaces synchronize instantly across all devices. No manual setup is required.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 font-mono text-[10px]">
                      <div>
                        <span className="block font-bold text-slate-400">PROJECT ID:</span>
                        <span className="text-slate-705 font-bold tracking-tight text-slate-800">{configKeys.projectId}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-400">ACCESS PROTOCOL:</span>
                        <span className="font-bold text-indigo-700">Enterprise Direct Link</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleConnectFirebase} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] uppercase font-bold tracking-wider text-slate-500 font-mono">Project ID <span className="text-rose-500">*</span></label>
                        <input
                          type="text"
                          placeholder="project-x-42"
                          value={configKeys.projectId}
                          onChange={(e) => setConfigKeys({ ...configKeys, projectId: e.target.value })}
                          className="bg-white border border-[#E2E8F0] rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full font-mono"
                          required
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] uppercase font-bold tracking-wider text-slate-500 font-mono">API Key <span className="text-rose-500">*</span></label>
                        <input
                          type="password"
                          placeholder="AIzaSyD-fake-key"
                          value={configKeys.apiKey}
                          onChange={(e) => setConfigKeys({ ...configKeys, apiKey: e.target.value })}
                          className="bg-white border border-[#E2E8F0] rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] uppercase font-bold tracking-wider text-slate-500 font-mono">Auth Domain</label>
                        <input
                          type="text"
                          placeholder="app.firebaseapp.com"
                          value={configKeys.authDomain}
                          onChange={(e) => setConfigKeys({ ...configKeys, authDomain: e.target.value })}
                          className="bg-white border border-[#E2E8F0] rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full font-mono"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] uppercase font-bold tracking-wider text-slate-500 font-mono">App ID</label>
                        <input
                          type="text"
                          placeholder="1:2345:web:abc"
                          value={configKeys.appId}
                          onChange={(e) => setConfigKeys({ ...configKeys, appId: e.target.value })}
                          className="bg-white border border-[#E2E8F0] rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="submit"
                        className="flex-1 bg-indigo-650 hover:bg-indigo-700 bg-indigo-600 text-white text-xs font-bold py-2 px-4 rounded transition-colors cursor-pointer"
                      >
                        Connect to Firebase Cloud
                      </button>
                      {firebaseConfigMode === "cloud" && (
                        <button
                          type="button"
                          onClick={handleDisconnectFirebase}
                          className="bg-white hover:bg-slate-50 text-rose-600 border border-rose-200 hover:border-rose-300 text-xs rounded py-2 px-4 transition-colors cursor-pointer"
                        >
                          Disconnect Cloud
                        </button>
                      )}
                    </div>
                  </form>
                )}

                <div className="pt-2 text-[11px] text-slate-500 border-t border-[#E2E8F0] flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 inline-block"></span>
                    Active database configurations are managed securely.
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
          </div>
        )}

        {/* 2. Header & Active Rotation Ribbon */}
        <section className="bg-indigo-900 border border-indigo-950 rounded-xl p-6 shadow-md text-white">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
            
            {/* Left Box: Active state description */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-300 font-mono">
                ACTIVE ROTATION SHIFT INTERVAL
              </span>
              <h2 className="text-lg font-bold font-display text-white">
                Rotational Handover Interval
              </h2>
              <div className="text-xs text-indigo-150 flex items-center gap-1">
                <span>Active Cycle Boundary: </span>
                <span className="font-mono bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-800 font-medium text-indigo-300">
                  {CURRENT_DATE_STR} 13:13:56 UTC
                </span>
              </div>
            </div>

            {/* Middle: Active Shift Rotation flow */}
            <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-4 bg-indigo-950/40 border border-indigo-800 rounded-lg p-4 max-w-2xl">
              
              {/* Outgoing Outbox */}
              <div className="flex-1 w-full text-center space-y-1.5">
                <span className="text-[9px] uppercase tracking-wider font-semibold text-rose-300 font-mono bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/30">
                  Outgoing Shift Lead
                </span>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center justify-center border border-rose-500/30">
                    {getInitials(dbState.outgoingLead)}
                  </div>
                  <select
                    value={dbState.outgoingLead}
                    onChange={(e) => updateWorkspaceState((prev) => ({ ...prev, outgoingLead: e.target.value }))}
                    className="text-xs sm:text-sm font-semibold text-white bg-indigo-950/80 hover:bg-indigo-900 focus:bg-indigo-950 border border-indigo-700/80 focus:border-white focus:outline-none rounded px-2.5 py-1.5 max-w-[210px] text-center font-display cursor-pointer"
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
                <ArrowRight className="w-5 h-5 text-indigo-300 animate-bounce" />
                <span className="text-[9px] text-indigo-400 font-mono">Transfer</span>
              </div>

              {/* Incoming Counterpart */}
              <div className="flex-1 w-full text-center space-y-1.5">
                <span className="text-[9px] uppercase tracking-wider font-semibold text-indigo-300 font-mono bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/30">
                  Incoming Counterpart
                </span>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center border border-indigo-500/30">
                    {getInitials(dbState.incomingLead)}
                  </div>
                  <select
                    value={dbState.incomingLead}
                    onChange={(e) => updateWorkspaceState((prev) => ({ ...prev, incomingLead: e.target.value }))}
                    className="text-xs sm:text-sm font-semibold text-white bg-indigo-950/80 hover:bg-indigo-900 focus:bg-indigo-950 border border-indigo-700/80 focus:border-white focus:outline-none rounded px-2.5 py-1.5 max-w-[210px] text-center font-display cursor-pointer"
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
              <span className="text-[10px] uppercase font-bold text-indigo-300 font-mono mb-1">
                TRANSITION STATUS
              </span>
              <div className={`px-4 py-2 rounded-full font-bold text-xs border shadow-xs tracking-tight uppercase ${currentStatus.badgeStyle}`}>
                ● {currentStatus.label}
              </div>
            </div>

          </div>
        </section>

        {/* Main Content Tab Navigation */}
        <div className="flex items-center justify-start border-b border-[#E2E8F0] pb-2 pt-1">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-[#E2E8F0] shadow-3xs">
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "analytics"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>📊</span> Analytics Dashboard
            </button>
            <button
              onClick={() => setActiveTab("tracker")}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "tracker"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
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
                {/* 3. Current Handover Tasks Section */}
            <section className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs text-slate-800">
              
              {/* Header Box styled with design theme */}
              <div className="bg-white p-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-indigo-600 rounded-full shrink-0 animate-pulse"></span>
                  <div>
                    <h3 className="text-sm font-bold font-display text-slate-900 flex items-center gap-1.5">
                      Active Handover Cycle Tasks
                    </h3>
                    <p className="text-[11px] text-slate-500 leading-none">
                      Critical tasks verified and actioned during the active transition window.
                    </p>
                  </div>
                </div>
                {/* Micro Progress Tracker Bar */}
                <div className="text-right space-y-1 min-w-40">
                  <div className="flex justify-between text-[11px] font-medium">
                    <span className="text-slate-500">Cycle Completeness</span>
                    <span className="text-emerald-700 font-bold">{percentComplete}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 border border-slate-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-550"
                      style={{ width: `${percentComplete}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono leading-none">
                    {completedCount} of {totalTasksCount} signed off
                  </p>
                </div>
              </div>

              {/* Task table / Card layout */}
              <div className="p-4 bg-white">
                <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
                  <table className="w-full text-left text-xs bg-white border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] text-slate-500 border-b border-[#E2E8F0] font-mono text-[10px] uppercase font-bold">
                        <th className="p-3 w-10 text-center">Done</th>
                        <th className="p-3">Task Description</th>
                        <th className="p-3 w-28 text-center">Owner</th>
                        <th className="p-3 w-24 text-center">Priority</th>
                        <th className="p-3 w-32 text-center">Countdown</th>
                        <th className="p-3 w-12 text-center">Trash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {dbState.tasks.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 bg-[#F8FAFC]/50">
                            <CheckCircle2 className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                            <p className="font-semibold text-xs">No active tasks in current rotation.</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Use the prompt box beneath to queue transition tasks.</p>
                          </td>
                        </tr>
                      ) : (
                        dbState.tasks.map((task) => {
                          const countdown = calculateDaysRemaining(task.dueDate);
                          
                          return (
                            <tr 
                              key={task.id} 
                              className={`hover:bg-slate-50 transition-colors ${
                                task.completed ? "bg-emerald-50/10 text-slate-400" : ""
                              }`}
                            >
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => handleToggleTask(task.id)}
                                  className="focus:outline-none inline-block align-middle cursor-pointer transition-transform duration-100 active:scale-95 text-slate-450 hover:text-indigo-650"
                                >
                                  {task.completed ? (
                                    <CheckSquare className="w-5 h-5 text-emerald-600 fill-emerald-50" />
                                  ) : (
                                    <Square className="w-5 h-5 text-slate-300 hover:text-indigo-650" />
                                  )}
                                </button>
                              </td>

                              <td className="p-3 font-medium leading-relaxed">
                                <span className={task.completed ? "line-through text-slate-400" : ""}>
                                  {task.description}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 bg-[#F8FAFC] border border-[#E2E8F0] text-slate-600 font-semibold rounded-full text-[10px]">
                                  {task.ownerName}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
                                  task.priority === "High" 
                                    ? "bg-rose-50 text-rose-700 border-rose-200" 
                                    : task.priority === "Medium"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                }`}>
                                  {task.priority}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                {task.completed ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase font-mono">
                                    Signed Off
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                    countdown.isOverdue 
                                      ? "bg-rose-105 bg-rose-50 text-rose-800 border-rose-200 animate-pulse" 
                                      : countdown.isToday
                                      ? "bg-amber-100 text-amber-950 border-amber-200 font-bold"
                                      : "bg-slate-50 text-slate-700 border-slate-200"
                                  }`}>
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {countdown.text}
                                  </span>
                                )}
                              </td>

                              <td className="p-3 text-center">
                                <button
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="text-slate-350 hover:text-rose-600 hover:bg-rose-50 p-1 rounded transition-colors"
                                  title="Remove Task"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 m-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 font-mono flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-indigo-500" />
                  Add Shift Task to Current Cycle
                </h4>
                <form onSubmit={handleAddTask} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Task Description</label>
                    <input
                      type="text"
                      placeholder='e.g., Verify 9-5/8" intermediate casing tally and check cement slurry weight'
                      value={newTask.description}
                      onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                      className="bg-white border border-[#E2E8F0] rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full shadow-xs"
                      required
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Owner Name</label>
                    <select
                      value={newTask.ownerName}
                      onChange={(e) => setNewTask({ ...newTask, ownerName: e.target.value })}
                      className="bg-white border border-[#E2E8F0] rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full shadow-xs cursor-pointer"
                      required
                    >
                      <option value="">Select Owner</option>
                      {personnelList.map(p => (
                        <option key={p.id} value={`${p.name} (${p.title})`}>{p.name} ({p.title})</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Priority</label>
                    <select
                      value={newTask.priority}
                      onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}
                      className="bg-white border border-[#E2E8F0] rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full shadow-xs"
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Due Date</label>
                    <input
                      type="date"
                      value={newTask.dueDate}
                      onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                      className="bg-white border border-[#E2E8F0] rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full font-mono shadow-xs"
                      required
                    />
                  </div>

                  <div className="md:col-span-1">
                    <button
                      type="submit"
                      className="w-full h-[32px] bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
                      title="Add to table"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </div>

            </section>

            {/* 4. Persistent Task Backlog Section */}
            <section className="bg-rose-50/15 border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50/45 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
              
              {/* Header block with red-accent banner styling */}
              <div className="bg-white p-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-rose-500 rounded-full shrink-0"></span>
                  <div>
                    <h3 className="text-sm font-bold font-display text-slate-900 inline-flex items-center gap-1.5">
                      Persistent Backlog Block
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Unresolved tasks carried over across cycles. Keeps long-term issues visible until closure.
                    </p>
                  </div>
                </div>
                {/* Visual badge highlight */}
                <div className="px-2.5 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 rounded font-mono text-[9px] font-bold leading-none shrink-0 uppercase tracking-wide">
                  ACTIVE AGING TICKER
                </div>
              </div>

              {/* Backlog table container */}
              <div className="p-4 bg-white/60">
                <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg bg-white">
                  <table className="w-full text-left text-xs bg-white border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] text-slate-500 border-b border-[#E2E8F0] font-mono text-[10px] uppercase font-bold">
                        <th className="p-3 w-10 text-center">Done</th>
                        <th className="p-3">Backlog Task Description</th>
                        <th className="p-3 w-28 text-center">Owner</th>
                        <th className="p-3 w-24 text-center">Priority</th>
                        <th className="p-3 w-36 text-center">Aging Days</th>
                        <th className="p-3 w-32 text-center">Interaction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {dbState.backlog.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 bg-slate-50/50">
                            <CheckCircle2 className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                            <p className="font-semibold text-xs">The Backlog is clean!</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">All persistent items checked off or closed.</p>
                          </td>
                        </tr>
                      ) : (
                        dbState.backlog.map((item) => {
                          const agingDays = calculateAgingDays(item.backlogDate);
                          
                          return (
                            <tr 
                              key={item.id} 
                              className={`hover:bg-slate-50/60 transition-colors ${
                                item.completed ? "bg-emerald-50/10 text-slate-400" : ""
                              }`}
                            >
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => handleToggleBacklog(item.id)}
                                  className="focus:outline-none inline-block align-middle cursor-pointer text-slate-450 hover:text-indigo-650"
                                >
                                  {item.completed ? (
                                    <CheckSquare className="w-5 h-5 text-emerald-600" />
                                  ) : (
                                    <Square className="w-5 h-5 text-slate-300 hover:text-indigo-650" />
                                  )}
                                </button>
                              </td>

                              <td className="p-3 font-medium leading-relaxed">
                                <span className={item.completed ? "line-through text-slate-400" : ""}>
                                  {item.description}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 bg-[#F8FAFC] border border-[#E2E8F0] text-slate-600 font-semibold rounded-full text-[10px]">
                                  {item.ownerName}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
                                  item.priority === "High" 
                                    ? "bg-rose-50 text-rose-700 border-rose-200" 
                                    : item.priority === "Medium"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                }`}>
                                  {item.priority}
                                </span>
                              </td>

                              <td className="p-3 text-center">
                                {item.completed ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] uppercase font-mono">
                                    Signed Off
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                    agingDays >= 20 
                                      ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse" 
                                      : agingDays >= 10
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : "bg-slate-50 text-slate-600 border-slate-150"
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
                                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] rounded font-semibold inline-flex items-center gap-0.5 transition-colors cursor-pointer"
                                      title="Move this task to active rotation due today."
                                    >
                                      Promote
                                      <ArrowUpRight className="w-3 h-3 text-indigo-650" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteBacklog(item.id)}
                                    className="text-slate-350 hover:text-rose-600 hover:bg-rose-50 p-1 rounded font-semibold text-xs inline-block cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 m-4 space-y-3 shadow-xs">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 font-mono flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-rose-500" />
                  File New Backlog Item
                </h4>
                <form onSubmit={handleAddBacklog} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-12 lg:col-span-5 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Task Description</label>
                    <input
                      type="text"
                      placeholder="e.g., Design offset structural template and finalize pore pressure logs"
                      value={newBacklog.description}
                      onChange={(e) => setNewBacklog({ ...newBacklog, description: e.target.value })}
                      className="bg-white border border-[#E2E8F0] rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full shadow-xs"
                      required
                    />
                  </div>

                  <div className="md:col-span-4 lg:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Owner Name</label>
                    <select
                      value={newBacklog.ownerName}
                      onChange={(e) => setNewBacklog({ ...newBacklog, ownerName: e.target.value })}
                      className="bg-white border border-[#E2E8F0] rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full shadow-xs cursor-pointer"
                      required
                    >
                      <option value="">Select Owner</option>
                      {personnelList.map(p => (
                        <option key={p.id} value={`${p.name} (${p.title})`}>{p.name} ({p.title})</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3 lg:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Priority</label>
                    <select
                      value={newBacklog.priority}
                      onChange={(e) => setNewBacklog({ ...newBacklog, priority: e.target.value as any })}
                      className="bg-white border border-[#E2E8F0] rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full shadow-xs"
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>

                  <div className="md:col-span-3 lg:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Created Date</label>
                    <input
                      type="date"
                      value={newBacklog.backlogDate}
                      onChange={(e) => setNewBacklog({ ...newBacklog, backlogDate: e.target.value })}
                      className="bg-white border border-[#E2E8F0] rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 outline-none w-full font-mono shadow-xs"
                      required
                    />
                  </div>

                  <div className="md:col-span-2 lg:col-span-1">
                    <button
                      type="submit"
                      className="w-full h-[32px] bg-slate-100 border border-[#E2E8F0] text-slate-700 hover:bg-slate-200 rounded text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
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
                
                {/* 1. Global KPI Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  
                  {/* Card 1: Open Shift Tasks */}
                  <div className="bg-white border border-indigo-150 rounded-xl p-4 shadow-3xs flex flex-col justify-between relative overflow-hidden h-28 hover:shadow-2xs transition-shadow">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 font-mono">
                      Open Shift Tasks
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-3xl font-black font-display text-indigo-900 leading-none">
                        {dbState.tasks.filter((t) => !t.completed).length}
                      </span>
                      <span className="text-xs text-indigo-400 font-mono font-medium">
                        active cycle
                      </span>
                    </div>
                  </div>

                  {/* Card 2: Critical Bottlenecks */}
                  <div className="bg-white border border-rose-150 rounded-xl p-4 shadow-3xs flex flex-col justify-between relative overflow-hidden h-28 hover:shadow-2xs transition-shadow">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 font-mono">
                      Critical Bottlenecks
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-3xl font-black font-display text-rose-900 leading-none">
                        {dbState.tasks.filter((t) => !t.completed && (t.priority === "High" || calculateDaysRemaining(t.dueDate).isOverdue)).length}
                      </span>
                      <span className="text-xs text-rose-400 font-mono font-medium">
                        high & overdue
                      </span>
                    </div>
                  </div>

                  {/* Card 3: Total Persistent Backlog */}
                  <div className="bg-white border border-amber-150 rounded-xl p-4 shadow-3xs flex flex-col justify-between relative overflow-hidden h-28 hover:shadow-2xs transition-shadow">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 font-mono">
                      Total Persistent Backlog
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-3xl font-black font-display text-amber-950 leading-none">
                        {dbState.backlog.filter((b) => !b.completed).length}
                      </span>
                      <span className="text-xs text-amber-500 font-mono font-medium">
                        pending log
                      </span>
                    </div>
                  </div>

                  {/* Card 4: Rotation Sign-Off Rate */}
                  <div className="bg-white border border-emerald-150 rounded-xl p-4 shadow-3xs flex flex-col justify-between relative overflow-hidden h-28 hover:shadow-2xs transition-shadow">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 font-mono">
                      Rotation Sign-Off Rate
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-3xl font-black font-display text-emerald-900 leading-none">
                        {(() => {
                          const total = dbState.tasks.length + dbState.backlog.length;
                          const completed = dbState.tasks.filter((t) => t.completed).length + dbState.backlog.filter((b) => b.completed).length;
                          return total > 0 ? Math.round((completed / total) * 100) : 100;
                        })()}%
                      </span>
                      <span className="text-xs text-emerald-500 font-mono font-medium">
                        overall completed
                      </span>
                    </div>
                  </div>

                </div>

                {/* 2. Secondary Panel Grid: Aging and Resource Matrix side-by-side on lg */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Task Aging & Distribution Panel */}
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs p-5 space-y-4">
                    <div className="border-b border-[#E2E8F0] pb-2.5">
                      <h4 className="text-xs font-bold font-display uppercase tracking-wider text-slate-850 flex items-center gap-1.5">
                        ⏳ Backlog Aging and Distribution Timeline
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed font-sans">
                        Evaluates outstanding backlogs grouped by duration since record creation (relative to current date).
                      </p>
                    </div>

                    <div className="space-y-4 pt-1">
                      {(() => {
                        const openBacklogs = dbState.backlog.filter(b => !b.completed);
                        const totalCount = openBacklogs.length;
                        
                        const groups = [
                          { label: "Critical Age (> 30 Days)", count: openBacklogs.filter(b => calculateAgingDays(b.backlogDate) > 30).length, color: "bg-rose-500" },
                          { label: "Warning Age (15 - 30 Days)", count: openBacklogs.filter(b => { const d = calculateAgingDays(b.backlogDate); return d > 14 && d <= 30; }).length, color: "bg-amber-500" },
                          { label: "Moderate Age (8 - 14 Days)", count: openBacklogs.filter(b => { const d = calculateAgingDays(b.backlogDate); return d > 7 && d <= 14; }).length, color: "bg-indigo-505 bg-indigo-500" },
                          { label: "Recent Queue (≤ 7 Days)", count: openBacklogs.filter(b => calculateAgingDays(b.backlogDate) <= 7).length, color: "bg-emerald-500" },
                        ];

                        return (
                          <>
                            {totalCount === 0 ? (
                              <div className="py-12 text-center text-slate-400 bg-white border border-[#E2E8F0] rounded-lg p-4">
                                <span className="text-xl">✨</span>
                                <p className="font-semibold text-xs mt-1 text-slate-600">All Backlog Items Cleared!</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">There are zero open persistent items aging in storage.</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {groups.map((g) => {
                                  const pct = totalCount > 0 ? Math.round((g.count / totalCount) * 100) : 0;
                                  return (
                                    <div key={g.label} className="space-y-1">
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-slate-700">{g.label}</span>
                                        <span className="font-mono text-slate-500 font-bold">{g.count} <span className="text-[10px] text-slate-400">({pct}%)</span></span>
                                      </div>
                                      <div className="w-full h-2.5 bg-slate-100 rounded-full border border-slate-200 overflow-hidden">
                                        <div 
                                          className={`h-full ${g.color} rounded-full transition-all duration-500`} 
                                          style={{ width: `${pct}%` }} 
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                                <p className="text-[10px] text-slate-400 text-center font-mono pt-1">
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
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs p-5 space-y-4">
                    <div className="border-b border-[#E2E8F0] pb-2.5">
                      <h4 className="text-xs font-bold font-display uppercase tracking-wider text-slate-850 flex items-center gap-1.5">
                        👥 Resource Workload & Priority Matrix
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed font-sans">
                        Tracks open task counts assigned across active on-shift operators and backlog queues.
                      </p>
                    </div>

                    <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
                      {(() => {
                        const activeOpenTasks = dbState.tasks.filter(t => !t.completed);
                        const activeOpenBacklog = dbState.backlog.filter(b => !b.completed);
                        
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
                            <div className="py-12 text-center text-slate-400 bg-white p-4">
                              <span className="text-xl">✅</span>
                              <p className="font-semibold text-xs mt-1 text-slate-600">Perfect Workload Balance</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">All engineers currently have zero pending open actions.</p>
                            </div>
                          );
                        }

                        return (
                          <table className="w-full text-left text-xs bg-white border-collapse">
                            <thead>
                              <tr className="bg-slate-50 text-slate-505 border-b border-[#E2E8F0] font-mono text-[10px] uppercase font-bold">
                                <th className="p-2.5">Resource Name</th>
                                <th className="p-2.5 text-center text-rose-700">High</th>
                                <th className="p-2.5 text-center text-amber-700">Med</th>
                                <th className="p-2.5 text-center text-indigo-700">Low</th>
                                <th className="p-2.5 text-center font-bold text-slate-850">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E2E8F0]">
                              {matrixRows.map(row => (
                                <tr key={row.owner} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-2.5 font-semibold text-slate-800">{row.owner}</td>
                                  <td className={`p-2.5 text-center font-mono font-bold ${row.high ? "text-rose-600 bg-rose-50/20" : "text-slate-300"}`}>
                                    {row.high || "-"}
                                  </td>
                                  <td className={`p-2.5 text-center font-mono font-bold ${row.med ? "text-amber-600 bg-amber-50/20" : "text-slate-300"}`}>
                                    {row.med || "-"}
                                  </td>
                                  <td className={`p-2.5 text-center font-mono font-bold ${row.low ? "text-indigo-600 bg-indigo-50/20" : "text-slate-300"}`}>
                                    {row.low || "-"}
                                  </td>
                                  <td className="p-2.5 text-center font-mono font-bold bg-slate-50/50 text-slate-900 border-l border-[#E2E8F0]">
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

              </div>
            )}
          </div>

          {/* Sidebar Area (Right - Width: 1 col) */}
          <div className="space-y-6">
            
            {/* 6. Digital Sign-Off Panel */}
            {activeTab === "tracker" && (
              <section className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
                
                <div className="bg-white p-4 border-b border-[#E2E8F0]">
                  <h3 className="text-sm font-bold font-display text-slate-900 flex items-center gap-1.5">
                    🛡️ Digital Sign-off Panel
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Confirm rotational procedures prior to finalizing operational handover.
                  </p>
                </div>

                {/* Checklist */}
                <div className="p-4 space-y-4">
                  <div className="space-y-2.5">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono block">
                      Mandatory Operating Verifications
                    </label>

                    {/* Checkbox item 1 */}
                    <button
                      type="button"
                      onClick={() => handleToggleChecklist("blockersReviewed")}
                      className="w-full flex items-start gap-2.5 text-left p-2.5 bg-white border border-[#E2E8F0] hover:border-indigo-400 hover:bg-indigo-50/5 rounded-lg transition-all text-xs cursor-pointer group"
                    >
                      <span className="mt-0.5 shrink-0">
                        {dbState.signoffChecklist.blockersReviewed ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                        )}
                      </span>
                      <div>
                        <span className="font-semibold text-slate-800 block leading-tight">Direct Counterpart Briefing Completed</span>
                        <span className="text-[10px] text-slate-400 leading-normal block mt-0.5">Conducted a direct, line-by-line sync on all critical ongoing files, look-ahead plans, and active team challenges.</span>
                      </div>
                    </button>

                    {/* Checkbox item 2 */}
                    <button
                      type="button"
                      onClick={() => handleToggleChecklist("systemsNormal")}
                      className="w-full flex items-start gap-2.5 text-left p-2.5 bg-white border border-[#E2E8F0] hover:border-indigo-400 hover:bg-indigo-50/5 rounded-lg transition-all text-xs cursor-pointer group"
                    >
                      <span className="mt-0.5 shrink-0">
                        {dbState.signoffChecklist.systemsNormal ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                        )}
                      </span>
                      <div>
                        <span className="font-semibold text-slate-800 block leading-tight">Outstanding Tasks & High-Priority Backlog Noticed</span>
                        <span className="text-[10px] text-slate-400 leading-normal block mt-0.5">Incoming engineer has explicitly reviewed the active deadlines list and verified assigned ownership for pending items.</span>
                      </div>
                    </button>

                    {/* Checkbox item 3 */}
                    <button
                      type="button"
                      onClick={() => handleToggleChecklist("credsTransferred")}
                      className="w-full flex items-start gap-2.5 text-left p-2.5 bg-white border border-[#E2E8F0] hover:border-indigo-400 hover:bg-indigo-50/5 rounded-lg transition-all text-xs cursor-pointer group"
                    >
                      <span className="mt-0.5 shrink-0">
                        {dbState.signoffChecklist.credsTransferred ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                        )}
                      </span>
                      <div>
                        <span className="font-semibold text-slate-800 block leading-tight">Master & Important Documents Handovered</span>
                        <span className="text-[10px] text-slate-400 leading-normal block mt-0.5">Saved all the latest versions of documents.</span>
                      </div>
                    </button>
                  </div>

                  {/* Handover Logs Note Area */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono block">
                      Handover Summary Notes <span className="text-[#F43F5E] font-bold">*</span>
                    </label>
                    <textarea
                      placeholder="e.g., Aligned casing designs, reviewed Phase-2 tender status for Rig-42. Confirmed long-lead casing AFE approvals are in progress, dispatched material procurement sheets."
                      rows={4}
                      value={logText}
                      onChange={(e) => setLogText(e.target.value)}
                      className="w-full text-xs p-2.5 bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder:text-slate-400 font-sans resize-y shadow-xs"
                      required
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleCompleteSignOff}
                      className="w-full py-2.5 bg-emerald-600 font-bold hover:bg-emerald-700 text-white rounded text-xs leading-none transition-colors shadow-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <FileCheck className="w-4 h-4" />
                      Acknowledge & Save Handover
                    </button>
                    <p className="text-[9px] text-slate-400 text-center mt-2 font-mono leading-none">
                      Triggering commits rotation & logs write action dynamically.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* 5. Handover History Archive */}
            <section className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
              
              <div className="bg-white p-4 border-b border-[#E2E8F0]">
                <h3 className="text-sm font-bold font-display text-slate-900 flex items-center gap-1.5">
                  🕒 Historical Handover Archive
                </h3>
                <p className="text-[11px] text-slate-500">
                  Audit tracker of past sign-offs, dates, shift logs, and statistics.
                </p>
              </div>

              <div className="p-4 space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                {dbState.history.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-white border border-[#E2E8F0] rounded-lg">
                    <History className="w-6 h-6 mx-auto text-slate-300 mb-2" />
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
                        className="bg-white border border-[#E2E8F0] p-3 rounded-lg space-y-2.5 hover:shadow-xs transition-shadow shadow-2xs"
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1 w-full">
                          <span className="font-mono text-[9px] font-bold text-slate-450">
                            {localDate} @ {localTime}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-50 text-emerald-700 font-bold border border-emerald-100 uppercase font-mono leading-none">
                            Signed Off
                          </span>
                        </div>

                        {/* Transition Flow Initials */}
                        <div className="flex items-center gap-1 bg-white text-xs">
                          <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#E2E8F0] px-1.5 py-0.5 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-450 bg-rose-400 inline-block"></span>
                            <span className="font-bold text-slate-700 text-[10px] leading-none">{record.outgoingLead}</span>
                          </div>
                          <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                          <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#E2E8F0] px-1.5 py-0.5 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-505 bg-indigo-500 inline-block"></span>
                            <span className="font-bold text-slate-700 text-[10px] leading-none">{record.incomingLead}</span>
                          </div>
                        </div>

                        {/* Summary Log memo */}
                        <div className="bg-[#F8FAFC] rounded p-2 border border-[#E2E8F0] text-[10px] text-slate-605 text-slate-600 italic font-sans leading-relaxed">
                          &quot;{record.logText}&quot;
                        </div>

                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono leading-none">
                          <span>Verified: {record.tasksCount} Active • {record.backlogCount} Backlog</span>
                          <span className="text-slate-400 font-sans">By User: <strong>{record.signedOffBy}</strong></span>
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

      <footer className="mt-16 border-t border-[#E2E8F0] py-6 text-center text-xs text-slate-400 font-mono">
        <p>Team Handover & Task Backlog Platform • Professional Core Operations Dashboard</p>
        <p className="mt-1">Vite + React Core Runtime environment successfully validated</p>
      </footer>
    </div>
  );
}
