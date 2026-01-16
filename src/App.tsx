import React, { useState, useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Moon, Sun, Shield, Skull, Eye, Crosshair, 
  HelpCircle, AlertTriangle, Play, Repeat,
  ArrowRight, Gavel, FlaskConical, Home, X, MoonStar, EyeOff, Target, AlertCircle
} from 'lucide-react';

// --- 1. 常數與資產 ---
const ASSETS = {
  cardBack: 'https://raw.githubusercontent.com/DorisLiu1101/Werewolf-Game/refs/heads/main/Public/SealBack.webp',
  cardFront: 'https://raw.githubusercontent.com/DorisLiu1101/Werewolf-Game/refs/heads/main/Public/Role.webp'
};

const ROLES = {
  WEREWOLF: { 
    id: 'werewolf', 
    name: '狼人', 
    team: 'bad', 
    isGod: false, 
    skill: '每晚襲擊一名玩家。\n白天階段可選擇「自爆」直接出局並強制進入黑夜（略過投票）。' 
  },
  VILLAGER: { 
    id: 'villager', 
    name: '平民', 
    team: 'good', 
    isGod: false, 
    skill: '無特殊技能，需靠推理找出狼人。可在白天投票放逐嫌疑人。' 
  },
  SEER: { 
    id: 'seer', 
    name: '預言家', 
    team: 'good', 
    isGod: true, 
    skill: '每晚可查驗一名玩家，獲知其為「好人」或「狼人」。' 
  },
  WITCH: { 
    id: 'witch', 
    name: '女巫', 
    team: 'good', 
    isGod: true, 
    skill: '擁有一瓶解藥與一瓶毒藥。全程不可自救，且一晚僅能使用一瓶藥。' 
  },
  HUNTER: { 
    id: 'hunter', 
    name: '獵人', 
    team: 'good', 
    isGod: true, 
    skill: '死亡時可開槍帶走一人。若被女巫毒殺，則無法發動技能。' 
  },
  GUARD: { 
    id: 'guard', 
    name: '守衛', 
    team: 'good', 
    isGod: true, 
    skill: '每晚可守護一名玩家免受狼刀。不能連續兩晚守護同一人。' 
  },
};

const ROLE_SPRITE_POS = {
  seer: { x: '0%', y: '0%' },
  witch: { x: '33.33%', y: '0%' },
  hunter: { x: '66.66%', y: '0%' },
  guard: { x: '100%', y: '0%' },
  villager: { x: '0%', y: '100%' },
  werewolf: { x: '66.66%', y: '100%' },
};

// --- 2. 遊戲狀態管理 (Zustand) ---

type Player = {
  id: number;
  name: string;
  role: string;
  spritePos: { x: string; y: string };
  isAlive: boolean;
  isWolf: boolean;
  status: {
    protected: boolean;
    poisoned: boolean;
    saved: boolean;
    checked: boolean;
  };
};

type NightStep = 'GUARD' | 'WOLF' | 'WITCH' | 'SEER' | 'END';

type GameState = {
  phase: 'SETUP' | 'REVEAL' | 'PRE_NIGHT' | 'NIGHT_TRANSITION' | 'NIGHT' | 'HUNTER_SHOOT' | 'DAY' | 'VOTE' | 'GAME_OVER';
  players: Player[];
  config: {
    playerCount: number;
    selectedGods: string[];
    victoryMode: 'SIDE' | 'ALL';
    customNames: boolean;
    namesList: string[];
  };
  turnData: {
    revealIndex: number;
    nightStep: NightStep;
    nextStep: NightStep;
    nightActions: {
      guardTarget: number | null;
      wolfTarget: number | null;
      witchSaveUsed: boolean;
      witchPoisonUsed: boolean;
      witchAction: { type: 'SAVE' | 'POISON' | 'NONE', target: number | null };
      seerTarget: number | null;
    };
    dayLog: string[];
    lastDied: number[];
    hunterTrigger: 'NIGHT' | 'VOTE' | null;
    lastGuardTarget: number | null;
  };
  
  setConfig: (config: Partial<GameState['config']>) => void;
  startGame: () => void;
  nextReveal: () => void;
  enterNightSequence: () => void;
  confirmNightTransition: () => void;
  findNextNightStep: (currentStepIndex: number) => NightStep;
  handleNightAction: (role: string, targetId: number | null, extra?: any) => void;
  proceedToDay: () => void;
  handleHunterShoot: (targetId: number | null) => void;
  wolfSelfDestruct: (wolfId: number) => void;
  voteToKill: (playerId: number) => void;
  resetGame: () => void;
  checkWinCondition: (players: Player[]) => boolean;
};

