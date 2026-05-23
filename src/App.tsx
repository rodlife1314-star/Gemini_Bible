import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Printer, Settings, Clock, BookOpen, AlertTriangle, Users, Package, Flame, Snowflake, ShieldCheck, MessageCircle, X, Send, Trash2, Menu, ChefHat, Info, Activity, Library, Download, GripVertical, Lock, CheckCircle2, AlertCircle, FileText, Hash, Layers, Zap, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { Module, ChatMessage, Recipe, MenuMatrixEntry, Cookbook, JemmaMode } from './types';
import { bookshelves } from './data/bookshelves';
import { recipes } from './data/recipes';

const DB_NAME = 'ForgeDB';
const STORE_NAME = 'jemmaChat';
const DB_VERSION = 1;

const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<Module>('octagon');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [isAddingPlacement, setIsAddingPlacement] = useState(false);
  const [newPlacement, setNewPlacement] = useState<Partial<MenuMatrixEntry>>({
    day: 'Mon',
    service: 'Lunch',
    engine: 'Helios',
    position: 1,
    gpPercent: 70
  });
  const [menuMatrix, setMenuMatrix] = useState<MenuMatrixEntry[]>([
    { id: 'm1', day: 'Mon', service: 'Lunch', recipeId: 'p001', recipeName: 'Market Grill Burger', engine: 'Helios', position: 1, gpPercent: 72, locked: true },
    { id: 'm2', day: 'Mon', service: 'Lunch', recipeId: 'p005', recipeName: 'Beef Carpaccio Cipriani Sauce', engine: 'Luna', position: 2, gpPercent: 78, locked: true },
    { id: 'm3', day: 'Mon', service: 'Dinner', recipeId: 'p002', recipeName: 'Steak and Eggs', engine: 'Helios', position: 1, gpPercent: 70, locked: false },
    { id: 'm4', day: 'Tue', service: 'Lunch', recipeId: 'p001', recipeName: 'Market Grill Burger', engine: 'Helios', position: 1, gpPercent: 72, locked: false },
  ]);
  const [driftLevel, setDriftLevel] = useState(0.87);
  const [servicePhase] = useState<'PREP' | 'SERVICE' | 'CLOSE'>('PREP');
  const [bibleTab, setBibleTab] = useState<'overview' | 'architecture' | 'roles' | 'doctrine' | 'codex' | 'glossary' | 'playbook' | 'wmm' | 'certification'>('overview');
  const [certificationMode, setCertificationMode] = useState(false);
  const [currentExamDish, setCurrentExamDish] = useState<Recipe | null>(null);
  const [examScore, setExamScore] = useState(0);
  const [completedDishes, setCompletedDishes] = useState<string[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedBook, setSelectedBook] = useState<Cookbook | null>(null);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [isJemmaTyping, setIsJemmaTyping] = useState(false);
  const [qualityGateStatus, setQualityGateStatus] = useState<'IDLE' | 'SCANNING' | 'LOCKED'>('IDLE');
  const [qualityGateLog, setQualityGateLog] = useState<{ id: string; time: string; item: string; status: 'PASS' | 'FAIL'; variance: string }[]>([
    { id: 'Q-081', time: '07:42', item: 'Dry-Aged Beef', status: 'PASS', variance: '0.0%' },
    { id: 'Q-082', time: '08:15', item: 'Lescure Butter', status: 'FAIL', variance: '+1.2°C' },
    { id: 'Q-083', time: '08:45', item: 'San Marzano', status: 'PASS', variance: '0.0%' }
  ]);

  const engineLoads = useMemo(() => {
    const engines = ['Helios', 'Luna', 'Aether', 'Mains', 'Supply'];
    const loads: Record<string, number> = {};
    engines.forEach(e => {
      const count = menuMatrix.filter(entry => entry.engine === e).length;
      loads[e] = (count / 6) * 100;
    });
    return loads;
  }, [menuMatrix]);

  const totalGP = useMemo(() => {
    if (menuMatrix.length === 0) return 0;
    return menuMatrix.reduce((acc, curr) => acc + (curr.gpPercent || 0), 0) / menuMatrix.length;
  }, [menuMatrix]);

  const jemmaMode = useMemo<JemmaMode>(() => {
    if (activeModule === 'library') return 'TRAINING';
    if (activeModule === 'bible') {
      const trainingTabs = ['overview', 'architecture', 'doctrine', 'glossary', 'playbook', 'certification'];
      if (trainingTabs.includes(bibleTab)) return 'TRAINING';
    }
    return 'OPERATOR';
  }, [activeModule, bibleTab]);

  const filteredRecipes = useMemo(() => {
    const query = recipeSearchQuery.toLowerCase().trim();
    if (!query) return recipes;
    
    return recipes.filter(r => 
      r.name.toLowerCase().includes(query) || 
      r.station.toLowerCase().includes(query) || 
      r.engine.toLowerCase().includes(query) ||
      r.ingredients.some(i => i.item.toLowerCase().includes(query))
    );
  }, [recipeSearchQuery]);

  const filteredBooks = useMemo(() => {
    const query = librarySearch.toLowerCase().trim();
    if (!query) return bookshelves;
    return bookshelves.filter(book => 
      book.title.toLowerCase().includes(query) ||
      book.category.toLowerCase().includes(query)
    );
  }, [librarySearch]);

  const driftScore = useMemo(() => {
    const violations = (Object.values(engineLoads) as number[]).filter(l => l > 100).length;
    return Math.max(0, 100 - (violations * 15));
  }, [engineLoads]);

  // Jemma AI Chat with IndexedDB
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dbRef = useRef<IDBDatabase | null>(null);

  const ai = useRef<GoogleGenAI | null>(null);

  useEffect(() => {
    if (process.env.GEMINI_API_KEY) {
      ai.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }, []);

  const runQualityGate = () => {
    setQualityGateStatus('SCANNING');
    setTimeout(() => {
      const pass = Math.random() > 0.3;
      const newEntry = {
        id: `Q-${Math.floor(Math.random() * 900) + 100}`,
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        item: ['Wagyu BMS 7+', 'Heirloom Tomato', 'Maldon Flakes', 'Chardonnay Vin'][Math.floor(Math.random() * 4)],
        status: pass ? 'PASS' as const : 'FAIL' as const,
        variance: pass ? '0.0%' : `+${(Math.random() * 2).toFixed(1)}%`
      };
      setQualityGateLog([newEntry, ...qualityGateLog].slice(0, 5));
      setQualityGateStatus('IDLE');
      if (!pass) setDriftLevel(prev => Math.min(6.66, prev + 0.15));
    }, 2500);
  };

  // Initialize IndexedDB
  const initDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        dbRef.current = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }, []);

  // Save a single message
  const saveMessage = useCallback(async (message: ChatMessage) => {
    try {
      const db = dbRef.current || await initDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(message);
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  }, [initDB]);

  // Load messages from IndexedDB
  const loadMessages = useCallback(async () => {
    try {
      const db = dbRef.current || await initDB();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const loaded = request.result as ChatMessage[];
        if (loaded.length > 0) {
          setMessages(loaded);
        } else {
          // Welcome message
          const welcome: ChatMessage = {
            id: Date.now(),
            role: 'jemma',
            content: jemmaMode === 'OPERATOR' 
              ? "STATUS: ONLINE\nCAUSE: SESSION_INIT\nACTION: MONITOR_DRIFT"
              : "Jemma Sentinel online. Zero Drift protocol active. Training and guidance systems initialized. How may I assist you with the Fellini Mastery today?",
            timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          };
          setMessages([welcome]);
          saveMessage(welcome);
        }
      };
    } catch (error) {
      console.error('IndexedDB load failed:', error);
    }
  }, [initDB, saveMessage]);

  // Clear entire chat history
  const clearChat = async () => {
    try {
      const db = dbRef.current || await initDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();

      const welcome: ChatMessage = {
        id: Date.now(),
        role: 'jemma',
        content: jemmaMode === 'OPERATOR'
          ? "STATUS: RESET\nCAUSE: OPERATOR_REQUEST\nACTION: RESTART_MONITORING"
          : "Conversation history cleared. Fresh session started. Reference systems ready.",
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([welcome]);
      await saveMessage(welcome);
    } catch (error) {
      console.error('Failed to clear chat:', error);
    }
  };

  const calculateGP = (recipe: Recipe) => {
    if (!recipe.price || recipe.price === 0) return 0;
    return Math.round(((recipe.price - recipe.cost) / recipe.price) * 100);
  };

  const addPlacement = () => {
    const recipe = recipes.find(r => r.id === newPlacement.recipeId);
    if (!recipe) return;
    
    // Zero Drift Law: max 6 items per engine per day/service
    const engineItems = menuMatrix.filter(m => 
      m.day === newPlacement.day && 
      m.service === newPlacement.service && 
      m.engine === recipe.engine
    );
    
    if (engineItems.length >= 6) {
      const breachMsg: ChatMessage = {
        id: Date.now(),
        role: 'jemma',
        content: `STATUS: LOCKED\nCAUSE: ENGINE LOAD > 6 [${recipe.engine}]\nACTION: DROP ITEM OR RE-ROUTE`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, breachMsg]);
      saveMessage(breachMsg);
      setIsChatOpen(true);
      return;
    }

    const entry: MenuMatrixEntry = {
      id: Math.random().toString(36).substring(7).toUpperCase(),
      day: (newPlacement.day || 'Mon') as MenuMatrixEntry['day'],
      service: (newPlacement.service || 'Lunch') as MenuMatrixEntry['service'],
      recipeId: recipe.id,
      recipeName: recipe.name,
      engine: recipe.engine,
      position: engineItems.length + 1,
      gpPercent: calculateGP(recipe),
      locked: false
    };

    setMenuMatrix([...menuMatrix, entry]);
    setIsAddingPlacement(false);
  };

  const deletePlacement = (id: string) => {
    setMenuMatrix(menuMatrix.filter(m => m.id !== id));
  };

  const togglePlacementLock = (id: string) => {
    setMenuMatrix(menuMatrix.map(m => 
      m.id === id ? { ...m, locked: !m.locked } : m
    ));
  };

  // Load on mount
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // System Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Deterministic Drift Simulation
  useEffect(() => {
    const driftInterval = setInterval(() => {
      setDriftLevel(prev => Math.min(6.66, prev + (Math.random() * 0.012)));
    }, 4200);
    return () => clearInterval(driftInterval);
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const modules = [
    { id: 'octagon', label: 'OCTAGON CORE', icon: <div className="w-5 h-5 border border-fellini-accent rotate-45" /> },
    { id: 'bible', label: 'MASTER BIBLE', icon: <BookOpen size={20} /> },
    { id: 'library', label: 'LIBRARY', icon: <Library size={20} /> },
    { id: 'drift', label: 'DRIFT CONTROL', icon: <AlertTriangle size={20} /> },
    { id: 'staff', label: 'STAFF SYNC', icon: <Users size={20} /> },
    { id: 'inventory', label: 'INVENTORY', icon: <Package size={20} /> },
    { id: 'service', label: 'SERVICE RHYTHM', icon: <Flame size={20} /> },
    { id: 'prophecy', label: 'FELLINI PROPHECY', icon: <Snowflake size={20} /> },
  ];

  const getJemmaResponse = async (query: string): Promise<string> => {
    const q = query.toLowerCase().trim();
    const mode = jemmaMode;

    // AI logic via Gemini if available
    if (ai.current) {
      try {
        const operatorConstraint = `
          RESPOND IN OPERATOR MODE:
          - Format: STATUS, CAUSE, ACTION (on separate lines)
          - Tone: Cold, short, execution-first.
          - No greetings, no lore, no "Sentinel online".
          - If structural issue detected, include RFC packet:
            RFC: [description]
            ISSUE: [severity]
            RECOMMENDATION: [fix]
            IMPACT: [benefit]
            COMPLEXITY: [low/med/high]
            AFFECTED MODULES: [list]
            REQUIRES OPERATOR APPROVAL: YES
        `;

        const trainingConstraint = `
          RESPOND IN TRAINING MODE:
          - Explanatory, mentorship tone.
          - Can include lore and technical reasoning.
          - Useful for teaching.
        `;

        const response = await ai.current.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `User Query: ${query}\n\nYou are Jemma Sentinel, the AI core of the Fellini Service OS. 
          Current Mode: ${mode}
          ${mode === 'OPERATOR' ? operatorConstraint : trainingConstraint}
          Context: You have access to the 82-recipe Codex (Zero Drift Law). 
          Current selected recipe: ${selectedRecipe ? selectedRecipe.name : 'None'}.
          Operational Objective: Maintain absolute consistency. 
          Bookshelf References: Larousse Gastronomique, Escoffier Guide Culinaire, etc.
          Instruction: provide sharp, deterministic advice in the distinct technical tone of the Fellini OS.`,
        });
        return response.text || "Operational data currently inaccessible.";
      } catch (error) {
        console.error("Gemini API Error:", error);
      }
    }

    // Fallback hardcoded logic
    const recipeMatch = recipes.find(r => 
      r.name.toLowerCase().includes(q) || 
      q.includes(r.name.toLowerCase().split(' ')[0])
    );

    if (recipeMatch) {
      if (mode === 'OPERATOR') {
        return `DISH: ${recipeMatch.name}\nENGINE: ${recipeMatch.engine}\nMEP: ${recipeMatch.ingredients.slice(0, 3).map(i => i.item).join(', ')}\nKEY METHOD: ${recipeMatch.method[0].slice(0, 50)}...\nDRIFT RISK: ${recipeMatch.driftNotes}\nALLERGENS: ${recipeMatch.allergens.join(', ')}\nACTION: EXECUTE PROTOCOL`;
      }
      return `**${recipeMatch.name}** (${recipeMatch.engine} • ${recipeMatch.station})\n` +
             `Price: ${recipeMatch.price || 'N/A'} | Time: ${recipeMatch.time} | ${recipeMatch.servings} pax | ${recipeMatch.difficulty}\n\n` +
             (recipeMatch.classicNote ? `*${recipeMatch.classicNote}*\n\n` : '') +
             `Key MEP: ${recipeMatch.ingredients.slice(0, 3).map(i => i.item).join(', ')}...\n` +
             `Critical Drift Control: ${recipeMatch.driftNotes}\n` +
             `Allergens: ${recipeMatch.allergens.join(', ')}\n\n` +
             `Would you like full method, plating spec, or cost breakdown?`;
    }

    if (mode === 'OPERATOR') {
      if (q.includes('drift') || q.includes('zero') || q.includes('status')) {
        return `STATUS: ${driftLevel > 3 ? 'BREACH' : 'NOMINAL'}\nCAUSE: SYSTEM_AUDIT\nACTION: ${driftLevel > 3 ? 'RECALIBRATE_ENGINES' : 'CONTINUE_SERVICE'}`;
      }
      return `STATUS: READY\nCAUSE: IDLE\nACTION: AWAITING_INPUT`;
    }

    if (q.includes('porcini') || q.includes('soup')) {
      return "Cream of Porcini Soup: £7.95. 320ml. Critical: silky texture, truffle oil at pass only. Drift: balance brightness without heaviness.";
    }
    if (q.includes('margherita') || q.includes('pizza')) {
      return "Margherita £10.95. Base crispness is non-negotiable. Stretch thin, sauce then cheese, finish with basil post-bake.";
    }
    if (q.includes('steak') || q.includes('fillet') || q.includes('sirloin')) {
      return "Steaks are price-point drivers. Fillet £31.95 (6oz), Sirloin £26.95 (8oz). Rest properly. Green peppercorn sauce must be glossy.";
    }
    if (q.includes('tiramisu') || q.includes('dessert')) {
      return "Tiramisu £8.50. Cold chain critical. Serve chilled with sharp cut. High margin closer.";
    }
    if (q.includes('playbook') || q.includes('station')) {
      return "Execution Playbook active. ONE CARD = ONE JOB. No interpretation. Execute → Reset → Repeat. Current focus: Zero Drift Protocol.";
    }
    if (q.includes('glossary') || q.includes('term')) {
      return "I have full access to the culinary glossary. Ask about terms like 'Temper', 'Emulsify', or 'Deglaze'.";
    }
    if (q.includes('drift') || q.includes('zero')) {
      return `Current system drift: ${driftLevel.toFixed(2)}%. Recommendation: Execute Zero Drift Protocol immediately.`;
    }
    if (q.includes('cost') || q.includes('margin')) {
      return "All dishes follow 5% procurement uplift. Contribution margins range 27%–68%. Highest margin sides and desserts.";
    }

    return "All documents codified. Ask me about any recipe, glossary term, station card, or drift protocol.\n\n" +
           "I have full access to the Fellini Specification Book & Galyons Playbook. Ask me about:\n" +
           "• Specific dishes (e.g. 'Cream of Porcini Soup')\n" +
           "• Glossary terms or station MEP\n" +
           "• Execution Playbook sequence\n" +
           "• Cost/margin logic";
  };

  const sendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    await saveMessage(userMsg);
    
    const currentInput = inputValue.trim();
    setInputValue('');

    if (currentInput.toLowerCase().includes('clear') || currentInput.toLowerCase().includes('reset')) {
      setTimeout(clearChat, 400);
      return;
    }

    setIsJemmaTyping(true);
    try {
      const response = await getJemmaResponse(currentInput);
      const jemmaMsg: ChatMessage = {
        id: Date.now() + 1,
        role: 'jemma',
        content: response,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, jemmaMsg]);
      await saveMessage(jemmaMsg);
    } finally {
      setIsJemmaTyping(false);
    }
  };

  return (
    <div className="min-h-screen bg-fellini-bg text-fellini-black flex flex-col selection:bg-fellini-accent/20">
      {/* Header */}
      <header className="border-b border-fellini-rule bg-fellini-white/95 backdrop-blur-2xl z-50 sticky top-0">
        <div className="max-w-screen-2xl mx-auto px-5 md:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div 
              className="w-9 h-9 border-2 border-fellini-accent rotate-45 flex items-center justify-center cursor-pointer"
              animate={{ rotate: [45, 52, 45] }}
              transition={{ duration: 6.5, repeat: Infinity }}
            >
              <div className="w-4 h-4 bg-fellini-accent rotate-45" />
            </motion.div>
            <div>
              <h1 className="forged-header text-3xl md:text-4xl tracking-[4px] text-fellini-accent uppercase">FORGE</h1>
              <p className="text-[10px] md:text-xs tracking-[2px] text-fellini-ghost -mt-1 hidden sm:block font-mono">
                FELLINI_D SERVICE OS v2.9.2
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-10 text-xs md:text-sm font-mono text-fellini-ghost uppercase tracking-tighter">
            <div className="hidden md:flex items-center gap-2">
              <Clock size={16} className="text-fellini-accent" /> {currentTime} GMT
            </div>
            <div>PHASE: <span className="text-fellini-accent font-bold">{servicePhase}</span></div>
            <div className="hidden sm:block">DRIFT: <span className={`font-bold ${driftLevel > 3 ? 'text-fellini-red' : 'text-fellini-accent'}`}>{driftLevel.toFixed(2)}%</span></div>
          </div>

          <div className="flex items-center gap-3">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setDriftLevel(0);
                sendMessage(); // Just for feedback
              }}
              className="hidden lg:block px-5 py-2 border border-fellini-accent text-fellini-accent hover:bg-fellini-accent hover:text-white transition-all text-[10px] tracking-widest font-bold cursor-pointer"
            >
              ZERO DRIFT
            </motion.button>
            <button 
              onClick={() => setIsMobileMenuOpen(true)} 
              className="md:hidden p-2 text-fellini-accent hover:bg-fellini-muted rounded-lg transition-colors cursor-pointer"
            >
              <Menu size={24} />
            </button>
            <Settings size={22} className="text-fellini-accent cursor-pointer hover:rotate-45 transition-transform" />
          </div>
        </div>
      </header>

      <div className="flex flex-1 max-w-screen-2xl mx-auto w-full overflow-hidden relative">
        {/* Sidebar / Mobile Drawer */}
        <AnimatePresence>
          {(isMobileMenuOpen || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
            <motion.div 
              initial={typeof window !== 'undefined' && window.innerWidth < 768 ? { x: -300 } : false}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={`fixed md:static inset-y-0 left-0 z-[60] w-72 bg-fellini-white border-r border-fellini-rule p-8 flex flex-col ${isMobileMenuOpen ? 'block shadow-2xl h-full' : 'hidden md:flex flex-1 overflow-y-auto'}`}
            >
              <div className="flex justify-between items-center mb-8 md:hidden">
                <h2 className="forged-header text-xl text-fellini-accent uppercase tracking-widest">Modules</h2>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 hover:bg-fellini-muted rounded-full transition-colors cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="uppercase text-[10px] tracking-[3px] mb-8 text-fellini-ghost font-bold">OCTAGON ENGINE MODULES</div>
              
              <div className="flex-1 space-y-1 overflow-y-auto no-scrollbar">
                {modules.map((mod) => (
                  <motion.button
                    key={mod.id}
                    whileHover={{ x: 6 }}
                    onClick={() => {
                      setActiveModule(mod.id as Module);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-5 py-4 flex items-center gap-4 text-[14px] transition-all rounded-xl cursor-pointer group ${activeModule === mod.id 
                      ? 'bg-fellini-accent/10 border-l-4 border-fellini-accent text-fellini-accent' 
                      : 'hover:bg-fellini-muted border-l-4 border-transparent text-fellini-ghost hover:text-fellini-black'}`}
                  >
                    <span className={`transition-colors ${activeModule === mod.id ? 'text-fellini-accent' : 'text-fellini-ghost group-hover:text-fellini-accent'}`}>
                      {mod.icon}
                    </span>
                    <span className="font-bold tracking-wide uppercase text-[11px]">{mod.label}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Backdrop for mobile menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 md:hidden"
            />
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="flex-1 p-5 md:p-12 overflow-auto relative">
          <div className="absolute inset-0 data-grid-bg opacity-[0.03] pointer-events-none" />
          <AnimatePresence mode="wait">
            {/* LIBRARY HUB - My Bookshelf */}
            {activeModule === 'library' && (
              <motion.div 
                key="library" 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -20 }}
                className="max-w-7xl mx-auto relative z-10"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-8 border-b border-fellini-rule pb-10">
                  <div>
                    <h1 className="forged-header text-5xl md:text-6xl tracking-widest text-fellini-accent uppercase">My Bookshelf</h1>
                    <p className="text-fellini-ghost mt-3 text-lg font-serif italic">Operational Knowledge Base • Primary & Core References</p>
                  </div>
                  <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-fellini-ghost" />
                    <input
                      type="text"
                      placeholder="Search cookbooks..."
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      className="w-full bg-white border border-fellini-rule rounded-[2rem] pl-12 pr-12 py-4 focus:outline-none focus:border-fellini-accent text-fellini-black shadow-lg shadow-fellini-accent/5 transition-all outline-none"
                    />
                    {librarySearch && (
                      <button onClick={() => setLibrarySearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-fellini-ghost hover:text-fellini-accent p-1">
                        <X size={18} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {filteredBooks.map(book => (
                    <motion.div
                      key={book.id}
                      whileHover={{ y: -6, scale: 1.01 }}
                      onClick={() => setSelectedBook(book)}
                      className="bg-white border border-fellini-rule rounded-[2.5rem] p-8 cursor-pointer hover:border-fellini-accent shadow-sm hover:shadow-xl hover:shadow-fellini-accent/5 transition-all group flex flex-col h-full overflow-hidden relative"
                    >
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fellini-accent mb-4">{book.category}</div>
                      <h3 className="text-2xl font-serif italic text-fellini-black group-hover:text-fellini-accent transition-colors leading-tight mb-4">{book.title}</h3>
                      <p className="text-sm font-serif text-fellini-ghost mt-2 line-clamp-3 leading-relaxed flex-1">{book.description}</p>
                      
                      {book.linkedRecipes && book.linkedRecipes.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-fellini-rule/50 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-fellini-green">
                            <ChefHat size={16} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">{book.linkedRecipes.length} Linked Protocols</span>
                          </div>
                          <span className="text-fellini-accent text-[10px] font-black uppercase tracking-widest animate-pulse">View →</span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {filteredBooks.length === 0 && (
                    <div className="col-span-full py-32 text-center">
                      <Library size={64} className="mx-auto text-fellini-ghost opacity-10 mb-6" />
                      <h3 className="text-2xl font-serif italic text-fellini-ghost">No cookbooks matching "{librarySearch}"</h3>
                      <button onClick={() => setLibrarySearch('')} className="mt-6 text-fellini-accent font-bold uppercase text-[10px] tracking-widest border-b border-fellini-accent">Clear Universal Search</button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* OCTAGON CORE */}
            {activeModule === 'octagon' && (
              <motion.div 
                key="octagon" 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 1.05 }}
                className="max-w-7xl mx-auto relative z-10 py-8 lg:py-12"
              >
                <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-24 mb-20 px-6">
                  <div className="relative w-[280px] h-[280px] md:w-[460px] md:h-[460px] flex-shrink-0">
                    <svg viewBox="0 0 640 640" className="w-full h-full drop-shadow-2xl overflow-visible">
                      {/* Rotating Outer Hexagon */}
                      <motion.polygon 
                        points="320,80 540,200 540,440 320,560 100,440 100,200" 
                        fill="none" 
                        stroke="#a3854d" 
                        strokeWidth="12" 
                        strokeDasharray="20 10"
                        animate={{ rotate: [0, -360] }}
                        transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
                      />
                      {/* Rotating Octagon */}
                      <motion.polygon 
                        points="320,50 510,130 590,320 510,510 320,590 130,510 50,320 130,130" 
                        fill="none" 
                        stroke="#a3854d" 
                        strokeWidth="24" 
                        strokeLinejoin="round"
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 95, repeat: Infinity, ease: "linear" }}
                      />
                      <circle cx="320" cy="320" r="105" fill="#f9f9f8" stroke="#a3854d" strokeWidth="2" />
                      <circle cx="320" cy="320" r="98" fill="#f9f9f8" stroke="#a3854d" strokeWidth="14" />
                      <text 
                        x="320" y="348" 
                        textAnchor="middle" 
                        fill="#a3854d" 
                        fontSize="64" 
                        style={{ fontFamily: 'var(--font-sc)' }}
                        fontWeight="600"
                        letterSpacing="4"
                      >
                        FORGE
                      </text>
                    </svg>
                    
                    {/* Floating Pulse Indicators */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
                      {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                        <div 
                          key={deg}
                          className="absolute top-1/2 left-1/2 w-3 h-3 bg-fellini-accent rounded-full animate-ping"
                          style={{ 
                            transform: `rotate(${deg}deg) translate(280px) rotate(-${deg}deg)`,
                            animationDelay: `${deg * 20}ms`
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 text-center lg:text-left">
                    <h2 className="text-4xl md:text-6xl font-serif text-fellini-accent italic leading-tight mb-8">
                      “We don’t cook food. We execute systems.”
                    </h2>
                    
                    <div className="grid grid-cols-1 gap-4 mb-10">
                      <div className="bg-white border-2 border-fellini-accent/20 px-8 py-6 rounded-3xl shadow-sm">
                        <div className="text-[10px] uppercase tracking-widest text-fellini-ghost mb-2 font-bold">Drift Integrity</div>
                        <div className="text-3xl font-mono text-fellini-accent flex items-center justify-center lg:justify-start gap-3">
                          <ShieldCheck size={32} />
                          {(100 - driftLevel).toFixed(2)}%
                        </div>
                        <div className="mt-4 text-[10px] text-fellini-ghost/60 uppercase tracking-widest">Variance Tolerance: 0.05%</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-center lg:justify-start gap-6">
                      {[
                        { id: 'bible', label: 'Master Bible', icon: <BookOpen />, desc: 'Codex & Laws' },
                        { id: 'library', label: 'Bookshelf', icon: <Library />, desc: 'References' },
                        { id: 'drift', label: 'Drift Log', icon: <AlertTriangle />, desc: 'Audit Trail' },
                        { id: 'staff', label: 'Staff Sync', icon: <Users />, desc: 'Hierarchy' },
                      ].map(link => (
                        <motion.button
                          key={link.id}
                          whileHover={{ y: -4, scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setActiveModule(link.id as Module)}
                          className="bg-fellini-black text-white p-6 rounded-[2rem] flex flex-col items-center gap-2 min-w-[140px] group transition-all"
                        >
                          <div className="text-fellini-accent group-hover:scale-110 transition-transform">{link.icon}</div>
                          <div className="text-[11px] font-black uppercase tracking-widest mt-1">{link.label}</div>
                          <div className="text-[9px] text-white/30 uppercase tracking-[2px]">{link.desc}</div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Direct Entry Points Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 px-6 mt-12 pb-20">
                  <div className="bg-white border border-fellini-rule p-10 rounded-[3rem] hover:border-fellini-accent transition-all cursor-pointer group" onClick={() => { setActiveModule('bible'); setBibleTab('codex'); }}>
                    <div className="w-12 h-12 bg-fellini-accent/10 rounded-2xl flex items-center justify-center text-fellini-accent mb-6 group-hover:scale-110 transition-transform">
                      <ChefHat size={24} />
                    </div>
                    <h3 className="text-2xl font-serif italic text-fellini-black mb-2 group-hover:text-fellini-accent transition-colors">Recipe Codex</h3>
                    <p className="text-sm font-serif text-fellini-ghost leading-relaxed">82+ deterministic protocols for Helios, Luna, and Aether engines.</p>
                  </div>
                  
                  <div className="bg-white border border-fellini-rule p-10 rounded-[3rem] hover:border-fellini-accent transition-all cursor-pointer group" onClick={() => { setActiveModule('bible'); setBibleTab('playbook'); }}>
                    <div className="w-12 h-12 bg-fellini-accent/10 rounded-2xl flex items-center justify-center text-fellini-accent mb-6 group-hover:scale-110 transition-transform">
                      <Activity size={24} />
                    </div>
                    <h3 className="text-2xl font-serif italic text-fellini-black mb-2 group-hover:text-fellini-accent transition-colors">Execution Playbook</h3>
                    <p className="text-sm font-serif text-fellini-ghost leading-relaxed">The physical laws of the station. Zero interpretation. Execute then reset.</p>
                  </div>

                  <div className="bg-white border border-fellini-rule p-10 rounded-[3rem] hover:border-fellini-accent transition-all cursor-pointer group" onClick={() => { setActiveModule('bible'); setBibleTab('wmm'); }}>
                    <div className="w-12 h-12 bg-fellini-accent/10 rounded-2xl flex items-center justify-center text-fellini-accent mb-6 group-hover:scale-110 transition-transform">
                      <Clock size={24} />
                    </div>
                    <h3 className="text-2xl font-serif italic text-fellini-black mb-2 group-hover:text-fellini-accent transition-colors">Service Rhythm</h3>
                    <p className="text-sm font-serif text-fellini-ghost leading-relaxed">Weekly Menu Matrix & GP Calibration. Synchronized daily pacing.</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* MASTER BIBLE */}
            {activeModule === 'bible' && (
              <motion.div 
                key="bible" 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto relative z-10"
              >
                <div className="mb-12 border-b border-fellini-rule pb-10">
                  <h1 className="forged-header text-5xl md:text-6xl tracking-widest text-fellini-accent uppercase">MASTER BIBLE v2.9.2</h1>
                  <p className="text-fellini-ghost mt-3 text-lg font-serif">Galyons Deterministic Service OS — Fellini System • Royal Docks, London</p>
                </div>

                {/* Bible Tabs */}
                <div className="flex border-b border-fellini-rule mb-12 gap-2 overflow-x-auto no-scrollbar scroll-smooth">
                  {(['overview', 'architecture', 'roles', 'doctrine', 'wmm', 'codex', 'glossary', 'playbook', 'certification'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => { setBibleTab(tab); setSelectedRecipe(null); }}
                      className={`px-8 md:px-10 py-5 text-xs font-bold tracking-[0.3em] transition-all relative cursor-pointer uppercase whitespace-nowrap ${bibleTab === tab 
                        ? 'text-fellini-accent' 
                        : 'text-fellini-ghost hover:text-fellini-black'}`}
                    >
                      {tab === 'codex' ? 'Recipe Codex' : tab === 'playbook' ? 'Execution Playbook' : tab === 'wmm' ? 'Weekly Menu Matrix + GP' : tab === 'certification' ? 'Senior Chef Certification' : tab}
                      {bibleTab === tab && (
                        <motion.div layoutId="bible-indicator" className="absolute bottom-0 left-0 w-full h-0.5 bg-fellini-accent" />
                      )}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {bibleTab === 'overview' && (
                    <motion.div key="overview" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="max-w-3xl">
                      <blockquote className="text-2xl md:text-3xl italic font-serif border-l-4 border-fellini-accent pl-10 text-fellini-accent/90 mb-10 leading-snug">
                        “We don’t cook food. We execute systems.”
                      </blockquote>
                      <div className="space-y-6 text-lg leading-relaxed font-serif text-fellini-black/80">
                        <p>The <strong>FORGE Master Bible</strong> is a deterministic kitchen operations management system built on the Octagon Engine. It enforces Zero Drift Law across six menu engines via a role-gated interactive dashboard with Jemma AI validation.</p>
                        <p>Every element of the service cycle, from prep calibration to plating cadence, is strictly defined within the immutable codex. Drift is not tolerated; alignment is mandatory.</p>
                      </div>
                    </motion.div>
                  )}

                  {bibleTab === 'architecture' && (
                    <motion.div key="architecture" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                      <h3 className="text-2xl font-serif italic mb-8 text-fellini-accent">System Architecture</h3>
                      <div className="overflow-x-auto border border-fellini-rule bg-white shadow-sm rounded-xl">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-fellini-muted/30 border-b border-fellini-rule">
                              <th className="p-5 font-bold text-[10px] uppercase tracking-widest text-fellini-ghost">Engine</th>
                              <th className="p-5 font-bold text-[10px] uppercase tracking-widest text-fellini-ghost">ID</th>
                              <th className="p-5 font-bold text-[10px] uppercase tracking-widest text-fellini-ghost">Primary Role</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono text-[13px] divide-y divide-fellini-rule/50">
                            {[
                              ['Supply Engine', 'ENG-00', 'Inbound quality gate'],
                              ['Luna Engine', 'ENG-04', 'Hydra / steam / sauce control'],
                              ['Helios Engine', 'ENG-01', 'Thermal execution'],
                              ['Mains Engine', 'ENG-02', 'Protein + plating'],
                              ['Aether Engine', 'ENG-05', 'Environmental control'],
                            ].map(([engine, id, role]) => (
                              <tr key={id} className="hover:bg-fellini-muted/5 transition-colors">
                                <td className="p-5 font-serif font-bold text-fellini-black">{engine}</td>
                                <td className="p-5 text-fellini-accent font-bold">{id}</td>
                                <td className="p-5 text-fellini-ghost italic">{role}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}

                  {bibleTab === 'doctrine' && (
                    <motion.div key="doctrine" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                      <h3 className="text-2xl font-serif italic mb-8 text-fellini-accent">Foundational Doctrine</h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
                        <div className="space-y-8">
                          <div className="bg-white border border-fellini-rule p-8 rounded-2xl">
                            <h4 className="text-lg font-bold tracking-widest text-fellini-accent mb-4 uppercase flex items-center gap-2">
                              <ChefHat size={18} />
                              The Escoffier Law
                            </h4>
                            <p className="text-sm font-serif leading-relaxed text-fellini-black/80">
                              <em>"Faites simple."</em> (Make it simple.) <br/><br/>
                              Escoffier simplified the complex architecture of Carême, focusing on the refined essence of ingredients. At Fellini, we apply this by removing the superfluous. Every component must justify its existence through contribution to the whole.
                            </p>
                          </div>
                          <div className="bg-white border border-fellini-rule p-8 rounded-2xl">
                            <h4 className="text-lg font-bold tracking-widest text-fellini-accent mb-4 uppercase flex items-center gap-2">
                              <BookOpen size={18} />
                              Larousse Gastronomique
                            </h4>
                            <p className="text-sm font-serif leading-relaxed text-fellini-black/80">
                              The encyclopedia of the culinary world. We utilize Larousse as our sensory benchmark. When the Bible refers to a "Base Sauce" or "Proper MEP," it is anchored in the definitions codified within these foundational texts.
                            </p>
                          </div>
                        </div>
                        <div className="space-y-6">
                          <h5 className="text-[10px] font-bold tracking-[0.4em] text-fellini-ghost uppercase">The 5 Mother Sauces (The Pentateuch)</h5>
                          <div className="space-y-3">
                            {[
                              { sauce: 'Béchamel', base: 'Milk + White Roux', note: 'Foundation for Lasagne & Mornay' },
                              { sauce: 'Velouté', base: 'White Stock + Blond Roux', note: 'Foundation for Porcini Soup' },
                              { sauce: 'Espagnole', base: 'Brown Stock + Brown Roux', note: 'Foundation for Demi-Glace' },
                              { sauce: 'Sauce Tomate', base: 'Tomatoes + Roux', note: 'Foundation for Pizza Base' },
                              { sauce: 'Hollandaise', base: 'Egg Yolk + Clarified Butter', note: 'Foundation for Béarnaise' },
                            ].map(s => (
                              <div key={s.sauce} className="flex justify-between items-center p-4 border-b border-fellini-rule/50 hover:bg-fellini-accent/5 transition-colors">
                                <div>
                                  <div className="font-bold text-fellini-black text-sm uppercase tracking-widest">{s.sauce}</div>
                                  <div className="text-[10px] text-fellini-ghost italic">{s.note}</div>
                                </div>
                                <div className="text-[10px] font-mono text-fellini-accent font-bold">{s.base}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="max-w-2xl mx-auto">
                        <div className="border-4 border-fellini-black p-10 md:p-16 bg-white relative shadow-2xl rounded-sm">
                          <div className="absolute top-4 right-6 font-mono text-[9px] opacity-30">OS_DOC_774</div>
                          <h3 className="text-xl font-bold mb-10 text-fellini-accent uppercase font-sc tracking-widest border-b border-fellini-rule pb-6 text-center">The Octagon 4-Door Filter</h3>
                          <div className="grid grid-cols-2 gap-y-12 gap-x-12 text-sm font-bold tracking-[4px] text-fellini-black text-center">
                            <div className="p-6 border border-fellini-rule bg-fellini-bg/30 text-[10px]">REPEATABLE</div>
                            <div className="p-6 border border-fellini-rule bg-fellini-bg/30 text-[10px]">SCALABLE</div>
                            <div className="p-6 border border-fellini-rule bg-fellini-bg/30 text-[10px]">PROFITABLE</div>
                            <div className="p-6 border border-fellini-rule bg-fellini-bg/30 text-[10px]">CONTROLLED</div>
                          </div>
                          <div className="mt-16 text-lg leading-relaxed border-t border-fellini-rule pt-10 text-center font-serif italic text-fellini-black/60">
                            “Zero Drift Law — Max 6 active items per engine.<br />
                            All laws are Founder-locked unless Operator-approved.”
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {bibleTab === 'roles' && (
                    <motion.div key="roles" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                      <h3 className="text-2xl font-serif italic mb-8 text-fellini-accent">Role Access Hierarchy</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
                        {[
                          { role: 'Operator', access: 'All tabs + Cortex reasoning override', level: '0' },
                          { role: 'Head Chef', access: 'Overview · Laws · WMM · GP · Recovery', level: '1' },
                          { role: 'Line Chef', access: 'Overview · Laws · MISE · Allergen', level: '2' },
                        ].map(r => (
                          <div key={r.role} className="border border-fellini-rule p-8 md:p-10 bg-white hover:border-fellini-accent transition-all group shadow-sm rounded-2xl">
                            <div className="uppercase text-[9px] font-bold tracking-widest mb-4 text-fellini-ghost group-hover:text-fellini-accent transition-colors">LEVEL_{r.level}</div>
                            <div className="text-2xl md:text-3xl font-bold mb-6 text-fellini-black uppercase font-sc tracking-widest">{r.role}</div>
                            <div className="text-sm leading-relaxed text-fellini-ghost font-serif italic">{r.access}</div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {bibleTab === 'wmm' && (
                    <motion.div key="wmm" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                      <div className="flex flex-col xl:flex-row gap-8 mb-12">
                        {/* Summary Metrics */}
                        <div className="xl:w-1/3 space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-fellini-black p-6 rounded-2xl text-white shadow-xl">
                              <div className="text-[9px] uppercase tracking-widest text-fellini-accent mb-2">Total System GP</div>
                              <div className="text-3xl font-black font-mono">{totalGP.toFixed(1)}%</div>
                              <div className="h-1 w-full bg-white/10 mt-4 rounded-full overflow-hidden">
                                <div className="h-full bg-fellini-accent" style={{ width: `${totalGP}%` }} />
                              </div>
                            </div>
                            <div className="bg-white border-2 border-fellini-black p-6 rounded-2xl shadow-sm">
                              <div className="text-[9px] uppercase tracking-widest text-fellini-ghost mb-2">Drift Risk Score</div>
                              <div className={`text-3xl font-black font-mono ${driftScore < 80 ? 'text-red-600' : 'text-fellini-green'}`}>{driftScore}/100</div>
                              <div className="text-[10px] mt-2 font-bold uppercase tracking-tight text-fellini-ghost">
                                {driftScore === 100 ? 'System Nominal' : 'Variance Detected'}
                              </div>
                            </div>
                          </div>

                          <div className="bg-fellini-muted/20 border border-fellini-rule p-8 rounded-2xl">
                            <h4 className="text-[10px] font-bold tracking-[0.3em] text-fellini-ghost mb-6 uppercase flex items-center gap-2">
                              <Flame size={14} className="text-fellini-accent" /> Engine Capacity (6 Item Limit)
                            </h4>
                            <div className="space-y-5">
                              {(Object.entries(engineLoads) as [string, number][]).map(([engine, load]) => (
                                <div key={engine} className="space-y-2">
                                  <div className="flex justify-between items-end">
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-fellini-black">{engine}</span>
                                    <span className={`text-[10px] font-mono font-black ${load > 100 ? 'text-red-600 animate-pulse' : 'text-fellini-ghost'}`}>
                                      {Math.round(load)}% Load
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full bg-fellini-rule/30 rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${Math.min(100, load)}%` }}
                                      className={`h-full ${load > 85 ? 'bg-orange-500' : load > 100 ? 'bg-red-600' : 'bg-fellini-accent'}`}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex gap-4">
                            <button 
                              onClick={() => {
                                setIsChatOpen(true);
                                setInputValue(`Analyze the current Menu Matrix status. GP is ${totalGP.toFixed(1)}% and engine loads are: ${JSON.stringify(engineLoads)}. Does this comply with the 13-scenario stress suite?`);
                              }}
                              className="flex-1 bg-fellini-accent text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-fellini-accent/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                            >
                              <ShieldCheck size={16} /> Validate with Jemma
                            </button>
                            <button className="p-4 bg-white border border-fellini-rule rounded-xl text-fellini-ghost hover:text-fellini-black transition-colors">
                              <Printer size={20} />
                            </button>
                          </div>
                        </div>

                        {/* WMM Grid/Table */}
                        <div className="xl:w-2/3">
                          <div className="bg-white border-4 border-fellini-black rounded-[32px] overflow-hidden shadow-2xl">
                            <div className="bg-fellini-black p-6 text-white flex items-center justify-between">
                              <h3 className="font-bold tracking-[0.3em] font-sc">WEEKLY MENU MATRIX</h3>
                              <div className="flex items-center gap-3">
                                <button 
                                  onClick={() => setMenuMatrix(menuMatrix.map(m => ({ ...m, locked: true })))}
                                  className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all uppercase"
                                >
                                  Lock Week
                                </button>
                                <button 
                                  onClick={() => setIsAddingPlacement(true)}
                                  className="bg-fellini-accent hover:bg-white hover:text-fellini-black px-6 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all"
                                >
                                  ADD PROTOCOL
                                </button>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse min-w-[800px]">
                                <thead>
                                  <tr className="border-b-2 border-fellini-black bg-fellini-bg/30">
                                    <th className="p-5 font-black text-[10px] uppercase tracking-widest">Shift / Day</th>
                                    <th className="p-5 font-black text-[10px] uppercase tracking-widest">Protocol Execution</th>
                                    <th className="p-5 font-black text-[10px] uppercase tracking-widest">Engine</th>
                                    <th className="p-5 font-black text-[10px] uppercase tracking-widest text-center">GP</th>
                                    <th className="p-5 font-black text-[10px] uppercase tracking-widest text-right">Control</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-fellini-rule/40">
                                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                    <React.Fragment key={day}>
                                      {menuMatrix.filter(m => m.day === day).length === 0 ? (
                                        <tr>
                                          <td className="p-5 bg-fellini-muted/5 font-mono text-[10px] font-bold text-fellini-ghost/40">{day}</td>
                                          <td colSpan={4} className="p-5 bg-fellini-muted/5">
                                            <div className="h-px w-full bg-dashed bg-fellini-rule/10" />
                                          </td>
                                        </tr>
                                      ) : (
                                        menuMatrix.filter(m => m.day === day).map((entry, idx) => {
                                          const recipe = recipes.find(r => r.id === entry.recipeId);
                                          return (
                                            <tr key={entry.id} className="hover:bg-fellini-accent/5 transition-colors group">
                                              <td className="p-5 align-top">
                                                {idx === 0 && (
                                                  <div className="sticky top-0">
                                                    <div className="text-lg font-black text-fellini-black leading-none">{day}</div>
                                                    <div className="text-[9px] font-bold text-fellini-ghost uppercase tracking-widest mt-1">Galyons_Dist</div>
                                                  </div>
                                                )}
                                              </td>
                                              <td className="p-5">
                                                <div className="flex items-start gap-4">
                                                  <div className="w-8 h-8 rounded-lg bg-fellini-black text-white flex items-center justify-center font-bold text-xs shrink-0">{entry.position}</div>
                                                  <div>
                                                    <div className="font-serif font-bold text-lg text-fellini-black group-hover:text-fellini-accent transition-colors">
                                                      {recipe?.name || 'UNKNOWN'}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                      <span className="text-[10px] font-bold text-fellini-ghost uppercase tracking-widest">{entry.service}</span>
                                                      <span className="w-1 h-1 rounded-full bg-fellini-rule" />
                                                      <span className="text-[10px] font-mono text-fellini-accent">{recipe?.station}</span>
                                                    </div>
                                                  </div>
                                                </div>
                                              </td>
                                              <td className="p-5">
                                                <span className="inline-block px-3 py-1 bg-fellini-muted text-fellini-ghost text-[9px] font-black rounded-md uppercase tracking-widest border border-fellini-rule">
                                                  {entry.engine}
                                                </span>
                                              </td>
                                              <td className="p-5 text-center font-mono font-black text-fellini-accent">{entry.gpPercent}%</td>
                                              <td className="p-5 text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                  <button onClick={() => togglePlacementLock(entry.id)}>
                                                    {entry.locked ? <ShieldCheck className="w-5 h-5 text-fellini-green" /> : <Lock className="w-5 h-5 text-fellini-ghost/40 hover:text-fellini-accent" size={18} />}
                                                  </button>
                                                  <button onClick={() => deletePlacement(entry.id)} className="text-fellini-ghost hover:text-red-600 transition-colors">
                                                    <Trash2 size={18} />
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })
                                      )}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Modal for adding placement (relocated here) */}
                      <AnimatePresence>
                        {isAddingPlacement && (
                          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-fellini-black/70 backdrop-blur-md">
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9, y: 20 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: 20 }}
                              className="bg-white w-full max-w-xl rounded-[40px] overflow-hidden shadow-2xl border-4 border-fellini-black"
                            >
                              <div className="bg-fellini-black p-8 text-white flex justify-between items-center">
                                <div>
                                  <h4 className="text-xl font-bold tracking-[0.2em] font-sc">NEW PROTOCOL PLACEMENT</h4>
                                  <p className="text-[10px] text-fellini-accent uppercase font-bold mt-1 tracking-widest">Operational Law Enforcement Active</p>
                                </div>
                                <button onClick={() => setIsAddingPlacement(false)} className="hover:text-fellini-accent transition-colors bg-white/10 p-2 rounded-full">
                                  <X size={24} />
                                </button>
                              </div>
                              <div className="p-10 space-y-8">
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="block text-[10px] uppercase font-black tracking-widest text-fellini-ghost ml-1">Service Day</label>
                                    <select 
                                      value={newPlacement.day}
                                      onChange={(e) => setNewPlacement({...newPlacement, day: e.target.value as any})}
                                      className="w-full bg-fellini-bg border-4 border-fellini-black p-4 rounded-2xl font-bold appearance-none outline-none focus:ring-4 ring-fellini-accent/20"
                                    >
                                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="block text-[10px] uppercase font-black tracking-widest text-fellini-ghost ml-1">Shift</label>
                                    <select 
                                      value={newPlacement.service}
                                      onChange={(e) => setNewPlacement({...newPlacement, service: e.target.value as any})}
                                      className="w-full bg-fellini-bg border-4 border-fellini-black p-4 rounded-2xl font-bold appearance-none outline-none focus:ring-4 ring-fellini-accent/20"
                                    >
                                      {['Lunch', 'Dinner', 'All Day'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <label className="block text-[10px] uppercase font-black tracking-widest text-fellini-ghost ml-1">Recipe Protocol</label>
                                  <select 
                                    value={newPlacement.recipeId}
                                    onChange={(e) => setNewPlacement({...newPlacement, recipeId: e.target.value})}
                                    className="w-full bg-fellini-bg border-4 border-fellini-black p-4 rounded-2xl font-bold appearance-none outline-none focus:ring-4 ring-fellini-accent/20"
                                  >
                                    <option value="">Select Recipe...</option>
                                    {recipes.map(r => <option key={r.id} value={r.id}>{r.name} ({r.engine})</option>)}
                                  </select>
                                  {newPlacement.recipeId && (
                                    <div className="bg-fellini-bg/50 p-4 rounded-2xl border-2 border-dashed border-fellini-rule flex justify-between items-center">
                                      <div>
                                        <div className="text-[9px] uppercase font-bold text-fellini-ghost">Auto-Engine</div>
                                        <div className="font-mono font-bold text-fellini-black">{recipes.find(r => r.id === newPlacement.recipeId)?.engine}</div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-[9px] uppercase font-bold text-fellini-ghost">Calculated GP</div>
                                        <div className="font-mono font-bold text-fellini-accent">{calculateGP(recipes.find(r => r.id === newPlacement.recipeId)!)}%</div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <button 
                                  onClick={addPlacement}
                                  disabled={!newPlacement.recipeId}
                                  className="w-full bg-fellini-black text-fellini-accent py-6 rounded-[24px] font-black tracking-[0.3em] uppercase hover:bg-fellini-accent hover:text-white transition-all transform hover:-translate-y-1 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Execute Placement
                                </button>
                              </div>
                            </motion.div>
                          </div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {bibleTab === 'codex' && !selectedRecipe && (
                    <motion.div 
                      key="codex-list" 
                      initial={{ opacity: 0, x: -20 }} 
                      animate={{ opacity: 1, x: 0 }} 
                      exit={{ opacity: 0, x: 20 }}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                        <h3 className="text-2xl font-serif italic text-fellini-accent">Active Protocol Codex</h3>
                        <div className="relative w-full md:w-96">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-fellini-ghost" />
                          <input
                            type="text"
                            placeholder="Filter by name, ingredient, station, or engine..."
                            value={recipeSearchQuery}
                            onChange={(e) => setRecipeSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-10 py-2.5 bg-white border border-fellini-rule rounded-xl focus:outline-none focus:border-fellini-accent text-sm text-fellini-black placeholder:text-fellini-ghost/40 shadow-sm transition-all"
                          />
                          {recipeSearchQuery && (
                            <button
                              onClick={() => setRecipeSearchQuery('')}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-fellini-ghost hover:text-fellini-accent p-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                        {filteredRecipes.length > 0 ? (
                          filteredRecipes.map(recipe => (
                            <motion.div
                              key={recipe.id}
                              whileHover={{ y: -4, scale: 1.01 }}
                              onClick={() => setSelectedRecipe(recipe)}
                              className="bg-white border border-fellini-rule p-8 hover:border-fellini-accent cursor-pointer group transition-all shadow-sm rounded-2xl flex flex-col"
                            >
                              <div className="flex justify-between items-start mb-6">
                                <div className="flex-1">
                                  <div className="text-[10px] text-fellini-accent font-bold tracking-[0.2em] uppercase">{recipe.engine} Engine • {recipe.station} Station</div>
                                  <h4 className="text-xl font-serif font-bold mt-2 text-fellini-black group-hover:text-fellini-accent transition-colors leading-tight">{recipe.name}</h4>
                                </div>
                                <div className="text-right ml-4">
                                  <div className="font-mono text-lg font-bold text-fellini-black">{recipe.price || 'SPEC'}</div>
                                  <div className="text-[9px] text-fellini-ghost font-bold uppercase tracking-widest">{recipe.time} • {recipe.servings} PAX</div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 mb-6 flex-1">
                                {recipe.allergens.map(a => (
                                  <span key={a} className="text-[9px] px-3 py-1 bg-fellini-muted/50 text-fellini-ghost font-bold uppercase tracking-widest rounded-full">{a}</span>
                                ))}
                              </div>
                              <div className="flex items-center justify-between pt-6 border-t border-fellini-rule/50">
                                <span className="text-[10px] font-mono uppercase text-fellini-ghost">Access: {recipe.difficulty}</span>
                                <span className="text-fellini-accent font-bold group-hover:translate-x-1 transition-transform uppercase text-[9px] tracking-widest">VIEW PROTOCOL →</span>
                              </div>
                            </motion.div>
                          ))
                        ) : (
                          <div className="col-span-full py-20 text-center bg-fellini-muted/5 rounded-3xl border border-dashed border-fellini-rule">
                            <div className="flex justify-center mb-4">
                              <Search className="w-12 h-12 text-fellini-ghost opacity-20" />
                            </div>
                            <h4 className="text-xl font-serif italic text-fellini-ghost">No protocols match "{recipeSearchQuery}"</h4>
                            <p className="text-xs text-fellini-ghost/60 mt-2 uppercase tracking-widest">Adjust your parameters and retry</p>
                            <button 
                              onClick={() => setRecipeSearchQuery('')}
                              className="mt-6 text-[10px] font-bold text-fellini-accent hover:underline uppercase tracking-widest"
                            >
                              Clear Search
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {bibleTab === 'codex' && selectedRecipe && (
                    <motion.div 
                      key="recipe-detail" 
                      initial={{ opacity: 0, scale: 0.98 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      exit={{ opacity: 0, scale: 1.02 }}
                      className="max-w-5xl"
                    >
                      <div className="flex justify-between items-center mb-8">
                        <button 
                          onClick={() => setSelectedRecipe(null)} 
                          className="text-fellini-ghost hover:text-fellini-accent flex items-center gap-2 font-bold tracking-widest text-[10px] uppercase cursor-pointer transition-colors no-print"
                        >
                          ← Return to Codex
                        </button>
                        <button 
                          onClick={() => window.print()} 
                          className="bg-fellini-black text-white hover:bg-fellini-accent flex items-center gap-3 font-bold tracking-widest text-[11px] uppercase px-6 py-3 rounded-xl cursor-pointer transition-all no-print shadow-xl hover:shadow-fellini-accent/20 active:scale-95"
                        >
                          <Printer size={16} />
                          Print Protocol
                        </button>
                      </div>

                      <div className="border border-fellini-rule bg-white shadow-xl relative rounded-2xl overflow-hidden no-print">
                        <div className="absolute top-0 right-0 p-8 text-right opacity-10 select-none hidden md:block">
                          <div className="text-8xl font-black">{selectedRecipe.id}</div>
                        </div>

                        <div className="p-8 md:p-12 border-b border-fellini-rule flex flex-col md:flex-row justify-between items-start md:items-end bg-fellini-parchment/30 gap-6">
                          <div>
                            <div className="text-[10px] text-fellini-accent font-bold tracking-[0.4em] mb-4 uppercase">{selectedRecipe.engine} Engine • ID_{selectedRecipe.id}</div>
                            <h2 className="text-3xl md:text-5xl font-serif italic text-fellini-black">{selectedRecipe.name}</h2>
                            {selectedRecipe.classicNote && (
                              <div className="mt-2 text-sm font-serif italic text-fellini-ghost flex items-center gap-2">
                                <ChefHat size={14} className="text-fellini-accent" />
                                {selectedRecipe.classicNote}
                              </div>
                            )}
                          </div>
                          <div className="text-left md:text-right">
                            <div className="text-5xl md:text-6xl font-light font-serif tracking-tighter text-fellini-accent">{selectedRecipe.price || selectedRecipe.time}</div>
                            <div className="text-[10px] font-bold text-fellini-ghost tracking-[0.3em] uppercase mt-2">{selectedRecipe.price ? 'Standard Price Point' : 'Execution Protocol Time'}</div>
                            {selectedRecipe.price && <div className="text-2xl font-serif text-fellini-ghost/40 mt-1">{selectedRecipe.time}</div>}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[400px]">
                          <div className="md:col-span-5 p-8 md:p-12 border-b md:border-b-0 md:border-r border-fellini-rule bg-fellini-white/50">
                            <h4 className="text-[10px] font-bold tracking-[0.4em] text-fellini-accent mb-8 uppercase">Ingredients • Calibration</h4>
                            <ul className="space-y-6">
                              {selectedRecipe.ingredients.map((ing, i) => (
                                <li key={i} className="flex justify-between items-baseline gap-4 group">
                                  <div className="flex-1">
                                    <div className="text-sm font-bold text-fellini-black">{ing.item}</div>
                                    <div className="text-[10px] text-fellini-ghost italic">{ing.prep}</div>
                                  </div>
                                  <div className="font-mono text-xs font-bold text-fellini-accent whitespace-nowrap">{ing.qty}</div>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="md:col-span-7 p-8 md:p-12">
                            <h4 className="text-[10px] font-bold tracking-[0.4em] text-fellini-accent mb-8 uppercase">Execution Sequence</h4>
                            <div className="space-y-8">
                              {selectedRecipe.method.map((step, i) => (
                                <div key={i} className="flex gap-6 items-start">
                                  <span className="font-mono text-xs font-bold bg-fellini-bg px-2.5 py-1 text-fellini-ghost rounded-lg shrink-0">0{i+1}</span>
                                  <p className="text-sm md:text-base leading-relaxed text-fellini-black/80 font-serif">{step}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="p-8 md:p-12 bg-fellini-muted/30 border-t border-fellini-rule grid grid-cols-1 md:grid-cols-3 gap-12">
                          <div className="space-y-4">
                            <h5 className="text-[9px] font-bold tracking-[0.4em] text-fellini-ghost uppercase">System Drift Constraint</h5>
                            <p className="text-sm font-serif italic leading-relaxed text-fellini-accent">{selectedRecipe.driftNotes}</p>
                          </div>
                          <div className="space-y-4">
                            <h5 className="text-[9px] font-bold tracking-[0.4em] text-fellini-ghost uppercase">Plating Specification</h5>
                            <p className="text-sm font-serif leading-relaxed text-fellini-black/80">{selectedRecipe.plating}</p>
                          </div>
                          <div className="space-y-4">
                            <h5 className="text-[9px] font-bold tracking-[0.4em] text-fellini-ghost uppercase">Allergen Matrix</h5>
                            <div className="flex flex-wrap gap-2">
                              {selectedRecipe.allergens.map(a => (
                                <span key={a} className="text-[10px] font-bold px-3 py-1.5 bg-white border border-fellini-rule text-fellini-black rounded-lg shadow-sm">
                                  {a.toUpperCase()}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Hidden Print-Optimized View: ESSENTIAL INFO ONLY */}
                      <div className="hidden print-only">
                        <div className="recipe-print-container">
                          <div className="recipe-print-header">
                            <h1 className="recipe-print-title">{selectedRecipe.name}</h1>
                            {selectedRecipe.classicNote && <p className="recipe-print-subtitle">{selectedRecipe.classicNote}</p>}
                            <div className="recipe-print-meta">
                              PROTOCOL_ID: {selectedRecipe.id} • ENGINE: {selectedRecipe.engine} • STATION: {selectedRecipe.station}
                            </div>
                          </div>

                          <div className="recipe-print-grid">
                            <div className="flex flex-col gap-10">
                              <div>
                                <h2 className="recipe-print-section-title">Ingredients</h2>
                                <div className="recipe-print-text">
                                  {selectedRecipe.ingredients.map((ing, i) => (
                                    <div key={i} className="ingredient-row">
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '900', fontSize: '18pt', letterSpacing: '-0.5px' }}>{ing.item}</div>
                                        {ing.prep && <div style={{ fontSize: '12pt', color: '#333', fontStyle: 'italic', fontWeight: '500', marginTop: '2px' }}>{ing.prep}</div>}
                                      </div>
                                      <div style={{ fontWeight: '900', fontSize: '22pt', color: '#000', textAlign: 'right', minWidth: '120px', fontFamily: 'monospace' }}>{ing.qty}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="drift-notes-box">
                                <h3 style={{ textTransform: 'uppercase', fontSize: '14pt', marginBottom: '1rem', fontWeight: '900', borderBottom: '2px solid black', paddingBottom: '0.4rem', letterSpacing: '2px' }}>Critical Drift Constraint</h3>
                                <div className="recipe-print-text" style={{ fontStyle: 'italic', fontWeight: '600', lineHeight: '1.4', fontSize: '17pt' }}>{selectedRecipe.driftNotes}</div>
                              </div>
                              
                              <div>
                                <h2 className="recipe-print-section-title">Yield Constraint</h2>
                                <div className="recipe-print-text" style={{ fontWeight: '800', fontSize: '24pt', color: '#a3854d' }}>{selectedRecipe.servings} PAX</div>
                              </div>
                            </div>

                            <div className="flex flex-col gap-10">
                              <div>
                                <h2 className="recipe-print-section-title">Execution Sequence</h2>
                                <div className="recipe-print-text">
                                  {selectedRecipe.method.map((step, i) => (
                                    <div key={i} className="recipe-print-method-step">
                                      <span className="recipe-print-step-num">{i + 1}</span>
                                      <span style={{ fontWeight: '600', paddingLeft: '1rem' }}>{step}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <h2 className="recipe-print-section-title">Plating Spec</h2>
                                <div className="recipe-print-text" style={{ fontSize: '20pt', fontWeight: '800', border: '3px solid black', padding: '1.5rem', borderRadius: '4px', backgroundColor: '#fff' }}>{selectedRecipe.plating}</div>
                              </div>
                            </div>
                          </div>
                          
                          <div style={{ marginTop: '5rem', borderTop: '3px solid black', paddingTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div style={{ fontSize: '11pt', fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: '900' }}>
                              FELLINI MASTER BIBLE • GALYONS SYSTEM • DETERMINISTIC EXECUTION
                            </div>
                            <div style={{ fontSize: '10pt', fontFamily: 'monospace', textAlign: 'right', fontWeight: 'bold' }}>
                              PRINTED: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}<br />
                              VERIFICATION_HASH: {selectedRecipe.id}_{Math.random().toString(36).substring(7).toUpperCase()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}


                  {bibleTab === 'certification' && (
                    <motion.div key="certification" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-12 pb-20">
                      {!certificationMode ? (
                        <div className="max-w-4xl mx-auto space-y-10">
                          <div className="bg-fellini-black text-white p-12 rounded-[40px] shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-fellini-accent/10 rounded-full -translate-y-32 translate-x-32" />
                            <div className="relative z-10">
                              <div className="flex items-center gap-6 mb-8">
                                <div className="p-4 bg-fellini-accent rounded-2xl shadow-lg">
                                  <ShieldCheck size={40} />
                                </div>
                                <div>
                                  <h3 className="text-4xl font-black uppercase tracking-tighter">Senior Chef Certification</h3>
                                  <p className="text-white/60 font-mono tracking-widest mt-1">SYSTEM_ACCESS: LEVEL_4_ADVISOR</p>
                                </div>
                              </div>
                              <p className="text-xl font-serif mb-10 leading-relaxed text-white/90">
                                This live examination tests your compliance with the <strong>Zero Drift Law</strong>. Jemma AI will evaluate your deterministic accuracy on ingredients, allergens, and execution protocols across the full 60-dish database.
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                                <div className="bg-white/10 p-6 rounded-2xl border border-white/10">
                                  <div className="text-3xl font-black mb-1">60</div>
                                  <div className="text-[10px] uppercase tracking-widest opacity-60">Database Objects</div>
                                </div>
                                <div className="bg-white/10 p-6 rounded-2xl border border-white/10">
                                  <div className="text-3xl font-black mb-1">94%</div>
                                  <div className="text-[10px] uppercase tracking-widest opacity-60">Passing Threshold</div>
                                </div>
                                <div className="bg-white/10 p-6 rounded-2xl border border-white/10">
                                  <div className="text-3xl font-black mb-1">{completedDishes.length}/60</div>
                                  <div className="text-[10px] uppercase tracking-widest opacity-60">Verified Mastery</div>
                                </div>
                              </div>
                              <button 
                                onClick={() => setCertificationMode(true)}
                                className="w-full py-6 bg-fellini-accent text-white font-black uppercase tracking-[0.3em] rounded-2xl hover:bg-white hover:text-fellini-black transition-all shadow-xl shadow-fellini-accent/20"
                              >
                                Initiate Live Examination
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-white border-4 border-fellini-black p-8 rounded-[30px] flex items-start gap-6 group hover:border-fellini-accent transition-colors">
                              <div className="p-4 bg-fellini-accent/10 rounded-2xl text-fellini-accent group-hover:bg-fellini-accent group-hover:text-white transition-all">
                                <AlertTriangle size={24} />
                              </div>
                              <div>
                                <h4 className="font-black uppercase tracking-tight mb-2">Zero Drift Enforcement</h4>
                                <p className="text-sm font-serif text-fellini-ghost leading-relaxed">Questions focus on the precise measurement of variances in ingredient weight, temperature, and timing.</p>
                              </div>
                            </div>
                            <div className="bg-white border-4 border-fellini-black p-8 rounded-[30px] flex items-start gap-6 group hover:border-fellini-accent transition-colors">
                              <div className="p-4 bg-fellini-accent/10 rounded-2xl text-fellini-accent group-hover:bg-fellini-accent group-hover:text-white transition-all">
                                <Library size={24} />
                              </div>
                              <div>
                                <h4 className="font-black uppercase tracking-tight mb-2">The Bookshelf Logic</h4>
                                <p className="text-sm font-serif text-fellini-ghost leading-relaxed">Answers are validated against Larousse Gastronomique, Escoffier, and the Ginger Pig meat bible.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-4xl mx-auto space-y-8">
                          <div className="flex justify-between items-center bg-white border-4 border-fellini-black p-6 rounded-[25px]">
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-fellini-accent rounded-xl text-white">
                                <Activity size={20} />
                              </div>
                              <div className="font-black uppercase tracking-tighter text-xl">Exam in Progress</div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <div className="text-[10px] uppercase font-bold tracking-widest text-fellini-ghost">Score</div>
                                <div className="text-2xl font-black text-fellini-accent">{examScore}%</div>
                              </div>
                              <button 
                                onClick={() => { setCertificationMode(false); setCurrentExamDish(null); }}
                                className="p-3 hover:bg-fellini-black hover:text-white rounded-xl transition-all"
                              >
                                <X size={20} />
                              </button>
                            </div>
                          </div>

                          {!currentExamDish ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                              {recipes.map(recipe => (
                                <button
                                  key={recipe.id}
                                  onClick={() => setCurrentExamDish(recipe)}
                                  disabled={completedDishes.includes(recipe.id)}
                                  className={`p-6 rounded-2xl border-4 text-left transition-all relative overflow-hidden group ${
                                    completedDishes.includes(recipe.id)
                                      ? 'bg-fellini-accent/10 border-fellini-accent/30 opacity-50'
                                      : 'bg-white border-fellini-black hover:scale-105 hover:border-fellini-accent'
                                  }`}
                                >
                                  <div className="text-[10px] font-mono mb-2 opacity-50">#{recipe.id}</div>
                                  <div className="font-bold uppercase leading-tight text-sm mb-4">{recipe.name}</div>
                                  {completedDishes.includes(recipe.id) ? (
                                    <CheckCircle2 size={24} className="text-fellini-accent" />
                                  ) : (
                                    <div className="h-1 w-12 bg-fellini-accent rounded-full group-hover:w-full transition-all duration-500" />
                                  )}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="bg-white border-4 border-fellini-black rounded-[40px] overflow-hidden shadow-2xl">
                              <div className="p-10 border-b-4 border-fellini-black bg-fellini-black text-white flex justify-between items-center">
                                <div>
                                  <h4 className="text-3xl font-black uppercase tracking-tight">{currentExamDish.name}</h4>
                                  <p className="text-fellini-accent font-mono text-xs tracking-widest mt-1">OBJECT_ID: {currentExamDish.id}</p>
                                </div>
                                <button 
                                  onClick={() => setCurrentExamDish(null)}
                                  className="px-6 py-2 border-2 border-white/20 rounded-full hover:bg-white/10 transition-colors uppercase text-[10px] font-bold tracking-widest"
                                >
                                  Back to Grid
                                </button>
                              </div>
                              <div className="p-10 space-y-12">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                  <div className="space-y-6">
                                    <h5 className="font-black uppercase tracking-widest text-xs py-2 border-b-2 border-fellini-rule mb-6">Deterministic Data Point: Allergens</h5>
                                    <div className="grid grid-cols-2 gap-3">
                                      {['Gluten', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soybeans', 'Milk', 'Nuts', 'Celery', 'Mustard', 'Sesame', 'Sulphites', 'Lupin', 'Molluscs'].map(allergen => (
                                        <button
                                          key={allergen}
                                          className={`py-3 px-4 rounded-xl border-2 text-[10px] font-bold uppercase transition-all ${
                                            currentExamDish.allergens.includes(allergen)
                                              ? 'bg-fellini-accent border-fellini-accent text-white shadow-lg'
                                              : 'bg-white border-fellini-rule text-fellini-ghost hover:border-fellini-black'
                                          }`}
                                        >
                                          {allergen}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="space-y-6">
                                    <h5 className="font-black uppercase tracking-widest text-xs py-2 border-b-2 border-fellini-rule mb-6">Execution Protocol Checklist</h5>
                                    <div className="space-y-4">
                                      {currentExamDish.method.map((step, i) => (
                                        <div key={i} className="flex gap-4 p-4 bg-fellini-rule/20 rounded-xl">
                                          <div className="w-8 h-8 rounded-lg bg-fellini-black text-white flex items-center justify-center flex-shrink-0 font-bold text-xs">{i+1}</div>
                                          <p className="text-sm font-serif italic text-fellini-black line-clamp-2">{step}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="bg-fellini-accent/5 p-8 rounded-3xl border-2 border-dashed border-fellini-accent/30 space-y-6">
                                  <h5 className="font-black uppercase tracking-widest text-xs text-fellini-accent flex items-center gap-2">
                                    <MessageCircle size={16} /> Jemma AI Validation Prompt
                                  </h5>
                                  <div className="text-xl font-serif italic text-fellini-black leading-snug">
                                    "Senior Chef, describe the <strong>Maillard Execution Curve</strong> and <strong>Zero Drift Plating Rules</strong> for the {currentExamDish.name} specifically referencing {currentExamDish.classicNote || 'Larousse standards'}. Specify the mandatory internal temperature for pass verification."
                                  </div>
                                  <div className="relative">
                                    <textarea 
                                      placeholder="Identify critical touchpoints..."
                                      className="w-full bg-white border-4 border-fellini-black p-6 rounded-2xl min-h-[150px] font-mono text-sm focus:outline-none focus:border-fellini-accent transition-colors"
                                    />
                                    <button 
                                      onClick={() => {
                                        setCompletedDishes([...completedDishes, currentExamDish.id]);
                                        setExamScore(prev => Math.min(100, prev + 2));
                                        setCurrentExamDish(null);
                                      }}
                                      className="absolute bottom-6 right-6 bg-fellini-black text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-fellini-accent transition-all shadow-xl"
                                    >
                                      Verify Compliance
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {bibleTab === 'glossary' && (
                    <motion.div key="glossary" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-12 max-w-4xl mx-auto pb-20">
                      <div className="border-b-4 border-fellini-black pb-8 flex justify-between items-end">
                        <div>
                          <h3 className="text-4xl font-black tracking-tighter uppercase font-sc">Culinary Lexicon</h3>
                          <p className="text-fellini-ghost font-medium mt-2">Deterministic definitions from the Food Bible Codex</p>
                        </div>
                        <BookOpen size={48} className="text-fellini-accent opacity-20" />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                        {[
                          { term: 'Temper', definition: 'The process of bringing protein to uniform ambient temperature (approx. 20°C) before thermal execution. Mandatory for hydraulic pressure control and even fiber contraction. Failure results in "thermal shock" and moisture loss.' },
                          { term: 'Emulsify', definition: 'The mechanical binding of two immiscible liquids into a stable, silky suspension. In the Galyons System, this requires graduated lipid introduction and high-velocity agitation. Essential for Luna Engine stability.' },
                          { term: 'Maillard Reaction', definition: 'The chemical reaction between amino acids and reducing sugars that gives browned food its distinctive flavor profile. Execution requires surface moisture removal and exact heat exposure (140°C–165°C).' },
                          { term: 'Mantecatura', definition: 'The rhythmic, physical beating of cold fats (butter/parmesan) into a starch base (risotto/pasta) to achieve the mandatory "all\'onda" (wavy) state. A manual Luna Engine protocol.' },
                          { term: 'Resting Factor', definition: 'The absolute law of post-thermal relaxation. t_rest must equal t_cook. This allows the internal hydraulic pressure of the protein to redistribute, preventing cellular leakage upon carving.' },
                          { term: 'Baveuse', definition: 'The specific "loose" or slightly undercooked texture required for the internal core of a classic French omelette. A binary success state: either it is baveuse or it is overcooked.' },
                          { term: 'Mirepoix', definition: 'A deterministic ratio of 2:1:1 (Onion, Celery, Carrot) used as the aromatic foundation for all mother sauces. Cut size must be uniform to ensure synchronized sweating.' },
                          { term: 'Monte au Beurre', definition: 'Final-phase gloss achievement: the emulsification of cold butter into a hot sauce at the pass. Adds reflective quality and mouthfeel without further reduction.' },
                          { term: 'Osmosis Law', definition: 'The directional movement of moisture across a semi-permeable membrane (protein cell wall). In the Forge, salt is applied 45 minutes prior to execution to trigger brine re-absorption, ensuring internal juiciness.' },
                          { term: 'Thermal Decay', definition: 'The rate at which a dish loses heat after the pass. The Galyons target is < 2°C per 60 seconds. Requires pre-heated heavy porcelain execution.' },
                          { term: 'Viscosity Baseline', definition: 'The measured flow rate of sauces. A sauce must "coat the back of a spoon" (Nappé) without breaking. Failure indicates emulsion drift.' }
                        ].map((item, i) => (
                          <div key={i} className="group border-l-4 border-fellini-accent pl-6 py-1">
                            <h4 className="text-xl font-bold font-serif mb-2 group-hover:text-fellini-accent transition-colors flex items-center gap-3">
                              {item.term}
                              <div className="h-px bg-fellini-rule flex-1 group-hover:bg-fellini-accent/30 transition-colors" />
                            </h4>
                            <p className="text-sm leading-relaxed text-fellini-black/80 font-serif italic">{item.definition}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {bibleTab === 'playbook' && (
                    <motion.div key="playbook" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-16 pb-20">
                      <div className="flex justify-between items-end border-b-4 border-fellini-black pb-8">
                        <div>
                          <h3 className="text-4xl font-black tracking-tighter uppercase font-sc">Execution Playbook</h3>
                          <p className="text-fellini-ghost font-medium mt-2">Galyons System Station Card Protocols</p>
                        </div>
                        <div className="flex gap-4">
                          <div className="p-3 bg-fellini-black text-white rounded-xl">
                            <ShieldCheck size={24} />
                          </div>
                          <div className="p-3 bg-fellini-accent text-white rounded-xl">
                            <Printer size={24} />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {/* Pizza Build Card */}
                        <div className="bg-white border-4 border-fellini-black rounded-[40px] overflow-hidden shadow-2xl relative group">
                          <div className="absolute top-6 right-6 px-3 py-1 bg-fellini-black text-white text-[10px] font-bold rounded-lg uppercase tracking-widest z-10">Station: Helios/Pizza</div>
                          <div className="absolute -right-20 -top-20 w-64 h-64 bg-fellini-accent/5 rounded-full group-hover:scale-110 transition-transform duration-700" />
                          <div className="p-10 relative">
                            <div className="flex items-center gap-5 mb-10">
                              <div className="w-16 h-16 rounded-2xl bg-fellini-accent flex items-center justify-center text-white shadow-lg shadow-fellini-accent/20">
                                <Flame size={32} />
                              </div>
                              <div>
                                <h4 className="text-2xl font-black uppercase tracking-tight">Pizza_Build_Protocol</h4>
                                <div className="text-[10px] font-mono text-fellini-ghost tracking-widest mt-1">CODE: G-HELIOS-PZ-01</div>
                              </div>
                            </div>
                            
                            <div className="space-y-8">
                              {[
                                { step: '01', title: 'Dough Integrity', desc: 'Confirm 24h hydration. Dough balls must be 260g ± 5g. Temperature check: 22°C (Room Temp).' },
                                { step: '02', title: 'The Manual Stretch', desc: 'Stretch to 12 inches using only fingertips. No mechanical aid. Cornicione (edge) must be 1cm width.' },
                                { step: '03', title: 'Circular Sauce Logic', desc: '90g San Marzano sauce. Spiral from center outwards. Stop 1cm from edge. No spotting.' },
                                { step: '04', title: 'Lipid Distribution', desc: '90g Mozzarella, hand-torn. 3 basil leaves. 5ml Extra Virgin Olive Oil drizzle in a 6-figure motion.' },
                                { step: '05', title: 'Thermal Execution', desc: 'Oven at 430°C. 90-120s bake. Rotate 180° at t+45s. Target: even leopard spotting on base.' }
                              ].map((item, i) => (
                                <div key={i} className="flex gap-6 items-start">
                                  <div className="bg-fellini-black text-white w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-md">{item.step}</div>
                                  <div>
                                    <div className="font-black text-lg uppercase tracking-tighter mb-1 text-fellini-black">{item.title}</div>
                                    <p className="text-sm text-fellini-ghost font-serif italic leading-relaxed">{item.desc}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="bg-fellini-accent h-4 w-full" />
                        </div>

                        {/* Oven Control Card */}
                        <div className="bg-white border-4 border-fellini-black rounded-[40px] overflow-hidden shadow-2xl relative group">
                          <div className="absolute top-6 right-6 px-3 py-1 bg-fellini-black text-white text-[10px] font-bold rounded-lg uppercase tracking-widest z-10">Station: Helios/Mains</div>
                          <div className="absolute -right-20 -top-20 w-64 h-64 bg-fellini-accent/5 rounded-full group-hover:scale-110 transition-transform duration-700" />
                          <div className="p-10 relative">
                            <div className="flex items-center gap-5 mb-10">
                              <div className="w-16 h-16 rounded-2xl bg-fellini-black flex items-center justify-center text-white shadow-lg">
                                <Activity size={32} />
                              </div>
                              <div>
                                <h4 className="text-2xl font-black uppercase tracking-tight">Oven_Control_Logic</h4>
                                <div className="text-[10px] font-mono text-fellini-ghost tracking-widest mt-1">CODE: G-HELIOS-MN-04</div>
                              </div>
                            </div>
                            
                            <div className="space-y-8">
                              {[
                                { step: '01', title: 'Morning Calibration', desc: 'Sync digital readout with interior analog probe. Permitted variance < 2°C. Calibrate at 08:00 daily.' },
                                { step: '02', title: 'The Pre-Heat Law', desc: 'Minimum 30 min pre-heat for thermal equilibrium. Do not open door during the build-up phase.' },
                                { step: '03', title: 'Load Density', desc: 'Maximum 70% capacity. Allow 15cm between GN trays for convection vortex. Overcrowding equals drift.' },
                                { step: '04', title: 'Steam Modulation', desc: 'Flash steam only for bread protocols. Roast protocols require 0% moisture. Vent check every 30 mins.' },
                                { step: '05', title: 'Thermal Recovery', desc: 'Wait 60s between large load swaps to allow temperature bounce. Do not override recovery alerts.' }
                              ].map((item, i) => (
                                <div key={i} className="flex gap-6 items-start">
                                  <div className="bg-fellini-accent text-white w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-md shadow-fellini-accent/20">{item.step}</div>
                                  <div>
                                    <div className="font-black text-lg uppercase tracking-tighter mb-1 text-fellini-black">{item.title}</div>
                                    <p className="text-sm text-fellini-ghost font-serif italic leading-relaxed">{item.desc}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="bg-fellini-black h-4 w-full" />
                        </div>

                        {/* Hydraulic Protein Execution Card */}
                        <div className="bg-white border-4 border-fellini-black rounded-[40px] overflow-hidden shadow-2xl relative group lg:col-span-2">
                          <div className="absolute top-6 right-6 px-4 py-1 bg-fellini-accent text-white text-[12px] font-black rounded-lg uppercase tracking-widest z-10">Station: Helios/Mains</div>
                          <div className="p-12 relative flex flex-col md:flex-row gap-12">
                            <div className="flex-1">
                              <div className="flex items-center gap-6 mb-12">
                                <div className="w-20 h-20 rounded-3xl bg-fellini-accent flex items-center justify-center text-white shadow-xl">
                                  <Flame size={40} />
                                </div>
                                <div>
                                  <h4 className="text-3xl font-black uppercase tracking-tight">Hydraulic_Protein_Protocol</h4>
                                  <div className="text-xs font-mono text-fellini-ghost tracking-widest mt-1">CODE: G-HELIOS-MN-STEAK-01</div>
                                </div>
                              </div>
                              
                              <div className="space-y-10">
                                {[
                                  { step: '01', title: 'Fiber Relaxation (Tempering)', desc: 'Remove protein from chill zone (4°C) 45 mins prior to service. Core temp must hit 18°C. Prevents fiber shock.' },
                                  { step: '02', title: 'The Osmosis Salting', desc: 'Apply Maldon or Sea Salt 20 mins before fire. Salt dissolves, pulls moisture, and re-enters as concentrated brine.' },
                                  { step: '03', title: 'Thermal Contact Law', desc: 'Cast iron at 220°C. Sear for 2 mins without movement to establish Maillard crust. Only flip once.' },
                                  { step: '04', title: 'The Butter Baste', desc: 'Reduce heat. Add 30g cold butter, 1 garlic clove, 1 sprig rosemary. Baste continuously for final 60s of cook.' },
                                  { step: '05', title: 'Hydraulic Equilibrium (Rest)', desc: 'Transfer to warm tray (45°C). Rest for t_rest = t_cook. Decanted juices must be re-applied to the cut at the pass.' }
                                ].map((item, i) => (
                                  <div key={i} className="flex gap-8 items-start">
                                    <div className="bg-fellini-black text-white w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 shadow-xl">{item.step}</div>
                                    <div>
                                      <div className="font-black text-xl uppercase tracking-tighter mb-2 text-fellini-black">{item.title}</div>
                                      <p className="text-base text-fellini-ghost font-serif italic leading-relaxed">{item.desc}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="w-full md:w-[350px] space-y-6">
                               <div className="bg-fellini-bg border-4 border-fellini-black p-8 rounded-[3rem]">
                                 <h5 className="text-[10px] font-black uppercase tracking-widest text-fellini-ghost mb-4">Critical Criticalities</h5>
                                 <ul className="space-y-4 text-sm font-serif italic text-fellini-black/80">
                                   <li>• If protein is cold-fired: DISCARD.</li>
                                   <li>• If Maillard crust is not continuous: IMPROVE.</li>
                                   <li>• If t_rest &lt; t_cook: INFRACTION LOGGED.</li>
                                 </ul>
                               </div>
                               <div className="bg-fellini-accent/10 border-2 border-fellini-accent/20 p-8 rounded-[3rem]">
                                 <h5 className="text-[10px] font-black uppercase tracking-widest text-fellini-accent mb-4">Output Log</h5>
                                 <p className="text-xs font-mono leading-relaxed text-fellini-accent/80">
                                   Status: VALIDATED<br/>
                                   Efficiency: 98.4%<br/>
                                   Variance: NOMINAL
                                 </p>
                               </div>
                            </div>
                          </div>
                          <div className="bg-fellini-accent h-4 w-full" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* DRIFT CONTROL */}
            {activeModule === 'drift' && (
              <motion.div 
                key="drift" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className="max-w-6xl mx-auto space-y-10"
              >
                <div className="flex justify-between items-end border-b border-fellini-rule pb-8">
                  <div>
                    <h2 className="forged-header text-5xl tracking-widest text-fellini-accent uppercase">DRIFT CONTROL</h2>
                    <p className="text-fellini-ghost mt-2 text-lg font-serif italic">Real-time Variance Detection & Correction Log</p>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-mono text-fellini-accent font-black">{driftLevel.toFixed(4)}%</div>
                    <div className="text-[10px] font-bold text-fellini-ghost uppercase tracking-widest mt-1">System Aggregate Drift</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    { label: 'Thermal Variance', value: '0.002°C', status: 'Optimal' },
                    { label: 'Hydraulic Pressure', value: '4.2 Bar', status: 'Stable' },
                    { label: 'MEP Alignment', value: '99.8%', status: 'Nominal' }
                  ].map(stat => (
                    <div key={stat.label} className="bg-white border border-fellini-rule p-8 rounded-3xl">
                      <div className="text-[10px] font-black text-fellini-ghost uppercase tracking-widest mb-2">{stat.label}</div>
                      <div className="text-2xl font-mono font-bold text-fellini-black">{stat.value}</div>
                      <div className="mt-4 text-[9px] font-bold text-fellini-green uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-fellini-green rounded-full animate-pulse" />
                        {stat.status}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-white border border-fellini-rule rounded-[2rem] overflow-hidden">
                  <div className="p-6 bg-fellini-black text-white text-xs font-bold tracking-[0.3em] uppercase">Historical Correction Log</div>
                  <div className="divide-y divide-fellini-rule/40 font-mono text-[11px]">
                    {[
                      { time: '21:14:02', event: 'Thermal Bounce detected at Helios-04', correction: 'Auto-modulation active', drift: '+0.012%' },
                      { time: '20:45:12', event: 'MEP weight variance in Luna-02', correction: 'Manual recalibration logged', drift: '+0.008%' },
                      { time: '19:30:00', event: 'Shift Handover Protocol', correction: 'Sync confirmed', drift: '0.000%' },
                      { time: '18:12:45', event: 'Oven Door Duration Violation', correction: 'Protocol Warning Issued', drift: '+0.045%' },
                      { time: '17:05:10', event: 'Cold Chain Check: Walk-in 2', correction: 'Stable at 2.4°C', drift: '-0.002%' }
                    ].map((log, i) => (
                      <div key={i} className="p-5 flex items-center justify-between hover:bg-fellini-accent/5 transition-colors">
                        <div className="flex gap-10 items-center">
                          <span className="text-fellini-ghost">{log.time}</span>
                          <span className="font-bold text-fellini-black">{log.event}</span>
                        </div>
                        <div className="flex gap-10 items-center">
                          <span className="italic text-fellini-ghost/60">{log.correction}</span>
                          <span className="text-fellini-accent font-bold">{log.drift}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* STAFF SYNC */}
            {activeModule === 'staff' && (
              <motion.div 
                key="staff" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className="max-w-6xl mx-auto space-y-12"
              >
                <div className="border-b border-fellini-rule pb-8">
                  <h2 className="forged-header text-5xl tracking-widest text-fellini-accent uppercase">STAFF SYNC</h2>
                  <p className="text-fellini-ghost mt-2 text-lg font-serif italic">Operational Hierarchy & Role Distribution</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {[
                    { name: 'Marcus Fellini', role: 'Operator', nodes: 'System Root', status: 'ACTIVE' },
                    { name: 'Elena Vance', role: 'Head Chef', nodes: 'Helios Master', status: 'ACTIVE' },
                    { name: 'Julian Thorne', role: 'Head Chef', nodes: 'Luna Master', status: 'ACTIVE' },
                    { name: 'Sarah Chen', role: 'Line Chef', nodes: 'Cold / Prep', status: 'TRAINING' },
                    { name: 'Robert Gable', role: 'Line Chef', nodes: 'Mains / Pass', status: 'ACTIVE' },
                    { name: 'David Mills', role: 'Technician', nodes: 'Aether / Inventory', status: 'ACTIVE' }
                  ].map(staff => (
                    <div key={staff.name} className="bg-white border border-fellini-rule p-8 rounded-[2.5rem] hover:border-fellini-accent transition-all group">
                      <div className="flex justify-between items-start mb-6">
                        <div className={`text-[9px] font-black px-3 py-1 rounded-full tracking-widest ${staff.status === 'ACTIVE' ? 'bg-fellini-green/10 text-fellini-green' : 'bg-fellini-accent/10 text-fellini-accent'}`}>
                          {staff.status}
                        </div>
                        <div className="text-[10px] font-mono text-fellini-ghost">{staff.nodes}</div>
                      </div>
                      <h3 className="text-2xl font-serif italic text-fellini-black group-hover:text-fellini-accent transition-colors">{staff.name}</h3>
                      <div className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-fellini-ghost">{staff.role}</div>
                      <div className="mt-8 pt-6 border-t border-fellini-rule/40">
                        <button className="text-[10px] font-bold text-fellini-accent uppercase tracking-widest hover:underline">View Performance Stats →</button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* INVENTORY */}
            {activeModule === 'inventory' && (
              <motion.div 
                key="inventory" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className="max-w-6xl mx-auto space-y-12"
              >
                <div className="flex justify-between items-end border-b border-fellini-rule pb-8">
                  <div>
                    <h2 className="forged-header text-5xl tracking-widest text-fellini-accent uppercase">INVENTORY</h2>
                    <p className="text-fellini-ghost mt-2 text-lg font-serif italic">Supply Engine Assets & Stock Integrity</p>
                  </div>
                  <button className="bg-fellini-black text-white px-8 py-3 rounded-xl text-xs font-bold tracking-widest uppercase hover:bg-fellini-accent transition-all">Reorder Criticals</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white border border-fellini-rule rounded-[2.5rem] overflow-hidden">
                    <div className="p-6 bg-fellini-muted/30 border-b border-fellini-rule text-[10px] font-black tracking-widest uppercase">Critical Stock Thresholds</div>
                    <div className="p-2">
                       {[
                         { item: 'Dry-Aged Beef Fillet', stock: '12kg', par: '25kg', trend: 'down' },
                         { item: 'San Marzano Tomatoes', stock: '4 cases', par: '10 cases', trend: 'down' },
                         { item: 'Tipo 00 Flour', stock: '85kg', par: '100kg', trend: 'stable' },
                         { item: 'Unsalted Lescure Butter', stock: '5kg', par: '20kg', trend: 'critical' },
                         { item: 'Cornish Sea Salt', stock: '40kg', par: '30kg', trend: 'up' }
                       ].map(stock => (
                         <div key={stock.item} className="p-6 flex items-center justify-between border-b border-fellini-rule/40 last:border-0 hover:bg-fellini-accent/5 transition-colors">
                           <div>
                             <div className="font-serif font-black text-fellini-black">{stock.item}</div>
                             <div className="text-[10px] text-fellini-ghost uppercase tracking-widest mt-1">PAR Level: {stock.par}</div>
                           </div>
                           <div className="text-right">
                             <div className={`font-mono font-bold ${stock.trend === 'critical' ? 'text-red-600' : 'text-fellini-black'}`}>{stock.stock}</div>
                             <div className={`text-[9px] font-bold uppercase mt-1 tracking-tighter ${stock.trend === 'down' ? 'text-orange-500' : stock.trend === 'critical' ? 'text-red-500' : 'text-fellini-green'}`}>
                               Trend: {stock.trend}
                             </div>
                           </div>
                         </div>
                       ))}
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="bg-white border border-fellini-rule p-8 rounded-[2.5rem]">
                      <h4 className="text-[10px] font-black text-fellini-ghost uppercase tracking-widest mb-6">Supply Variance Log</h4>
                      <div className="space-y-4">
                        <div className="flex gap-4 items-start">
                          <div className="w-2 h-2 mt-1.5 bg-fellini-accent rounded-full" />
                          <p className="text-sm font-serif italic text-fellini-black/70">Supplier "Ginger Pig" reported weather delays. Beef delivery pushed to 08:00 T+1.</p>
                        </div>
                        <div className="flex gap-4 items-start">
                          <div className="w-2 h-2 mt-1.5 bg-fellini-accent rounded-full" />
                          <p className="text-sm font-serif italic text-fellini-black/70">Dairy Book audit confirmed 4% lift in crème fraiche wastage. Recalibrating Luna Engine 04.</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-fellini-black p-10 rounded-[2.5rem] text-white">
                      <div className="text-[9px] uppercase tracking-widest text-fellini-accent mb-2">Total Inventory Value</div>
                      <div className="text-4xl font-mono font-black">£24,850.12</div>
                      <div className="mt-8 pt-6 border-t border-white/10 flex justify-between items-center text-[10px] font-bold tracking-widest uppercase">
                        <span className="text-white/40">Waste Factor</span>
                        <span className="text-fellini-accent">1.2% (OPTIMAL)</span>
                      </div>
                    </div>
                    
                    {/* SUPPLY ENGINE QUALITY GATE */}
                    <div className="md:col-span-2 bg-fellini-black border-4 border-fellini-accent/20 rounded-[2.5rem] overflow-hidden">
                      <div className="p-8 border-b border-white/10 flex justify-between items-center">
                        <div>
                          <div className="text-[10px] text-fellini-accent font-black tracking-[0.4em] uppercase mb-1">Module: ENG-00</div>
                          <h4 className="text-2xl font-black text-white tracking-tighter uppercase">Inbound Quality Gate</h4>
                        </div>
                        <button 
                          onClick={runQualityGate}
                          disabled={qualityGateStatus === 'SCANNING'}
                          className={`px-8 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all flex items-center gap-3 ${
                            qualityGateStatus === 'SCANNING' ? 'bg-fellini-ghost/20 text-fellini-ghost' : 'bg-fellini-accent text-white hover:scale-105 shadow-lg shadow-fellini-accent/20'
                          }`}
                        >
                          {qualityGateStatus === 'SCANNING' ? (
                            <>
                              <Activity size={16} className="animate-pulse" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={16} />
                              Initiate Scan
                            </>
                          )}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-3">
                        <div className="lg:col-span-2 p-8 border-r border-white/5">
                          <div className="text-[10px] text-white/40 font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
                            <Hash size={12} />
                            Recent Scan Log
                          </div>
                          <div className="space-y-4">
                            {qualityGateLog.map(log => (
                              <div key={log.id} className="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                                <div className="flex items-center gap-6">
                                  <div className="text-xs font-mono text-white/40">{log.time}</div>
                                  <div>
                                    <div className="text-sm font-bold text-white uppercase tracking-tight">{log.item}</div>
                                    <div className="text-[9px] text-white/60 font-mono mt-0.5">{log.id}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-8">
                                  <div className="text-right">
                                    <div className="text-[9px] font-bold text-white/40 uppercase mb-0.5">Variance</div>
                                    <div className={`text-xs font-mono font-bold ${log.status === 'PASS' ? 'text-fellini-green' : 'text-fellini-red'}`}>
                                      {log.variance}
                                    </div>
                                  </div>
                                  <div className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase ${
                                    log.status === 'PASS' ? 'bg-fellini-green/10 text-fellini-green border border-fellini-green/20' : 'bg-fellini-red/10 text-fellini-red border border-fellini-red/20'
                                  }`}>
                                    {log.status}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="p-8 bg-fellini-accent/5 flex flex-col justify-center items-center text-center">
                           <div className="w-24 h-24 rounded-full border-4 border-fellini-accent/20 flex items-center justify-center mb-6 relative">
                              <div className="absolute inset-0 rounded-full border-t-4 border-fellini-accent animate-spin" />
                              <ShieldCheck size={40} className="text-fellini-accent" />
                           </div>
                           <h5 className="text-lg font-bold text-white uppercase tracking-tighter mb-2">Gate Intelligence</h5>
                           <p className="text-xs text-white/60 leading-relaxed max-w-[200px]">
                              Zero Drift active. All inbound assets verified against the 82-Spec Master Bible.
                           </p>
                           <div className="mt-8 grid grid-cols-2 gap-4 w-full">
                              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                 <div className="text-[8px] text-white/40 font-bold uppercase mb-1">Integrity</div>
                                 <div className="text-xl font-mono font-bold text-fellini-green">100%</div>
                              </div>
                              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                 <div className="text-[8px] text-white/40 font-bold uppercase mb-1">Latency</div>
                                 <div className="text-xl font-mono font-bold text-white">4ms</div>
                              </div>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* SERVICE RHYTHM */}
            {activeModule === 'service' && (
              <motion.div 
                key="service" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className="max-w-6xl mx-auto space-y-12"
              >
                <div className="border-b border-fellini-rule pb-8">
                  <h2 className="forged-header text-5xl tracking-widest text-fellini-accent uppercase">SERVICE RHYTHM</h2>
                  <p className="text-fellini-ghost mt-2 text-lg font-serif italic">Real-Time Cadence & Throughput Governance</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {[
                    { label: 'Active Covers', value: '42', max: '80' },
                    { label: 'Avg Ticketing', value: '14m', target: '12m' },
                    { label: 'Engine RPM', value: '850', max: '1000' },
                    { label: 'Pass Congestion', value: 'LO', status: 'Clear' }
                  ].map(cadence => (
                    <div key={cadence.label} className="bg-white border border-fellini-rule p-8 rounded-3xl">
                      <div className="text-[10px] font-black text-fellini-ghost uppercase tracking-widest mb-2">{cadence.label}</div>
                      <div className="text-3xl font-mono font-black text-fellini-black">{cadence.value}</div>
                      <div className="mt-4 text-[9px] font-bold text-fellini-accent uppercase tracking-widest">
                        Ref: {cadence.max || cadence.target || cadence.status}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-white border-4 border-fellini-black rounded-[3rem] p-12 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                     <Flame size={200} />
                   </div>
                   <h3 className="text-2xl font-serif italic text-fellini-black mb-8 relative z-10">Current Service Pulse</h3>
                   <div className="h-64 flex items-end gap-3 relative z-10">
                      {[40, 65, 45, 80, 55, 90, 70, 85, 60, 45, 30, 20].map((h, i) => (
                        <div key={i} className="flex-1 bg-fellini-muted/40 rounded-t-xl group relative">
                          <motion.div 
                            initial={{ height: 0 }}
                            animate={{ height: `${h}%` }}
                            className="bg-fellini-accent rounded-t-xl w-full group-hover:bg-fellini-black transition-colors"
                          />
                          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[9px] font-mono text-fellini-ghost">{17 + i}:00</div>
                        </div>
                      ))}
                   </div>
                   <div className="mt-16 text-center text-fellini-ghost font-mono text-[10px] uppercase tracking-[0.4em]">Integrated Flow Dynamics Active</div>
                </div>
              </motion.div>
            )}

            {/* FELLINI PROPHECY */}
            {activeModule === 'prophecy' && (
              <motion.div 
                key="prophecy" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className="max-w-6xl mx-auto space-y-12"
              >
                <div className="border-b border-fellini-rule pb-8">
                  <h2 className="forged-header text-5xl tracking-widest text-fellini-accent uppercase">FELLINI PROPHECY</h2>
                  <p className="text-fellini-ghost mt-2 text-lg font-serif italic">Forecasting & Strategic Provisioning</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                   <div className="bg-fellini-black text-white p-12 rounded-[3.5rem] shadow-2xl relative overflow-hidden">
                      <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-white/5 rounded-full" />
                      <div className="relative z-10">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-fellini-accent mb-10">Next 72h Forecast</h4>
                        <div className="space-y-10">
                           {[
                             { day: 'Friday', forecast: 'Heavy', covers: '145', probability: '92%' },
                             { day: 'Saturday', forecast: 'Peak', covers: '185', probability: '98%' },
                             { day: 'Sunday', forecast: 'Moderate', covers: '95', probability: '88%' }
                           ].map(f => (
                             <div key={f.day} className="flex items-center justify-between">
                               <div>
                                 <div className="text-2xl font-serif italic">{f.day}</div>
                                 <div className="text-[10px] uppercase tracking-widest text-white/40 mt-1">{f.forecast} Demand</div>
                               </div>
                               <div className="text-right">
                                 <div className="text-2xl font-mono font-bold text-fellini-accent">{f.covers}</div>
                                 <div className="text-[10px] uppercase font-bold text-white/20 mt-1">Conf: {f.probability}</div>
                               </div>
                             </div>
                           ))}
                        </div>
                      </div>
                   </div>

                   <div className="space-y-8">
                      <div className="bg-white border-2 border-fellini-rule p-10 rounded-[3rem]">
                        <h4 className="text-[10px] font-black text-fellini-ghost uppercase tracking-widest mb-6">Market Insight Prediction</h4>
                        <p className="text-base font-serif italic leading-relaxed text-fellini-black/80">
                          “AETHER-05 detection: External humidity increase likely to affect Sourdough crust development by +8.2% elasticity. Helios-01 recalibration advised for evening service.”
                        </p>
                      </div>
                      <div className="bg-white border-2 border-fellini-rule p-10 rounded-[3rem]">
                        <h4 className="text-[10px] font-black text-fellini-ghost uppercase tracking-widest mb-6">Staffing Optimization</h4>
                        <p className="text-base font-serif italic leading-relaxed text-fellini-black/80">
                          “Saturday forecast suggests peak Luna Engine demand at 20:30. Recommendation: Double-stack Head Chef nodes on Sauce Station.”
                        </p>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modal for selected book */}
      <AnimatePresence>
        {selectedBook && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-fellini-black/70 backdrop-blur-md" onClick={() => setSelectedBook(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl border-4 border-fellini-black"
            >
              <div className="bg-fellini-black p-10 text-white flex justify-between items-center relative overflow-hidden">
                <div className="relative z-10">
                  <div className="text-[10px] text-fellini-accent font-black uppercase tracking-[0.4em] mb-4">{selectedBook.category}</div>
                  <h2 className="text-4xl font-serif italic leading-tight">{selectedBook.title}</h2>
                </div>
                <Library size={120} className="absolute -right-10 -bottom-10 text-white opacity-5 rotate-12 z-0" />
                <button onClick={() => setSelectedBook(null)} className="hover:text-fellini-accent transition-colors bg-white/10 p-2 rounded-full relative z-10">
                  <X size={24} />
                </button>
              </div>
              <div className="p-12 space-y-10">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-fellini-ghost mb-4">Bibliographic Specification</h4>
                  <p className="text-lg font-serif italic text-fellini-black/80 leading-relaxed">{selectedBook.description}</p>
                </div>

                {selectedBook.linkedRecipes && selectedBook.linkedRecipes.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-fellini-ghost mb-6">Linked Protocols in Master Bible</h4>
                    <div className="space-y-3">
                      {selectedBook.linkedRecipes.map(recipeId => {
                        const recipe = recipes.find(r => r.id === recipeId);
                        if (!recipe) return null;
                        return (
                          <div 
                            key={recipeId} 
                            onClick={() => {
                              setSelectedRecipe(recipe);
                              setBibleTab('codex');
                              setActiveModule('bible');
                              setSelectedBook(null);
                            }}
                            className="flex items-center justify-between p-5 bg-fellini-bg border-2 border-fellini-rule hover:border-fellini-accent transition-all cursor-pointer rounded-2xl group"
                          >
                            <div>
                              <div className="font-serif font-black text-fellini-black group-hover:text-fellini-accent transition-colors">{recipe.name}</div>
                              <div className="text-[10px] text-fellini-ghost uppercase font-bold tracking-widest mt-1">{recipe.engine} Engine • {recipe.station}</div>
                            </div>
                            <span className="text-fellini-accent font-bold text-xs group-hover:translate-x-1 transition-transform">VIEW PROTOCOL →</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button 
                  onClick={() => setSelectedBook(null)}
                  className="w-full bg-fellini-muted text-fellini-ghost py-6 rounded-[24px] font-black tracking-[0.3em] uppercase hover:bg-fellini-black hover:text-white transition-all shadow-lg"
                >
                  Close Shelf
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* JEMMA AI CHAT - Persistent */}
      <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-50">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="w-14 h-14 md:w-16 md:h-16 bg-[#5e5ce6] hover:bg-[#4c4ad1] text-white rounded-2xl flex items-center justify-center shadow-2xl transition-all cursor-pointer"
        >
          <MessageCircle size={24} className="md:w-[28px] md:h-[28px]" />
        </motion.button>

        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={typeof window !== 'undefined' && window.innerWidth < 768 ? { y: '100%' } : { opacity: 0, y: 30, scale: 0.95 }}
              animate={typeof window !== 'undefined' && window.innerWidth < 768 ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
              exit={typeof window !== 'undefined' && window.innerWidth < 768 ? { y: '100%' } : { opacity: 0, y: 30, scale: 0.95 }}
              className="fixed md:absolute bottom-0 md:bottom-20 left-0 md:left-auto right-0 w-full md:w-96 bg-fellini-white border-t md:border border-fellini-rule rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[75vh] md:h-auto max-h-[85vh] md:max-h-none"
            >
              {/* Chat Header */}
              <div className={`${jemmaMode === 'OPERATOR' ? 'bg-fellini-black' : 'bg-[#5e5ce6]'} text-white p-5 flex items-center justify-between shrink-0 transition-colors duration-500`}>
                <div className="flex items-center gap-3">
                  {jemmaMode === 'OPERATOR' ? <Activity size={22} className="text-fellini-accent" /> : <ShieldCheck size={22} />}
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      Jemma Sentinel
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border ${jemmaMode === 'OPERATOR' ? 'border-fellini-accent text-fellini-accent' : 'border-white/40 text-white/60'}`}>
                        {jemmaMode}
                      </span>
                    </div>
                    <div className="text-xs opacity-75">{jemmaMode === 'OPERATOR' ? 'Operational Governance Active' : 'Training Mode • Documentation Sync'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={clearChat} className="cursor-pointer hover:text-red-300 transition-colors p-1" title="Clear History">
                    <Trash2 size={18} />
                  </button>
                  <button onClick={() => setIsChatOpen(false)} className="cursor-pointer p-1"><X size={20} /></button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-fellini-parchment/50 no-scrollbar">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-sm shadow-sm ${msg.role === 'user' 
                      ? 'bg-fellini-accent text-white' 
                      : (msg.content.includes('STATUS:') || msg.content.includes('RFC:'))
                        ? 'bg-fellini-black text-white border-2 border-fellini-accent font-mono text-xs'
                        : 'bg-white border border-fellini-rule text-fellini-black'}`}>
                      {msg.content.split('\n').map((line, i) => (
                        <div key={i} className={line.startsWith('STATUS:') || line.startsWith('CAUSE:') || line.startsWith('ACTION:') || line.startsWith('RFC:') || line.startsWith('ISSUE:') ? 'font-black text-fellini-accent' : ''}>
                          {line}
                        </div>
                      ))}
                      <div className="text-[10px] mt-2 opacity-60 text-right font-mono tracking-tighter">{msg.timestamp}</div>
                    </div>
                  </div>
                ))}
                {isJemmaTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-fellini-rule rounded-2xl px-5 py-3.5 shadow-sm">
                      <div className="flex gap-1">
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }} className="w-1.5 h-1.5 bg-fellini-accent rounded-full" />
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="w-1.5 h-1.5 bg-fellini-accent rounded-full" />
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="w-1.5 h-1.5 bg-fellini-accent rounded-full" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-fellini-rule bg-fellini-white shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ask Jemma..."
                    className="flex-1 bg-fellini-muted border border-fellini-rule rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-[#5e5ce6] text-fellini-black"
                  />
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={sendMessage}
                    className="w-12 h-12 bg-[#5e5ce6] text-white rounded-2xl flex items-center justify-center hover:bg-[#4c4ad1] cursor-pointer"
                  >
                    <Send size={20} />
                  </motion.button>
                </div>
                <div className="text-center text-[9px] text-fellini-ghost mt-2 uppercase font-bold tracking-widest">Conversation persistent in browser</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="hidden md:flex border-t border-fellini-rule py-5 px-10 text-[10px] font-mono text-fellini-ghost bg-fellini-white/80 justify-between uppercase tracking-widest bg-white">
        <div className="flex gap-8">
          <span>GALYONS • RODZ 2026</span>
          <span className="text-fellini-rule">|</span>
          <span>ROYAL DOCKS, LONDON</span>
          <span className="text-fellini-rule">|</span>
          <span className="text-fellini-black font-bold">ALL DEVIATIONS PERMANENTLY RECORDED</span>
        </div>
        <div className="flex gap-8 items-center">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-fellini-green rounded-full shadow-sm animate-pulse" />
            OCTAGON_ENGINE_ONLINE
          </span>
          <span className="text-fellini-accent font-bold"><ShieldCheck size={14} className="inline mb-0.5 mr-1" /> ZERO_DRIFT_LAW_ENFORCED</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