const useGameStore = create<GameState>((set, get) => ({
  phase: 'SETUP',
  players: [],
  config: {
    playerCount: 6,
    selectedGods: ['seer', 'witch'],
    victoryMode: 'ALL', 
    customNames: false,
    namesList: Array(12).fill(''),
  },
  turnData: {
    revealIndex: 0,
    nightStep: 'GUARD',
    nextStep: 'GUARD',
    nightActions: {
      guardTarget: null,
      wolfTarget: null,
      witchSaveUsed: false,
      witchPoisonUsed: false,
      witchAction: { type: 'NONE', target: null },
      seerTarget: null,
    },
    dayLog: [],
    lastDied: [],
    hunterTrigger: null,
    lastGuardTarget: null,
  },

  setConfig: (newConfig) => set((state) => ({ config: { ...state.config, ...newConfig } })),

  startGame: () => {
    const { config } = get();
    let wolfCount = config.playerCount >= 10 ? 3 : 2;
    const godRoles = config.selectedGods;
    const villagerCount = config.playerCount - wolfCount - godRoles.length;

    let roles = [
      ...Array(wolfCount).fill('werewolf'),
      ...godRoles,
      ...Array(villagerCount).fill('villager')
    ];

    // Fisher-Yates Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    const players = roles.map((role, index) => {
      const customName = config.namesList[index]?.trim();
      const finalName = config.customNames && customName ? customName : `玩家 ${index + 1}`;
      
      let spritePos = { x: '0%', y: '0%' };
      if (role === 'villager') {
        spritePos = Math.random() < 0.5 ? { x: '0%', y: '100%' } : { x: '33.33%', y: '100%' };
      } else if (role === 'werewolf') {
        spritePos = Math.random() < 0.5 ? { x: '66.66%', y: '100%' } : { x: '100%', y: '100%' };
      } else {
        spritePos = ROLE_SPRITE_POS[role as keyof typeof ROLE_SPRITE_POS] || { x: '0%', y: '0%' };
      }

      return {
        id: index,
        name: finalName,
        role,
        spritePos,
        isAlive: true,
        isWolf: role === 'werewolf',
        status: { protected: false, poisoned: false, saved: false, checked: false }
      };
    });

    set({
      phase: 'REVEAL',
      players,
      turnData: {
        revealIndex: 0,
        nightStep: 'GUARD',
        nextStep: 'GUARD',
        nightActions: {
          guardTarget: null,
          wolfTarget: null,
          witchSaveUsed: false,
          witchPoisonUsed: false,
          witchAction: { type: 'NONE', target: null },
          seerTarget: null,
        },
        dayLog: [],
        lastDied: [],
        hunterTrigger: null,
        lastGuardTarget: null,
      }
    });
  },

  nextReveal: () => {
    const { turnData, players } = get();
    if (turnData.revealIndex < players.length - 1) {
      set((state) => ({
        turnData: { ...state.turnData, revealIndex: state.turnData.revealIndex + 1 }
      }));
    } else {
      set({ phase: 'PRE_NIGHT' });
    }
  },

  findNextNightStep: (currentIndex: number) => {
    const state = get();
    const steps: NightStep[] = ['GUARD', 'WOLF', 'WITCH', 'SEER', 'END'];
    const hasRole = (r: string) => state.players.some(p => p.role === r && p.isAlive);

    for (let i = currentIndex; i < steps.length; i++) {
      const s = steps[i];
      if (s === 'END') return 'END';
      if (s === 'WOLF') return 'WOLF';
      if (hasRole(s.toLowerCase())) return s;
    }
    return 'END';
  },

  enterNightSequence: () => {
    const { players, findNextNightStep } = get();
    const resetPlayers = players.map(p => ({
      ...p,
      status: { ...p.status, protected: false, poisoned: false, saved: false }
    }));

    const firstStep = findNextNightStep(0);

    set({
      phase: firstStep === 'END' ? 'DAY' : 'NIGHT_TRANSITION', 
      players: resetPlayers,
      turnData: {
        ...get().turnData,
        nightStep: firstStep,
        nextStep: firstStep,
        nightActions: {
          ...get().turnData.nightActions,
          guardTarget: null,
          wolfTarget: null,
          witchAction: { ...get().turnData.nightActions.witchAction, type: 'NONE', target: null },
          seerTarget: null
        },
        hunterTrigger: null, // Reset hunter trigger at night start
      }
    });

    if (firstStep === 'END') get().proceedToDay();
  },

  confirmNightTransition: () => {
    const { turnData } = get();
    set({ 
        phase: 'NIGHT',
        turnData: {
            ...turnData,
            nightStep: turnData.nextStep
        }
    });
  },

  handleNightAction: (role, targetId, extra = null) => {
    const state = get();
    const { turnData, findNextNightStep } = state;
    const actions = { ...turnData.nightActions };

    if (role === 'guard') actions.guardTarget = targetId;
    if (role === 'wolf') actions.wolfTarget = targetId;
    if (role === 'witch') {
      if (extra === 'SAVE') {
        actions.witchAction = { type: 'SAVE', target: targetId };
        actions.witchSaveUsed = true;
      } else if (extra === 'POISON') {
        actions.witchAction = { type: 'POISON', target: targetId };
        actions.witchPoisonUsed = true;
      } else {
        actions.witchAction = { type: 'NONE', target: null };
      }
    }
    if (role === 'seer') actions.seerTarget = targetId;

    const steps: NightStep[] = ['GUARD', 'WOLF', 'WITCH', 'SEER', 'END'];
    const currentIndex = steps.indexOf(turnData.nightStep);
    const nextStep = findNextNightStep(currentIndex + 1);

    set({ 
      phase: nextStep === 'END' ? 'DAY' : 'NIGHT_TRANSITION',
      turnData: { 
        ...turnData, 
        nightActions: actions,
        nextStep: nextStep
      } 
    });

    if (nextStep === 'END') {
      get().proceedToDay();
    }
  },

  proceedToDay: () => {
    const { players, turnData } = get();
    const { wolfTarget, guardTarget, witchAction } = turnData.nightActions;
    
    let deadIds: number[] = [];
    let log: string[] = [];
    let actualWolfKill = wolfTarget;

    // 守衛守護
    if (guardTarget === wolfTarget && guardTarget !== null) actualWolfKill = null; 
    // 女巫解藥 (同守同救判定通常是死，但這裡簡化為先救)
    if (witchAction.type === 'SAVE' && witchAction.target === wolfTarget) actualWolfKill = null;

    if (actualWolfKill !== null) {
      deadIds.push(actualWolfKill);
      log.push(`昨晚，${players[actualWolfKill].name} 死亡。`);
    }

    // 女巫毒藥
    if (witchAction.type === 'POISON' && witchAction.target !== null) {
      if (!deadIds.includes(witchAction.target)) {
        deadIds.push(witchAction.target);
        log.push(`昨晚，${players[witchAction.target].name} 死亡。`);
      }
    }

    if (deadIds.length === 0) log.push("昨晚是個平安夜，無人死亡。");

    // 更新玩家存活狀態
    const newPlayers = players.map(p => ({
      ...p,
      isAlive: deadIds.includes(p.id) ? false : p.isAlive
    }));

    // === 獵人技能邏輯 ===
    const hunterDied = deadIds.find(id => players[id].role === 'hunter');
    const hunterPoisoned = witchAction.type === 'POISON' && witchAction.target === hunterDied;
    
    let hunterTrigger: 'NIGHT' | 'VOTE' | null = null;

    if (hunterDied !== undefined && !hunterPoisoned) {
        log.push("獵人死亡，可發動技能。");
        hunterTrigger = 'NIGHT'; // 標記為夜晚觸發
    }

    set({
        phase: 'DAY', // 始終先進入白天
        players: newPlayers,
        turnData: {
            ...turnData,
            lastDied: deadIds,
            dayLog: log,
            hunterTrigger: hunterTrigger,
            lastGuardTarget: guardTarget // 記錄昨晚守護的人
        }
    });
    
    get().checkWinCondition(newPlayers);
  },

  handleHunterShoot: (targetId) => {
      const { players, turnData } = get();
      let newPlayers = [...players];
      let log = [...turnData.dayLog];
      let newDead = [...turnData.lastDied];

      // 如果有選擇目標 (開槍)
      if (targetId !== null) {
          newPlayers = newPlayers.map(p => p.id === targetId ? { ...p, isAlive: false } : p);
          log.push(`獵人開槍帶走了 ${players[targetId].name}。`);
          newDead.push(targetId);
      } else {
          log.push(`獵人選擇放棄開槍。`);
      }

      // 更新狀態
      set({
          players: newPlayers,
          turnData: { 
              ...turnData, 
              dayLog: log, 
              lastDied: newDead,
              hunterTrigger: null 
          }
      });

      // 檢查勝利條件
      if (get().checkWinCondition(newPlayers)) return;

      if (turnData.hunterTrigger === 'VOTE') {
          setTimeout(() => set({ phase: 'PRE_NIGHT' }), 2000);
      } else {
          set({ phase: 'DAY' });
      }
  },

  wolfSelfDestruct: (wolfId) => {
    const { players } = get();
    const newPlayers = players.map(p => p.id === wolfId ? { ...p, isAlive: false } : p);
    const log = [`狼人 ${players.find(p => p.id === wolfId)?.name} 選擇了自爆！`, "強制進入黑夜。"];

    set((state) => ({
      players: newPlayers,
      turnData: { ...state.turnData, dayLog: log, lastDied: [wolfId] }
    }));
    
    if (!get().checkWinCondition(newPlayers)) {
      setTimeout(() => set({ phase: 'PRE_NIGHT' }), 2000);
    }
  },

  voteToKill: (playerId) => {
    const { players } = get();
    const newPlayers = players.map(p => p.id === playerId ? { ...p, isAlive: false } : p);

    set((state) => ({
      players: newPlayers,
      turnData: { ...state.turnData, lastDied: [playerId], dayLog: [`${players[playerId].name} 被公投出局。`] }
    }));

    const isHunter = players[playerId].role === 'hunter';
    
    if (isHunter) {
          setTimeout(() => {
              set(state => ({
                  ...state,
                  phase: 'HUNTER_SHOOT',
                  turnData: { 
                      ...state.turnData, 
                      hunterTrigger: 'VOTE',
                      dayLog: [...state.turnData.dayLog, "獵人請發動技能。"] 
                  }
              }));
          }, 1000);
    } else {
        if (!get().checkWinCondition(newPlayers)) {
            setTimeout(() => set({ phase: 'PRE_NIGHT' }), 2000);
        }
    }
  },

  checkWinCondition: (currentPlayers) => {
    const { config } = get();
    const wolves = currentPlayers.filter(p => p.isWolf && p.isAlive);
    const gods = currentPlayers.filter(p => p.role !== 'werewolf' && p.role !== 'villager' && p.isAlive);
    const villagers = currentPlayers.filter(p => p.role === 'villager' && p.isAlive);
    const good = currentPlayers.filter(p => !p.isWolf && p.isAlive);

    let winner: 'NONE' | 'GOOD' | 'BAD' = 'NONE';
    let reason = '';

    if (wolves.length === 0) {
      winner = 'GOOD';
      reason = '所有狼人已死亡，好人勝利！';
    } else {
      if (good.length <= 1) {
        winner = 'BAD';
        reason = '好人數量過少，狼人綁票勝利！';
      } else {
        if (config.victoryMode === 'SIDE') {
          if (gods.length === 0) {
            winner = 'BAD';
            reason = '神職全滅，狼人勝利！';
          } else if (villagers.length === 0) {
            winner = 'BAD';
            reason = '平民全滅，狼人勝利！';
          }
        } else {
          if (good.length === 0) {
            winner = 'BAD';
            reason = '好人全滅，狼人勝利！';
          }
        }
      }
    }

    if (winner !== 'NONE') {
      set({ phase: 'GAME_OVER', turnData: { ...get().turnData, dayLog: [reason] } });
      return true;
    }
    return false;
  },

  resetGame: () => set({ phase: 'SETUP' }),
}));

// --- 3. 視覺背景組件 (星空 + 餘火) ---

const BackgroundEffect = () => {
  const stars = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 60, 
    size: Math.random() * 2 + 1,
    delay: Math.random() * 5,
    duration: Math.random() * 3 + 2
  })), []);

  const embers = useMemo(() => Array.from({ length: 25 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    size: Math.random() * 4 + 1,
    delay: Math.random() * 10,
    duration: Math.random() * 8 + 6
  })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#0f172a] to-[#2a0a0a]" />
        {stars.map((star) => (
            <motion.div
                key={`star-${star.id}`}
                className="absolute bg-white rounded-full"
                style={{
                    left: `${star.x}%`,
                    top: `${star.y}%`,
                    width: star.size,
                    height: star.size,
                    boxShadow: `0 0 ${star.size * 2}px rgba(255, 255, 255, 0.9)`
                }}
                animate={{ opacity: [0.1, 0.8, 0.1] }}
                transition={{ duration: star.duration, repeat: Infinity, delay: star.delay, ease: "easeInOut" }}
            />
        ))}
        <div className="absolute bottom-0 left-0 w-full h-[35%] bg-gradient-to-t from-orange-900/50 via-red-900/10 to-transparent blur-3xl opacity-80" />
        {embers.map((ember) => (
            <motion.div
                key={`ember-${ember.id}`}
                className="absolute rounded-full bg-orange-400 blur-[0.5px]"
                style={{
                    left: `${ember.x}%`,
                    bottom: -10,
                    width: ember.size,
                    height: ember.size,
                    boxShadow: '0 0 4px rgba(251, 146, 60, 0.8)'
                }}
                animate={{
                    y: -window.innerHeight * 0.7, 
                    x: [0, (Math.random() - 0.5) * 40, 0], 
                    opacity: [0, 1, 0],
                    scale: [1, 0.5]
                }}
                transition={{ duration: ember.duration, repeat: Infinity, delay: ember.delay, ease: "linear" }}
            />
        ))}
    </div>
  );
}

// --- 4. 共用 UI 組件 ---

const ConfirmModal = ({ 
    isOpen, title, content, onConfirm, onCancel, 
    confirmText = "確定", cancelText = "取消", isDanger = false 
}: any) => {
    if (!isOpen) return null;
    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
                onClick={onCancel}
            >
                <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                    className="bg-slate-900/90 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl backdrop-blur-xl relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                    <h3 className={`text-xl font-black mb-4 tracking-widest ${isDanger ? 'text-red-500' : 'text-amber-100'}`}>{title}</h3>
                    <p className="text-slate-300 text-sm mb-8 leading-relaxed font-medium">{content}</p>
                    <div className="flex gap-3">
                        {cancelText && (
                            <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-slate-800/50 border border-white/5 text-slate-300 font-bold hover:bg-slate-700/50 transition-colors">
                                {cancelText}
                            </button>
                        )}
                        {onConfirm && (
                            <button onClick={onConfirm} className={`flex-1 py-3 rounded-xl font-bold transition-all shadow-lg ${isDanger ? 'bg-gradient-to-r from-red-700 to-red-600 text-white shadow-red-900/20' : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-amber-900/20'}`}>
                                {confirmText}
                            </button>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

const Card = ({ role, spritePos, revealed, onClick }: { role: string, spritePos?: {x: string, y: string}, revealed: boolean, onClick: () => void }) => {
  const finalPos = spritePos || ROLE_SPRITE_POS[role as keyof typeof ROLE_SPRITE_POS] || { x: '0%', y: '100%' };

  return (
    <div className="relative w-64 max-w-[75vw] aspect-[2/3] cursor-pointer mx-auto group shrink-0" onClick={onClick} style={{ perspective: '1200px' }}>
      <motion.div
        className="w-full h-full relative"
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ duration: 0.8, type: "spring", stiffness: 200, damping: 25 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div 
          className="absolute w-full h-full rounded-2xl border border-amber-500/20 bg-black/80 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]"
          style={{ 
            transform: 'rotateY(180deg)', 
            backgroundImage: `url(${ASSETS.cardFront})`,
            backgroundSize: '400% 200%',
            backgroundPosition: `${finalPos.x} ${finalPos.y}`,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent pointer-events-none" />
        </div>
        <div 
          className="absolute w-full h-full rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
          style={{ 
            transform: 'rotateY(0deg)',
            backgroundImage: `url(${ASSETS.cardBack})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl" />
        </div>
      </motion.div>
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[80%] h-4 bg-black/60 blur-xl rounded-[100%]" />
    </div>
  );
};

// --- 5. 頁面組件 ---

const SetupScreen = () => {
  const { config, setConfig, startGame } = useGameStore();
  const [showRules, setShowRules] = useState(false);

  const totalPlayers = config.playerCount;
  const wolfCount = totalPlayers >= 10 ? 3 : 2;
  const godCount = config.selectedGods.length;
  const villagerCount = totalPlayers - wolfCount - godCount;
  const godCap = totalPlayers < 8 ? 2 : (totalPlayers < 10 ? 3 : 4);
  const isSideModeAvailable = totalPlayers >= 6;

  useEffect(() => {
    if (config.selectedGods.length > godCap) setConfig({ selectedGods: config.selectedGods.slice(0, godCap) });
  }, [godCap, config.selectedGods, setConfig]);

  useEffect(() => {
    if (!isSideModeAvailable && config.victoryMode === 'SIDE') setConfig({ victoryMode: 'ALL' });
  }, [totalPlayers, isSideModeAvailable, config.victoryMode, setConfig]);

  const toggleGod = (god: string) => {
    const isActive = config.selectedGods.includes(god);
    if (isActive) {
      setConfig({ selectedGods: config.selectedGods.filter(g => g !== god) });
    } else {
      if (config.selectedGods.length < godCap) setConfig({ selectedGods: [...config.selectedGods, god] });
    }
  };

  return (
    <div className="w-full max-w-md mx-auto h-full flex flex-col pt-safe pb-safe px-8 overflow-y-auto custom-scrollbar">
      <div className="text-center mb-6 mt-10">
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-500 tracking-[0.2em] drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)]">
          WEREWOLF
        </h1>
        <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent mx-auto mt-2" />
      </div>

      <div className="space-y-6 flex-1 pb-8">
        <div className="bg-slate-900/40 p-4 rounded-3xl border border-white/5 backdrop-blur-md shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <div className="flex flex-col">
                    <span className="text-amber-100/90 font-bold flex items-center gap-2 text-sm tracking-wider">
                        <Users size={16} /> 玩家人數
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono ml-6 mt-0.5">
                        (民{villagerCount} / 神{godCount} / 狼{wolfCount})
                    </span>
                </div>
                <span className="text-3xl font-black text-amber-500 drop-shadow-md font-mono">{config.playerCount}</span>
            </div>
            <input 
                type="range" min="5" max="12" step="1" 
                value={config.playerCount}
                onChange={(e) => setConfig({ playerCount: parseInt(e.target.value) })}
                className="w-full accent-amber-600 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
        </div>

        <div className="bg-slate-900/40 p-4 rounded-3xl border border-white/5 backdrop-blur-md shadow-lg">
            <h3 className="text-amber-100/90 font-bold mb-4 flex items-center justify-between text-sm tracking-wider">
                <span className="flex items-center gap-2"><Shield size={16}/> 神職配置</span>
                <span className="text-[10px] font-medium text-slate-400 border border-white/10 px-2 py-0.5 rounded-full bg-black/20">Max: {godCap}</span>
            </h3>
            <div className="grid grid-cols-2 gap-2">
            {[ { id: 'seer', label: '預言家' }, { id: 'witch', label: '女巫' }, { id: 'hunter', label: '獵人' }, { id: 'guard', label: '守衛' } ].map((role) => {
                const isSelected = config.selectedGods.includes(role.id);
                const isDisabled = !isSelected && config.selectedGods.length >= godCap;
                return (
                <button
                    key={role.id}
                    onClick={() => toggleGod(role.id)}
                    disabled={isDisabled}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between relative overflow-hidden group ${
                    isSelected 
                        ? 'bg-white/5 border-amber-500/50 text-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.1)]' 
                        : isDisabled 
                            ? 'bg-transparent border-white/5 text-slate-600 cursor-not-allowed opacity-40'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20'
                    }`}
                >
                    <span className="text-sm font-bold relative z-10">{role.label}</span>
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,1)] relative z-10" />}
                </button>
                )
            })}
            </div>
        </div>

        <div className="bg-slate-900/40 p-4 rounded-3xl border border-white/5 backdrop-blur-md shadow-lg">
            <h3 className="text-amber-100/90 font-bold mb-3 flex items-center gap-2 text-sm tracking-wider"><Crosshair size={16}/> 勝利模式</h3>
            <div className="flex gap-2 p-1 bg-black/40 rounded-xl mb-3 border border-white/5">
                <button onClick={() => setConfig({ victoryMode: 'ALL' })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${config.victoryMode === 'ALL' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>屠城</button>
                <button onClick={() => isSideModeAvailable && setConfig({ victoryMode: 'SIDE' })} disabled={!isSideModeAvailable} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${config.victoryMode === 'SIDE' ? 'bg-slate-700 text-white shadow-lg' : (!isSideModeAvailable ? 'text-slate-700 cursor-not-allowed' : 'text-slate-500 hover:text-slate-300')}`}>屠邊 {!isSideModeAvailable && '(需6人+)'}</button>
            </div>
            <p className="text-[10px] text-slate-400/80 text-center font-medium tracking-wide">
                {config.victoryMode === 'SIDE' ? '殺光所有 神職 或 所有 平民' : '殺光所有 好人'}
            </p>
        </div>

        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/40 rounded-2xl border border-white/5 backdrop-blur-sm">
            <span className="text-slate-300 text-xs font-bold tracking-wider">自訂名稱模式</span>
            <button onClick={() => setConfig({ customNames: !config.customNames })} className={`w-10 h-5 rounded-full transition-colors relative ${config.customNames ? 'bg-amber-600' : 'bg-white/10'}`}>
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-md ${config.customNames ? 'left-6' : 'left-1'}`} />
            </button>
        </div>

        {config.customNames && (
            <div className="grid grid-cols-2 gap-2 pb-4">
                {Array(config.playerCount).fill(0).map((_, i) => (
                    <input key={i} type="text" placeholder={`玩家 ${i+1}`} value={config.namesList[i] || ''} onChange={(e) => { const newNames = [...config.namesList]; newNames[i] = e.target.value; setConfig({ namesList: newNames }); }} className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-amber-100 placeholder:text-slate-600 focus:border-amber-600/50 outline-none transition-colors backdrop-blur-sm" />
                ))}
            </div>
        )}
      </div>

      <div className="flex gap-3 mt-4 mb-2 flex-none pb-4">
        <button onClick={() => setShowRules(true)} className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all flex items-center justify-center gap-2 backdrop-blur-md active:scale-95">
            <HelpCircle size={18} /> 
        </button>
        <button onClick={startGame} className="flex-[3] py-4 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-700 text-white font-black shadow-[0_0_20px_rgba(234,88,12,0.3)] hover:shadow-[0_0_30px_rgba(234,88,12,0.5)] transition-all flex items-center justify-center gap-2 backdrop-blur-md active:scale-95 tracking-wider">
            <Play size={18} fill="currentColor" /> 開始遊戲
        </button>
      </div>

      <AnimatePresence>
        {showRules && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6" onClick={() => setShowRules(false)}>
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-slate-900/90 border border-white/10 rounded-3xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-black text-amber-100 flex items-center gap-3 tracking-wider"><HelpCircle className="text-amber-500"/> 規則說明</h2>
                        <button onClick={() => setShowRules(false)} className="p-2 bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
                    </div>
                    {/* Rules Content Omitted for Brevity - Same as before */}
                    <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                        <section>
                            <h3 className="text-amber-500 font-bold mb-3 flex items-center gap-2 text-xs uppercase tracking-widest">勝利條件</h3>
                            <p className="pl-3 border-l-2 border-white/10 whitespace-pre-wrap">{config.victoryMode === 'SIDE' ? '屠邊：狼人需殺光所有「神職」或所有「平民」即可獲勝。' : '屠城：狼人需殺光所有好人。'}</p>
                        </section>
                        <section>
                            <h3 className="text-amber-500 font-bold mb-3 flex items-center gap-2 text-xs uppercase tracking-widest">角色技能</h3>
                            <ul className="pl-0 space-y-4">
                                {Object.values(ROLES).map(role => (
                                    <li key={role.id} className="bg-white/5 p-3 rounded-xl border border-white/5">
                                        <div className={`font-bold mb-1 ${role.isGod ? 'text-amber-200' : (role.team === 'bad' ? 'text-red-400' : 'text-slate-200')}`}>
                                            {role.name}
                                        </div>
                                        <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{role.skill}</div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// 重寫：RevealPhase (自然流動 + 無絕對定位)
const RevealPhase = () => {
  const { players, turnData, nextReveal } = useGameStore();
  const [flipped, setFlipped] = useState(false);
  const currentPlayer = players[turnData.revealIndex];
  const roleData = ROLES[currentPlayer.role.toUpperCase() as keyof typeof ROLES];
  const wolves = players.filter(p => p.isWolf && p.id !== currentPlayer.id);

  const handleClick = () => {
    if (flipped) { setFlipped(false); setTimeout(() => nextReveal(), 600); } else { setFlipped(true); }
  };

  return (
    <div className="w-full max-w-sm mx-auto h-full flex flex-col items-center pt-safe pb-safe px-8 overflow-y-auto custom-scrollbar">
      {/* 1. Header: 自然排列，增加頂部間距 */}
      <div className="text-center mt-6 mb-6 shrink-0">
        <h1 className="text-4xl font-black text-amber-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] tracking-widest">{currentPlayer.name}</h1>
      </div>

      {/* 2. Card: 自然排列 */}
      <div className="mb-4 shrink-0">
        <Card role={currentPlayer.role} spritePos={currentPlayer.spritePos} revealed={flipped} onClick={handleClick} />
      </div>

      {/* 3. Prompt: 緊跟卡牌 */}
      <p className="text-slate-400/80 text-[10px] mb-6 animate-pulse font-bold tracking-[0.2em] bg-black/30 px-4 py-1 rounded-full backdrop-blur-sm border border-white/5 shrink-0">
          {flipped ? '點擊牌面隱藏並傳遞' : '點擊牌面查看身分'}
      </p>

      {/* 4. Info Box: 自然跟隨在 Prompt 下方，無絕對定位，不遮擋 */}
      <AnimatePresence mode="wait">
        {flipped && (
            <motion.div 
                key="info"
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="w-full bg-slate-900/90 backdrop-blur-xl p-5 rounded-3xl border border-amber-500/30 text-center shadow-2xl shrink-0 mb-4"
            >
                <h3 className={`text-2xl font-black tracking-widest mb-2 ${roleData.team === 'bad' ? 'text-red-500 drop-shadow-sm' : (roleData.isGod ? 'text-amber-400 drop-shadow-sm' : 'text-slate-200')}`}>
                    {roleData.name}
                </h3>
                <p className="text-slate-300 text-xs font-medium leading-relaxed opacity-90 whitespace-pre-wrap">
                    {roleData.skill}
                </p>
                {currentPlayer.isWolf && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-red-500/70 text-[10px] font-bold uppercase tracking-widest mb-2">Wolf Teammates</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {wolves.length > 0 ? wolves.map(w => (
                                <span key={w.id} className="bg-red-950/50 px-2 py-1 rounded-lg text-red-200 text-[10px] font-bold border border-red-500/20">{w.name}</span>
                            )) : <span className="text-red-300/50 text-xs italic">孤狼</span>}
                        </div>
                    </div>
                )}
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const PreNightScreen = () => {
    const { enterNightSequence } = useGameStore();
    return (
        <div className="w-full h-full flex flex-col items-center justify-center pt-safe pb-safe px-8 gap-12">
            <div className="relative shrink-0">
                <div className="absolute inset-0 bg-sky-900/20 blur-[80px] rounded-full w-64 h-64 -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2" />
                <EyeOff className="w-24 h-24 text-slate-300/80 animate-pulse relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
            </div>
            <div className="space-y-4 text-center shrink-0">
                <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-slate-100 to-slate-500 tracking-[0.2em]">天黑請閉眼</h2>
                <p className="text-slate-400 text-sm font-medium tracking-widest border-t border-white/5 pt-4 inline-block px-8">NIGHT FALLS</p>
            </div>
            <button onClick={enterNightSequence} className="shrink-0 px-10 py-4 bg-white/5 border border-white/10 text-slate-200 font-bold rounded-full hover:bg-white/10 hover:scale-105 transition-all shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur-md active:scale-95">
                進入黑夜流程
            </button>
        </div>
    );
};

const NightTransitionScreen = () => {
    const { turnData, confirmNightTransition } = useGameStore();
    const stepNameMap: Record<string, string> = { 'GUARD': ROLES.GUARD.name, 'WOLF': ROLES.WEREWOLF.name, 'WITCH': ROLES.WITCH.name, 'SEER': ROLES.SEER.name };
    const roleName = stepNameMap[turnData.nextStep] || '';
    const getIcon = (step: string) => {
        switch(step) {
            case 'GUARD': return <Shield className="w-20 h-20 text-blue-300 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />;
            case 'WOLF': return <Skull className="w-20 h-20 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" />;
            case 'WITCH': return <FlaskConical className="w-20 h-20 text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" />;
            case 'SEER': return <Eye className="w-20 h-20 text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]" />;
            default: return <MoonStar className="w-20 h-20 text-slate-300" />;
        }
    }
    return (
        <div className="w-full h-full flex flex-col items-center justify-center pt-safe pb-safe px-8 gap-10">
            <div className="bg-slate-900/30 p-12 rounded-full border border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-md shrink-0">
                {getIcon(turnData.nextStep)}
            </div>
            <div className="space-y-3 text-center shrink-0">
                <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.3em]">Next Phase</p>
                <h2 className="text-4xl font-black text-slate-100 tracking-wider">請<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mx-3 text-5xl">{roleName}</span>睜眼</h2>
            </div>
            <button onClick={confirmNightTransition} className="w-full max-w-xs py-4 bg-gradient-to-r from-slate-200 to-slate-400 text-slate-900 font-black rounded-2xl hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95 shrink-0">
                我是 {roleName}，開始行動
            </button>
        </div>
    );
};

const NightPhase = () => {
  const { players, turnData, handleNightAction } = useGameStore();
  const { nightStep, nightActions } = turnData;
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [isSeerRevealed, setIsSeerRevealed] = useState(false);

  const getCurrentPlayerName = () => {
      if (nightStep === 'WOLF') return players.filter(p => p.isWolf && p.isAlive).map(p => p.name).join('、');
      return players.find(p => p.role === nightStep.toLowerCase() && p.isAlive)?.name || '未知'; 
  };

  useEffect(() => { setSelectedTarget(null); setIsSeerRevealed(false); }, [nightStep]);

  const livingPlayers = players.filter(p => p.isAlive);
  
  const getRoleInfo = (step: string) => {
    switch(step) {
      case 'GUARD': return { name: '守衛', icon: <Shield className="w-8 h-8 text-blue-300" />, tip: '請選擇今晚要守護的玩家' };
      case 'WOLF': return { name: '狼人', icon: <Skull className="w-8 h-8 text-red-500" />, tip: '請選擇今晚要獵殺的目標' };
      case 'WITCH': return { name: '女巫', icon: <FlaskConical className="w-8 h-8 text-purple-400" />, tip: '毒藥與解藥，今晚的抉擇是？' };
      case 'SEER': return { name: '預言家', icon: <Eye className="w-8 h-8 text-amber-300" />, tip: isSeerRevealed ? '查驗結果已現，請確認' : '請選擇要查驗的對象' };
      default: return { name: '', icon: null, tip: '' };
    }
  };
  const info = getRoleInfo(nightStep);

  const handleConfirm = () => {
    if (nightStep === 'SEER' && !isSeerRevealed && selectedTarget !== null) { setIsSeerRevealed(true); return; }
    handleNightAction(nightStep.toLowerCase(), selectedTarget);
  };

  const HeaderIdentity = () => (
      <div className="w-full py-4 bg-gradient-to-b from-black/60 to-transparent text-center z-10 shrink-0">
          <p className="text-amber-500/70 text-[10px] font-bold tracking-[0.2em] uppercase mb-1">Current Operator</p>
          <p className="text-slate-200 text-sm font-bold truncate px-4 tracking-wider shadow-black drop-shadow-md">{getCurrentPlayerName()}</p>
      </div>
  );

  if (nightStep === 'WITCH') {
    const wolfTarget = nightActions.wolfTarget;
    const witchPlayer = players.find(p => p.role === 'witch');
    const isSelfSave = wolfTarget === witchPlayer?.id;

    return (
      <div className="w-full max-w-md mx-auto h-full flex flex-col items-center pt-safe pb-safe overflow-y-auto custom-scrollbar">
        <HeaderIdentity />
        <div className="text-center space-y-3 mb-6 mt-2 shrink-0">
          <div className="flex justify-center drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]">{info.icon}</div>
          <h2 className="text-4xl font-black text-slate-100 tracking-widest">{info.name}時間</h2>
        </div>

        <div className="w-full space-y-5 px-8 flex-1 pb-8">
          <div className="bg-slate-900/60 p-5 rounded-3xl border border-purple-500/20 shadow-xl backdrop-blur-md relative overflow-hidden">
            <h3 className="text-green-400 font-bold mb-3 flex items-center gap-2 text-lg">🟢 生命解藥</h3>
            {!nightActions.witchSaveUsed && wolfTarget !== null ? (
              <div className="space-y-3">
                <p className="text-slate-300 text-sm">今晚被襲擊的是 <span className="text-red-400 font-black text-base">{players[wolfTarget].name}</span>，要使用解藥嗎？</p>
                {isSelfSave ? (
                    <button disabled className="w-full py-3 bg-slate-800/50 text-slate-500 rounded-2xl font-bold cursor-not-allowed border border-white/5">無法自救</button>
                ) : (
                    <button onClick={() => handleNightAction('witch', wolfTarget, 'SAVE')} className="w-full py-3 bg-green-600/20 border border-green-500/50 text-green-100 rounded-2xl font-bold transition-all shadow-[0_0_15px_rgba(34,197,94,0.2)] hover:bg-green-600/30">救活該玩家</button>
                )}
              </div>
            ) : (
              <p className="text-slate-500 text-xs italic bg-black/20 p-3 rounded-xl border border-white/5">今晚無人被殺，或解藥已失效。</p>
            )}
          </div>

          <div className="bg-slate-900/60 p-5 rounded-3xl border border-purple-500/20 shadow-xl backdrop-blur-md relative overflow-hidden">
            <h3 className="text-red-400 font-bold mb-3 flex items-center gap-2 text-lg">🔴 死亡毒藥</h3>
            {!nightActions.witchPoisonUsed ? (
              <div className="space-y-3">
                <p className="text-slate-400 text-[10px] uppercase tracking-widest border-b border-white/5 pb-2">Select Target to Poison</p>
                <div className="grid grid-cols-3 gap-2">
                  {livingPlayers.map(p => (
                    <button key={p.id} onClick={() => handleNightAction('witch', p.id, 'POISON')} className="py-3 bg-slate-900/80 border border-white/10 text-slate-300 text-xs rounded-xl hover:border-red-500/50 hover:text-red-400 hover:bg-red-950/30 transition-all font-bold">{p.name}</button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-xs italic bg-black/20 p-3 rounded-xl border border-white/5">毒藥已使用過。</p>
            )}
          </div>
        </div>
        
        <div className="px-8 pb-6 w-full mt-4 shrink-0">
            <button onClick={() => handleNightAction('witch', null, 'NONE')} className="w-full py-4 bg-white/5 text-slate-400 rounded-2xl font-bold border border-white/10 active:scale-95 transition-all hover:bg-white/10">跳過所有藥劑</button>
        </div>
      </div>
    );
  }

  // 一般角色
  return (
    <div className="w-full max-w-md mx-auto h-full flex flex-col items-center pt-safe pb-safe px-8 overflow-hidden">
      <HeaderIdentity />
      <div className="text-center mb-6 mt-2 space-y-2 shrink-0">
        <div className="flex justify-center mb-2 animate-bounce duration-[3000ms] drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">{info.icon}</div>
        <h2 className="text-4xl font-black text-slate-100 tracking-widest drop-shadow-md">{info.name}階段</h2>
        <p className="text-amber-200/60 text-xs font-bold tracking-wider">{info.tip}</p>
      </div>

      <div className="w-full flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0 pb-4 p-2">
        <div className="grid grid-cols-3 gap-3">
            {players.map((p) => {
            const isAlive = p.isAlive;
            const isSelected = selectedTarget === p.id;
            const isSeerSelf = nightStep === 'SEER' && p.role === 'seer';
            const isGuardBan = nightStep === 'GUARD' && p.id === turnData.lastGuardTarget;
            const isDisabled = !isAlive || (nightStep === 'SEER' && isSeerRevealed) || isSeerSelf || isGuardBan;

            return (
                <button
                key={p.id}
                disabled={isDisabled}
                onClick={() => setSelectedTarget(p.id)}
                className={`relative p-3 rounded-2xl border transition-all flex flex-col items-center gap-2 shadow-sm backdrop-blur-sm group overflow-hidden ${isDisabled && !isSelected ? 'opacity-30 border-transparent grayscale cursor-not-allowed bg-black/20' : ''} ${isSelected ? 'bg-amber-600/20 border-amber-500 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.2)] scale-105' : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/20 hover:bg-white/5'}`}
                >
                {isSelected && <div className="absolute inset-0 bg-amber-500/10 animate-pulse" />}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-colors z-10 ${isSelected ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700'}`}>{p.id + 1}</div>
                <span className="text-xs font-bold truncate w-full text-center z-10">{p.name}</span>
                {isGuardBan && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_5px_rgba(239,68,68,1)]" />}
                </button>
            )
            })}
        </div>
      </div>

      <div className="w-full space-y-3 pt-6 shrink-0 pb-6">
        {nightStep === 'SEER' && isSeerRevealed && selectedTarget !== null ? (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full space-y-4">
            <div className="bg-black/60 p-5 rounded-3xl border border-amber-500/30 text-center shadow-2xl backdrop-blur-xl">
                <p className="text-slate-500 text-[10px] font-bold mb-2 uppercase tracking-[0.2em]">Verification Result</p>
                <p className={`text-3xl font-black ${players[selectedTarget].isWolf ? 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]' : 'text-green-400 drop-shadow-[0_0_20px_rgba(74,222,128,0.6)]'}`}>{players[selectedTarget].isWolf ? '狼人' : '好人'}</p>
            </div>
            <button onClick={handleConfirm} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-2xl shadow-xl transition-all">確認並閉眼</button>
            </motion.div>
        ) : (
            <button disabled={selectedTarget === null && nightStep !== 'GUARD'} onClick={handleConfirm} className={`w-full py-4 rounded-2xl font-black shadow-xl transition-all active:scale-95 tracking-wider ${selectedTarget !== null ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-amber-900/30' : 'bg-slate-800/50 text-slate-500 border border-white/5 cursor-not-allowed'}`}>
            {nightStep === 'SEER' ? '確認查驗' : '確認選擇'}
            </button>
        )}
        {nightStep === 'GUARD' && ( <button onClick={() => handleNightAction('guard', null)} className="w-full text-slate-500/60 text-xs font-bold py-3 hover:text-slate-300 transition-colors">放棄守護 (空守)</button> )}
      </div>
    </div>
  );
};

// 獵人、白天、投票階段：使用 flex-1 的列表和固定底部的按鈕 (不強制 mt-auto，而是間距)
const HunterShootPhase = () => {
    const { players, handleHunterShoot } = useGameStore();
    const [selected, setSelected] = useState<number | null>(null);
    const [modalConfig, setModalConfig] = useState<any>({});
    const livingPlayers = players.filter(p => p.isAlive);

    return (
        <div className="w-full max-w-md mx-auto h-full flex flex-col pt-safe pb-safe px-8 overflow-hidden">
             <div className="text-center mb-6 mt-4 shrink-0">
                <Target className="w-16 h-16 text-red-600 mx-auto animate-pulse drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
                <h2 className="text-4xl font-black text-red-500 tracking-widest uppercase drop-shadow-md">獵人開槍</h2>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0 pb-4 p-2">
                <div className="grid grid-cols-2 gap-3">
                    {livingPlayers.map(p => (
                        <button key={p.id} onClick={() => setSelected(p.id)} className={`p-5 rounded-2xl border flex flex-col items-center gap-3 transition-all active:scale-95 backdrop-blur-sm ${selected === p.id ? 'bg-red-900/30 border-red-500 text-red-100 shadow-[0_0_20px_rgba(220,38,38,0.2)]' : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/20'}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition-colors ${selected === p.id ? 'bg-red-600 shadow-lg' : 'bg-slate-800'}`}>{p.id + 1}</div>
                            <span className="font-bold truncate w-full text-center">{p.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3 mt-4 mb-2 shrink-0 pb-6">
                 <button disabled={selected === null} onClick={() => selected !== null && setModalConfig({ isOpen: true, title: "確認開槍", content: `確定要帶走 ${players[selected].name} 嗎？`, onConfirm: () => handleHunterShoot(selected) })} className={`w-full py-4 rounded-2xl font-black shadow-xl transition-all tracking-wider ${selected !== null ? 'bg-gradient-to-r from-red-700 to-red-500 text-white active:scale-95 shadow-red-900/30' : 'bg-slate-800/50 text-slate-600 border border-white/5 cursor-not-allowed'}`}>確認射擊</button>
                <button onClick={() => setModalConfig({ isOpen: true, title: "確認放棄", content: `確定不發動技能嗎？`, onConfirm: () => handleHunterShoot(null) })} className="w-full py-4 rounded-2xl bg-white/5 text-slate-400 font-bold border border-white/10 active:scale-95 transition-all hover:bg-white/10">放棄開槍</button>
            </div>
            <ConfirmModal {...modalConfig} onCancel={() => setModalConfig({ ...modalConfig, isOpen: false })} isDanger={true} confirmText="確定" />
        </div>
    );
};

const DayPhase = () => {
    const { players, turnData, wolfSelfDestruct } = useGameStore();
    const [view, setView] = useState<'ANNOUNCE' | 'DISCUSS'>('ANNOUNCE');
    const [modalConfig, setModalConfig] = useState<any>({});
    const [showSelfDestructPicker, setShowSelfDestructPicker] = useState(false);
  
    if (view === 'ANNOUNCE') {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center px-8 text-center space-y-10 animate-in fade-in duration-700 pt-safe pb-safe">
          <div className="relative">
            <Sun className="w-24 h-24 text-amber-100 animate-pulse drop-shadow-[0_0_30px_rgba(251,191,36,0.6)]" />
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border border-dashed border-amber-200/30 rounded-full scale-150" />
          </div>
          <h2 className="text-5xl font-black text-slate-100 tracking-widest drop-shadow-lg">天亮了</h2>
          <div className="bg-slate-900/60 p-8 rounded-3xl border border-white/10 w-full max-w-md shadow-2xl backdrop-blur-md min-h-[120px] flex flex-col justify-center items-center overflow-y-auto max-h-[40vh]">
            {turnData.dayLog.map((log, i) => <p key={i} className="text-lg text-slate-200 font-bold py-1 leading-relaxed">{log}</p>)}
          </div>
          <div className="space-y-4 w-full max-w-xs">
            {turnData.lastDied.length > 0 && <div className="bg-amber-500/10 text-amber-200 px-4 py-2 rounded-full text-xs font-bold border border-amber-500/30 w-full">請倒牌者發表遺言</div>}
            <button onClick={() => setView('DISCUSS')} className="w-full px-10 py-4 bg-white text-slate-900 rounded-2xl font-black shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-105 transition-all">開啟討論環節</button>
          </div>
        </div>
      )
    }

    const handleSelfDestructAttempt = (player: Player) => {
        setShowSelfDestructPicker(false);
        if (player.isWolf) {
            setModalConfig({ isOpen: true, title: "確認自爆", content: `確定讓 ${player.name} 自爆嗎？此動作無法復原。`, onConfirm: () => wolfSelfDestruct(player.id), isDanger: true, confirmText: "確定自爆", cancelText: "取消" });
        } else {
            setModalConfig({ isOpen: true, title: "操作無效", content: `${player.name} 不是狼人，無法執行自爆戰術。`, onConfirm: () => {}, confirmText: undefined, cancelText: "知道了", isDanger: false });
        }
    };
  
    return (
      <div className="w-full max-w-md mx-auto h-full flex flex-col pt-safe pb-safe px-8 overflow-hidden">
        <div className="flex items-center justify-between mb-6 mt-4 shrink-0">
          <h2 className="text-2xl font-black text-amber-100 flex items-center gap-2 tracking-wider"><Users size={24} className="text-amber-500"/> 生還名單</h2>
          <div className="px-3 py-1 bg-green-900/30 rounded-full text-[10px] font-mono text-green-300 border border-green-500/30">STAY ALIVE</div>
        </div>
  
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0 pb-4 p-2">
            <div className="grid grid-cols-2 gap-3 pb-4">
                {players.filter(p => p.isAlive).map(p => (
                <div key={p.id} className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl flex items-center justify-between shadow-sm backdrop-blur-sm">
                    <span className="text-slate-100 font-bold truncate">{p.name}</span>
                    <span className="text-[10px] text-slate-500 font-black ml-2 bg-black/30 px-2 py-1 rounded">#{p.id + 1}</span>
                </div>
                ))}
            </div>
        </div>
  
        <div className="mt-4 mb-2 space-y-4 shrink-0 pb-6">
            {turnData.hunterTrigger === 'NIGHT' && (
                 <button onClick={() => useGameStore.setState({ phase: 'HUNTER_SHOOT' })} className="w-full py-4 bg-amber-600/80 text-white font-black rounded-2xl shadow-[0_0_15px_rgba(245,158,11,0.4)] flex items-center justify-center gap-2 active:scale-95 transition-all animate-pulse border border-amber-500/50">
                    <Target size={20}/> 獵人發動技能
                </button>
            )}
            <button onClick={() => useGameStore.setState({ phase: 'VOTE' })} className="w-full py-5 bg-gradient-to-r from-amber-600 to-orange-700 text-white font-black rounded-3xl shadow-[0_5px_20px_rgba(234,88,12,0.3)] flex items-center justify-center gap-3 active:scale-95 transition-all border border-white/10">
                <Gavel size={20}/> 進入放逐投票
            </button>
            <button onClick={() => setShowSelfDestructPicker(true)} className="w-full py-4 bg-red-950/20 border border-red-900/30 text-red-400/80 font-bold rounded-2xl hover:bg-red-900/30 transition-all flex items-center justify-center gap-2 active:scale-95 text-xs tracking-widest">
                <AlertTriangle size={16}/> 登記狼人自爆
            </button>
        </div>

        <AnimatePresence>
            {showSelfDestructPicker && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6" onClick={() => setShowSelfDestructPicker(false)}>
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-sm w-full max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-black text-red-500 mb-2 text-center flex items-center justify-center gap-2 tracking-wider"><Skull size={20}/> 誰選擇自爆？</h3>
                        <p className="text-slate-500 text-xs text-center mb-6">請點擊宣告自爆的玩家名稱</p>
                        <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 mb-6 flex-1">
                            {players.filter(p => p.isAlive).map(p => ( <button key={p.id} onClick={() => handleSelfDestructAttempt(p)} className="p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 font-bold hover:bg-red-900/20 hover:border-red-500/30 hover:text-red-200 transition-colors">{p.name}</button> ))}
                        </div>
                        <button onClick={() => setShowSelfDestructPicker(false)} className="w-full py-3 rounded-xl bg-slate-800 text-slate-400 font-bold hover:bg-slate-700 transition-colors">取消</button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
        <ConfirmModal {...modalConfig} onCancel={() => setModalConfig({ ...modalConfig, isOpen: false })} isDanger={modalConfig.isDanger} confirmText={modalConfig.confirmText} />
      </div>
    );
};

const VotePhase = () => {
  const { players, voteToKill } = useGameStore();
  const livingPlayers = players.filter(p => p.isAlive);
  const [selected, setSelected] = useState<number | null>(null);
  const [modalConfig, setModalConfig] = useState<any>({});

  return (
    <div className="w-full max-w-md mx-auto h-full flex flex-col pt-safe pb-safe px-8 overflow-hidden">
      <div className="text-center mb-6 mt-4 shrink-0">
        <h2 className="text-4xl font-black text-amber-500 tracking-[0.2em] uppercase drop-shadow-[0_2px_10px_rgba(245,158,11,0.4)]">Vote Out</h2>
        <p className="text-slate-400 text-xs font-bold mt-2 tracking-wider">請在線下完成投票討論，點擊被放逐者</p>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0 pb-4 p-2">
          <div className="grid grid-cols-2 gap-4 pb-4">
            {livingPlayers.map(p => (
            <button key={p.id} onClick={() => setSelected(p.id)} className={`p-5 rounded-3xl border flex flex-col items-center gap-3 transition-all active:scale-95 backdrop-blur-sm ${selected === p.id ? 'bg-red-900/30 border-red-600 text-red-100 shadow-[0_0_20px_rgba(220,38,38,0.3)]' : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/20'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition-colors ${selected === p.id ? 'bg-red-600 shadow-md' : 'bg-slate-800'}`}>{p.id + 1}</div>
                <span className="font-bold truncate w-full text-center">{p.name}</span>
            </button>
            ))}
          </div>
      </div>

      <div className="space-y-3 mt-4 mb-2 shrink-0 pb-6">
        <button disabled={selected === null} onClick={() => selected !== null && setModalConfig({ isOpen: true, title: "確認放逐", content: `確定要放逐 ${players[selected].name} 嗎？`, onConfirm: () => voteToKill(selected), isDanger: true })} className={`w-full py-4 rounded-3xl font-black flex items-center justify-center gap-3 shadow-2xl transition-all border border-white/10 ${selected !== null ? 'bg-gradient-to-r from-red-700 to-red-600 text-white active:scale-95 shadow-red-900/30' : 'bg-slate-800/50 text-slate-600 grayscale cursor-not-allowed'}`}>
          <Gavel size={20} /> 確認處決被放逐者
        </button>
        <button onClick={() => setModalConfig({ isOpen: true, title: "確認平安日", content: "確定今晚無人出局（平安日）？", onConfirm: () => useGameStore.getState().enterNightSequence(), isDanger: false })} className="w-full py-3 rounded-2xl bg-white/5 text-slate-400 font-bold border border-white/10 active:scale-95 transition-all hover:bg-white/10">
          平安日 (無人出局)
        </button>
      </div>
      <ConfirmModal {...modalConfig} onCancel={() => setModalConfig({ ...modalConfig, isOpen: false })} isDanger={modalConfig.isDanger} />
    </div>
  )
};

const GameOverScreen = () => {
  const { turnData, resetGame, players } = useGameStore();
  const reason = turnData.dayLog[0] || "遊戲結束";
  const isGoodWin = reason.includes("好人");
  const wolves = players.filter(p => p.isWolf);
  const gods = players.filter(p => p.role !== 'werewolf' && p.role !== 'villager');

  return (
    <div className="w-full h-full flex flex-col items-center justify-center pt-safe pb-safe px-8 overflow-y-auto">
      <div className="relative mb-10 shrink-0">
        <h1 className={`text-7xl font-black italic tracking-tighter drop-shadow-2xl ${isGoodWin ? 'text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600' : 'text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-900'}`}>{isGoodWin ? 'VICTORY' : 'DEFEAT'}</h1>
        <div className={`absolute -top-6 -right-4 px-3 py-1 font-black text-[10px] skew-x-[-15deg] uppercase border ${isGoodWin ? 'bg-amber-500 text-black border-amber-400' : 'bg-red-600 text-white border-red-500'}`}>Game Finished</div>
      </div>
      <p className="text-2xl text-white font-bold mb-12 text-center drop-shadow-lg tracking-wider shrink-0">{reason}</p>
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl p-8 rounded-3xl border border-white/10 space-y-8 shadow-2xl relative overflow-hidden shrink-0">
        <div>
          <h3 className="text-red-500 font-black flex items-center gap-2 mb-4 uppercase tracking-widest border-b border-white/5 pb-2 text-sm"><Skull size={16} /> 狼人陣營</h3>
          <div className="flex flex-wrap gap-2">{wolves.map(p => (<span key={p.id} className="bg-red-950/40 text-red-200 px-4 py-2 rounded-xl text-xs font-bold border border-red-500/20 shadow-inner">{p.name}</span>))}</div>
        </div>
        <div>
          <h3 className="text-amber-500 font-black flex items-center gap-2 mb-4 uppercase tracking-widest border-b border-white/5 pb-2 text-sm"><Shield size={16} /> 神職陣營</h3>
          <div className="flex flex-wrap gap-3">{gods.map(p => (<div key={p.id} className="bg-amber-950/40 text-amber-200 px-4 py-2 rounded-xl text-xs font-bold border border-amber-500/20 flex items-center gap-2 shadow-inner">{p.name} <span className="opacity-40 text-[10px] uppercase">{ROLES[p.role.toUpperCase() as keyof typeof ROLES]?.name}</span></div>))}</div>
        </div>
      </div>
      <button onClick={resetGame} className="mt-14 px-12 py-5 bg-white text-black font-black rounded-3xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.2)] shrink-0">
        <Repeat size={20} /> 返回設定主選單
      </button>
    </div>
  )
}

// --- App 入口 ---

export default function App() {
  const { phase } = useGameStore(); 

  return (
    <div className="fixed inset-0 w-full h-full bg-black text-slate-200 font-sans selection:bg-amber-500/30 overflow-hidden">
      <BackgroundEffect />
      <main className="relative z-10 w-full h-full flex flex-col">
        <AnimatePresence mode='wait'>
          <motion.div
            key={phase}
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
            transition={{ duration: 0.5, ease: "circOut" }}
            className="w-full h-full"
          >
            {(() => {
              switch(phase) {
                case 'SETUP': return <SetupScreen />;
                case 'REVEAL': return <RevealPhase />;
                case 'PRE_NIGHT': return <PreNightScreen />;
                case 'NIGHT_TRANSITION': return <NightTransitionScreen />;
                case 'NIGHT': return <NightPhase />;
                case 'HUNTER_SHOOT': return <HunterShootPhase />;
                case 'DAY': return <DayPhase />;
                case 'VOTE': return <VotePhase />;
                case 'GAME_OVER': return <GameOverScreen />;
                default: return null;
              }
            })()}
          </motion.div>
        </AnimatePresence>
      </main>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .pb-safe { padding-bottom: calc(1.5rem + env(safe-area-inset-bottom)); }
        .pt-safe { padding-top: max(env(safe-area-inset-top), 20px); }
      `}</style>
    </div>
  );
}