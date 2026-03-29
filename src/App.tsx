import { useState } from 'react';
import Icon from '@/components/ui/icon';

// ─── Types ───────────────────────────────────────────────────────────────────

type Suit = '♠' | '♥' | '♦' | '♣';
type CardValue = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
type Card = { value: CardValue; suit: Suit } | null;
type Tab = 'blackjack' | 'dice' | 'poker' | 'roulette' | 'support';
type DiceResult = 'WIN' | 'DRAW' | 'LOST';
type Suggestion = 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT' | 'BUST';

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_VALUES: CardValue[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RED_SUITS: Suit[] = ['♥', '♦'];

// ─── Utils ────────────────────────────────────────────────────────────────────

function cardNumericValue(v: CardValue): number {
  if (['J', 'Q', 'K'].includes(v)) return 10;
  if (v === 'A') return 11;
  return parseInt(v);
}

function calcScore(cards: Card[]): number {
  let score = 0;
  let aces = 0;
  for (const c of cards) {
    if (!c) continue;
    const v = cardNumericValue(c.value);
    score += v;
    if (c.value === 'A') aces++;
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

// ─── Win Chance Calculator ────────────────────────────────────────────────────

// Таблица преимущества диллера по открытой карте (базовая стратегия, 6 колод)
// Значение = базовый шанс ПОБЕДЫ игрока при оптимальной игре
const DEALER_CARD_WIN_BASE: Record<number, number> = {
  2: 64, 3: 66, 4: 68, 5: 70, 6: 71,   // слабые карты диллера
  7: 58, 8: 55, 9: 50, 10: 44, 11: 40,  // сильные (10=10,J,Q,K; 11=A)
};

function calcWinChance(playerCards: Card[], dealerCard: Card | null): number | null {
  const filled = playerCards.filter(Boolean);
  if (filled.length < 2 || !dealerCard) return null;

  const playerScore = calcScore(playerCards);
  if (playerScore > 21) return 0;
  if (playerScore === 21) return filled.length === 2 ? 98 : 92; // блэкджек / 21

  const dv = Math.min(cardNumericValue(dealerCard.value), 11);
  let base = DEALER_CARD_WIN_BASE[dv] ?? 50;

  // Корректировки по счёту игрока
  if (playerScore >= 20) base += 12;
  else if (playerScore >= 19) base += 8;
  else if (playerScore >= 18) base += 4;
  else if (playerScore >= 17) base += 1;
  else if (playerScore <= 11) base -= 5; // ещё добираем карты — риск
  else if (playerScore <= 13) base -= 3;

  // Мягкая рука (с тузом): меньше риск перебора
  const hasAce = filled.some(c => (c as NonNullable<Card>).value === 'A');
  const isSoft = hasAce && playerScore <= 21;
  if (isSoft && playerScore >= 17 && playerScore <= 19) base += 3;

  return Math.max(5, Math.min(97, Math.round(base)));
}

function getSuggestion(playerCards: Card[], dealerCard: Card | null, canSplit: boolean, canDouble: boolean): Suggestion {
  const filled = playerCards.filter(Boolean) as NonNullable<Card>[];
  const score = calcScore(playerCards);

  if (score > 21) return 'BUST';

  if (canSplit && filled.length === 2) {
    const v1 = filled[0].value;
    const v2 = filled[1].value;
    const sameGroup = (a: CardValue, b: CardValue) => {
      const face = ['J', 'Q', 'K', '10'];
      if (face.includes(a) && face.includes(b)) return true;
      return a === b;
    };
    if (sameGroup(v1, v2)) {
      if (v1 === 'A' || v1 === '8') return 'SPLIT';
      const dv = dealerCard ? cardNumericValue(dealerCard.value) : 0;
      if (v1 === '9' && ![7, 10, 11].includes(dv)) return 'SPLIT';
      if (v1 === '7' && dv <= 7) return 'SPLIT';
      if (v1 === '6' && dv <= 6) return 'SPLIT';
      if (v1 === '3' && dv <= 7) return 'SPLIT';
      if (v1 === '2' && dv <= 7) return 'SPLIT';
    }
  }

  const dv = dealerCard ? cardNumericValue(dealerCard.value) : 0;

  if (canDouble && filled.length === 2) {
    if (score === 11) return 'DOUBLE';
    if (score === 10 && dv <= 9) return 'DOUBLE';
    if (score === 9 && dv >= 3 && dv <= 6) return 'DOUBLE';
    const hasAce = filled.some(c => c.value === 'A');
    if (hasAce) {
      const other = filled.find(c => c.value !== 'A');
      if (other) {
        const ov = cardNumericValue(other.value);
        if (ov === 6 && dv >= 3 && dv <= 6) return 'DOUBLE';
        if (ov === 5 && dv >= 4 && dv <= 6) return 'DOUBLE';
        if (ov === 4 && dv >= 4 && dv <= 6) return 'DOUBLE';
        if (ov === 3 && dv >= 5 && dv <= 6) return 'DOUBLE';
        if (ov === 2 && dv >= 5 && dv <= 6) return 'DOUBLE';
        if (ov === 7 && dv >= 3 && dv <= 6) return 'DOUBLE';
      }
    }
  }

  if (score >= 17) return 'STAND';
  if (score >= 13 && dv <= 6) return 'STAND';
  if (score === 12 && dv >= 4 && dv <= 6) return 'STAND';
  return 'HIT';
}

// ─── Card Picker Popup ────────────────────────────────────────────────────────

interface CardPickerProps {
  onSelect: (card: Card) => void;
  onClear: () => void;
  onClose: () => void;
  hasCard: boolean;
}

function CardPicker({ onSelect, onClear, onClose, hasCard }: CardPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-xl gold-border animate-fade-in"
        style={{ background: '#1A1A1A' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b" style={{ borderColor: 'var(--gold-border)' }}>
          <div className="flex items-center justify-between">
            <span className="font-display text-sm tracking-widest gold-text">ВЫБОР КАРТЫ</span>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
              <Icon name="X" size={18} />
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-4 gap-2 mb-4 max-h-80 overflow-y-auto scrollbar-hide">
            {SUITS.map(suit => (
              <div key={suit} className="space-y-1.5">
                {CARD_VALUES.map(val => (
                  <button
                    key={val + suit}
                    onClick={() => onSelect({ value: val, suit })}
                    className="w-full py-1.5 rounded text-sm font-display tracking-wide transition-all hover:scale-105 active:scale-95"
                    style={{
                      background: 'var(--bg-slot)',
                      border: '1px solid rgba(255,215,0,0.2)',
                      color: RED_SUITS.includes(suit) ? 'var(--red-card)' : 'var(--text-main)',
                    }}
                  >
                    {val}{suit}
                  </button>
                ))}
              </div>
            ))}
          </div>
          {hasCard && (
            <button
              onClick={onClear}
              className="w-full py-2 rounded btn-ghost text-sm font-display tracking-wide"
            >
              Очистить слот
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Card Slot ────────────────────────────────────────────────────────────────

interface CardSlotProps {
  card: Card;
  hidden?: boolean;
  onClick?: () => void;
  locked?: boolean;
  size?: 'sm' | 'md';
  label?: string;
}

function CardSlot({ card, hidden, onClick, locked, size = 'md', label }: CardSlotProps) {
  const w = size === 'md' ? 'w-14' : 'w-11';
  const h = size === 'md' ? 'h-20' : 'h-16';
  const textSize = size === 'md' ? 'text-base' : 'text-sm';

  if (hidden) {
    return (
      <div className="flex flex-col items-center gap-1">
        {label && <span className="text-xs font-display tracking-widest" style={{ color: 'var(--text-dim)' }}>{label}</span>}
        <div
          className={`card-slot ${w} ${h} flex flex-col items-center justify-center gap-0.5`}
          style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}
        >
          <span className="text-lg" style={{ color: 'var(--gold)', opacity: 0.5 }}>?</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {label && <span className="text-xs font-display tracking-widest" style={{ color: 'var(--text-dim)' }}>{label}</span>}
      <div
        className={`card-slot ${w} ${h} ${locked ? 'locked' : ''} ${card ? 'active' : ''} flex flex-col items-center justify-center`}
        onClick={!locked ? onClick : undefined}
      >
        {card ? (
          <div className="flex flex-col items-center leading-none">
            <span
              className={`font-display font-bold ${textSize} leading-tight`}
              style={{ color: RED_SUITS.includes(card.suit) ? 'var(--red-card)' : 'var(--text-main)' }}
            >
              {card.value}
            </span>
            <span
              className="text-lg leading-tight"
              style={{ color: RED_SUITS.includes(card.suit) ? 'var(--red-card)' : 'var(--text-main)' }}
            >
              {card.suit}
            </span>
          </div>
        ) : (
          <Icon name="Plus" size={16} style={{ color: 'rgba(255,215,0,0.3)' }} />
        )}
      </div>
    </div>
  );
}

// ─── Suggestion Badge ─────────────────────────────────────────────────────────

function SuggestionBadge({ suggestion }: { suggestion: Suggestion | null }) {
  if (!suggestion) return null;

  const map: Record<Suggestion, { label: string; cls: string; icon: string }> = {
    HIT: { label: 'HIT — БЕРИТЕ КАРТУ', cls: 'suggestion-hit', icon: 'TrendingUp' },
    STAND: { label: 'STAND — НЕ БЕРИТЕ', cls: 'suggestion-stand', icon: 'Hand' },
    DOUBLE: { label: 'DOUBLE — УДВОЙТЕ', cls: 'suggestion-double', icon: 'Zap' },
    SPLIT: { label: 'SPLIT — РАЗДЕЛИТЕ', cls: 'suggestion-split', icon: 'GitBranch' },
    BUST: { label: 'ПЕРЕБОР!', cls: 'suggestion-hit', icon: 'X' },
  };

  const { label, cls, icon } = map[suggestion];

  return (
    <div className={`px-4 py-2.5 rounded-lg flex items-center gap-2 ${cls} animate-pop-in`}>
      <Icon name={icon} fallback="CircleAlert" size={16} />
      <span className="font-display tracking-widest text-sm">{label}</span>
    </div>
  );
}

// ─── Win Chance Badge ─────────────────────────────────────────────────────────

function WinChanceBadge({ chance }: { chance: number | null }) {
  if (chance === null) return null;
  const color = chance >= 65 ? '#4CAF50' : chance >= 45 ? '#FDD835' : '#EF5350';
  const label = chance >= 65 ? 'ВЫСОКИЙ' : chance >= 45 ? 'СРЕДНИЙ' : 'НИЗКИЙ';
  const barWidth = `${chance}%`;
  return (
    <div
      className="rounded-lg p-3 animate-pop-in"
      style={{ background: 'var(--bg-slot)', border: `1px solid ${color}40` }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-display text-xs tracking-widest" style={{ color: 'var(--text-dim)' }}>
          ШАНС ПОБЕДЫ
        </span>
        <span className="font-display text-sm font-bold" style={{ color }}>
          {chance}% <span className="text-xs font-normal" style={{ color: 'var(--text-dim)' }}>({label})</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: barWidth, background: color, boxShadow: `0 0 6px ${color}80` }}
        />
      </div>
    </div>
  );
}

// ─── Blackjack Tab ────────────────────────────────────────────────────────────

interface BlackjackStats {
  wins: number;
  losses: number;
}

function BlackjackTab() {
  const EMPTY_HAND: Card[] = [null, null, null, null, null, null];

  const [dealerCards, setDealerCards] = useState<Card[]>([null, null]);
  const [playerCards, setPlayerCards] = useState<Card[]>([...EMPTY_HAND]);
  const [splitCards, setSplitCards] = useState<Card[]>([...EMPTY_HAND]);
  const [activeSlot, setActiveSlot] = useState<{ hand: 'dealer' | 'player' | 'split'; index: number } | null>(null);
  const [isSplit, setIsSplit] = useState(false);
  const [activeHand, setActiveHand] = useState<'player' | 'split'>('player');
  const [isDoubled, setIsDoubled] = useState(false);
  const [stats, setStats] = useState<BlackjackStats>({ wins: 0, losses: 0 });
  const [lastResult, setLastResult] = useState<'win' | 'lost' | null>(null);

  const playerFilled = playerCards.filter(Boolean) as NonNullable<Card>[];
  const dealerOpen = dealerCards[0];
  const playerScore = calcScore(playerCards);
  const splitScore = calcScore(splitCards);

  const canSplit = !isSplit && !isDoubled && playerFilled.length === 2 && (() => {
    const v1 = playerFilled[0].value;
    const v2 = playerFilled[1].value;
    const face = ['J', 'Q', 'K', '10'];
    if (face.includes(v1) && face.includes(v2)) return true;
    return v1 === v2;
  })();

  const canDouble = !isSplit && !isDoubled && playerFilled.length === 2;

  const suggestion = playerFilled.length >= 1
    ? getSuggestion(playerCards, dealerOpen, canSplit, canDouble)
    : null;

  const splitSuggestion = isSplit && splitCards.filter(Boolean).length >= 1
    ? getSuggestion(splitCards, dealerOpen, false, false)
    : null;

  const winChance = calcWinChance(playerCards, dealerOpen);
  const splitWinChance = isSplit ? calcWinChance(splitCards, dealerOpen) : null;

  const handleSlotClick = (hand: 'dealer' | 'player' | 'split', index: number) => {
    setActiveSlot({ hand, index });
  };

  const handleCardSelect = (card: Card) => {
    if (!activeSlot) return;
    const { hand, index } = activeSlot;
    if (hand === 'dealer') {
      const next = [...dealerCards];
      next[index] = card;
      setDealerCards(next);
    } else if (hand === 'player') {
      const next = [...playerCards];
      next[index] = card;
      setPlayerCards(next);
    } else {
      const next = [...splitCards];
      next[index] = card;
      setSplitCards(next);
    }
    setLastResult(null);
    setActiveSlot(null);
  };

  const handleClear = () => {
    if (!activeSlot) return;
    const { hand, index } = activeSlot;
    if (hand === 'dealer') {
      const next = [...dealerCards];
      next[index] = null;
      setDealerCards(next);
    } else if (hand === 'player') {
      const next = [...playerCards];
      next[index] = null;
      setPlayerCards(next);
    } else {
      const next = [...splitCards];
      next[index] = null;
      setSplitCards(next);
    }
    setActiveSlot(null);
  };

  const handleSplit = () => {
    if (!canSplit) return;
    const card1 = playerCards[0]!;
    const card2 = playerCards[1]!;
    setPlayerCards([card1, null, null, null, null, null]);
    setSplitCards([card2, null, null, null, null, null]);
    setIsSplit(true);
    setActiveHand('player');
  };

  const handleDouble = () => {
    if (!canDouble) return;
    setIsDoubled(true);
  };

  const handleReset = () => {
    setDealerCards([null, null]);
    setPlayerCards([...EMPTY_HAND]);
    setSplitCards([...EMPTY_HAND]);
    setIsSplit(false);
    setActiveHand('player');
    setIsDoubled(false);
    setLastResult(null);
  };

  const handleResult = (result: 'win' | 'lost') => {
    if (isSplit) {
      setStats(s => result === 'win'
        ? { ...s, wins: s.wins + 2 }
        : { ...s, losses: s.losses + 2 });
    } else {
      setStats(s => result === 'win'
        ? { ...s, wins: s.wins + 1 }
        : { ...s, losses: s.losses + 1 });
    }
    setLastResult(result);
    setTimeout(handleReset, 600);
  };

  const total = stats.wins + stats.losses;
  const winRate = total > 0 ? Math.round((stats.wins / total) * 100) : 0;

  const getActiveSlots = (hand: 'player' | 'split') => {
    const cards = hand === 'player' ? playerCards : splitCards;
    const filled = cards.filter(Boolean).length;
    return isDoubled ? Math.min(filled + 1, 3) : Math.min(filled + 1, 6);
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-lg gold-border" style={{ background: 'var(--bg-card)' }}>
        <div className="flex items-center gap-1.5">
          <span className="text-green-400 text-lg">✅</span>
          <span className="font-display text-sm" style={{ color: 'var(--text-main)' }}>{stats.wins}</span>
        </div>
        <div className="font-display text-xs tracking-widest" style={{ color: 'var(--text-dim)' }}>
          {winRate > 0 ? <span className="gold-text">{winRate}% ВИНРЕЙТ</span> : 'СТАТИСТИКА'}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-red-400 text-lg">❌</span>
          <span className="font-display text-sm" style={{ color: 'var(--text-main)' }}>{stats.losses}</span>
        </div>
      </div>

      {/* Dealer */}
      <div className="rounded-xl p-4 gold-border" style={{ background: 'var(--bg-card)' }}>
        <div className="font-display text-xs tracking-widest mb-3" style={{ color: 'var(--text-dim)' }}>
          ДИЛЛЕР
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CardSlot card={dealerCards[0]} onClick={() => handleSlotClick('dealer', 0)} label="Открытая" />
          <CardSlot card={null} hidden={true} label="Закрытая" />
        </div>
      </div>

      {/* Player */}
      <div className="rounded-xl p-4 gold-border" style={{ background: 'var(--bg-card)' }}>
        {isSplit ? (
          <div className="space-y-4">
            {(['player', 'split'] as const).map((hand, hi) => {
              const cards = hand === 'player' ? playerCards : splitCards;
              const score = hand === 'player' ? playerScore : splitScore;
              const sugg = hand === 'player' ? suggestion : splitSuggestion;
              const isActive = activeHand === hand;
              return (
                <div key={hand}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display text-xs tracking-widest" style={{ color: isActive ? 'var(--gold)' : 'var(--text-dim)' }}>
                      РУКА {hi + 1} {isActive && '▶'}
                    </span>
                    {score > 0 && (
                      <span className="font-display text-xs" style={{ color: 'var(--text-dim)' }}>
                        ОЧКИ: <span style={{ color: score > 21 ? 'var(--red-card)' : 'var(--text-main)' }}>{score}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <CardSlot
                        key={i}
                        card={cards[i]}
                        locked={!isActive || i >= getActiveSlots(hand)}
                        onClick={() => isActive && i < getActiveSlots(hand) ? handleSlotClick(hand, i) : undefined}
                      />
                    ))}
                  </div>
                  {isActive && sugg && <SuggestionBadge suggestion={sugg} />}
                  {isActive && (
                    <div className="mt-2">
                      <WinChanceBadge chance={hand === 'player' ? winChance : splitWinChance} />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex gap-2">
              <button onClick={() => setActiveHand('player')} className={`flex-1 py-2 rounded text-xs font-display tracking-wide transition-all ${activeHand === 'player' ? 'btn-gold' : 'btn-ghost'}`}>
                РУКА 1
              </button>
              <button onClick={() => setActiveHand('split')} className={`flex-1 py-2 rounded text-xs font-display tracking-wide transition-all ${activeHand === 'split' ? 'btn-gold' : 'btn-ghost'}`}>
                РУКА 2
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-xs tracking-widest" style={{ color: 'var(--text-dim)' }}>ИГРОК</span>
              {playerScore > 0 && (
                <span className="font-display text-xs" style={{ color: 'var(--text-dim)' }}>
                  ОЧКИ:{' '}
                  <span className="font-bold" style={{ color: playerScore > 21 ? 'var(--red-card)' : playerScore === 21 ? 'var(--gold)' : 'var(--text-main)' }}>
                    {playerScore}{playerScore === 21 ? ' 🏆' : playerScore > 21 ? ' ПЕРЕБОР' : ''}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSlot
                  key={i}
                  card={playerCards[i]}
                  locked={(isDoubled && i >= 3) || (!isDoubled && i >= getActiveSlots('player'))}
                  onClick={() => !isDoubled && i < getActiveSlots('player') ? handleSlotClick('player', i) : undefined}
                />
              ))}
            </div>
            {suggestion && <div className="mb-2"><SuggestionBadge suggestion={suggestion} /></div>}
            {winChance !== null && <div className="mb-3"><WinChanceBadge chance={winChance} /></div>}
            {!isDoubled && playerFilled.length >= 2 && (canSplit || canDouble) && (
              <div className="flex gap-2 mt-2">
                {canSplit && (
                  <button onClick={handleSplit} className="flex-1 py-2 rounded btn-ghost text-xs font-display tracking-widest">
                    ✂️ SPLIT
                  </button>
                )}
                {canDouble && (
                  <button onClick={handleDouble} className="flex-1 py-2 rounded btn-ghost text-xs font-display tracking-widest">
                    ⚡ DOUBLE
                  </button>
                )}
              </div>
            )}
            {isDoubled && (
              <div className="text-center py-1">
                <span className="font-display text-xs tracking-widest gold-text">⚡ DOUBLE — ОДНА КАРТА</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* WIN / LOST */}
      <div className="flex gap-3">
        <button
          onClick={() => handleResult('win')}
          className={`flex-1 py-3.5 btn-win rounded-lg font-display text-base tracking-widest transition-all ${lastResult === 'win' ? 'scale-95' : ''}`}
        >
          ✅ WIN
        </button>
        <button
          onClick={() => handleResult('lost')}
          className={`flex-1 py-3.5 btn-lost rounded-lg font-display text-base tracking-widest transition-all ${lastResult === 'lost' ? 'scale-95' : ''}`}
        >
          ❌ LOST
        </button>
      </div>

      <button
        onClick={handleReset}
        className="w-full py-2 btn-ghost rounded-lg font-display text-xs tracking-widest flex items-center justify-center gap-2"
      >
        <Icon name="RefreshCw" size={14} />
        НОВАЯ ИГРА
      </button>

      {activeSlot && (
        <CardPicker
          onSelect={handleCardSelect}
          onClear={handleClear}
          onClose={() => setActiveSlot(null)}
          hasCard={
            activeSlot.hand === 'dealer' ? !!dealerCards[activeSlot.index]
              : activeSlot.hand === 'player' ? !!playerCards[activeSlot.index]
              : !!splitCards[activeSlot.index]
          }
        />
      )}
    </div>
  );
}

// ─── Dice Tab ─────────────────────────────────────────────────────────────────

function DiceTab() {
  const [history, setHistory] = useState<DiceResult[]>([]);
  const [lastResult, setLastResult] = useState<DiceResult | null>(null);

  const addResult = (r: DiceResult) => {
    setLastResult(r);
    setHistory(prev => [r, ...prev].slice(0, 50));
  };

  const wins = history.filter(r => r === 'WIN').length;
  const draws = history.filter(r => r === 'DRAW').length;
  const losses = history.filter(r => r === 'LOST').length;

  // Шанс победы: взвешенное среднее (последние 5 игр × 0.6 + общий винрейт × 0.4)
  const totalGames = history.length;
  const overallWinRate = totalGames > 0 ? wins / totalGames : 0;
  const last5 = history.slice(0, 5);
  const last5wins = last5.filter(r => r === 'WIN').length;
  const recentRate = last5.length > 0 ? last5wins / last5.length : 0;
  const forecast = totalGames >= 3
    ? Math.round((recentRate * 0.6 + overallWinRate * 0.4) * 100)
    : null;

  const iconMap: Record<DiceResult, { emoji: string; color: string }> = {
    WIN: { emoji: '🟢', color: '#4CAF50' },
    DRAW: { emoji: '🟡', color: '#FDD835' },
    LOST: { emoji: '🔴', color: '#EF5350' },
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="grid grid-cols-3 gap-3">
        {(['WIN', 'DRAW', 'LOST'] as DiceResult[]).map(r => (
          <div key={r} className="rounded-xl p-3 text-center gold-border" style={{ background: 'var(--bg-card)' }}>
            <div className="text-2xl mb-1">{iconMap[r].emoji}</div>
            <div className="font-display text-xl" style={{ color: iconMap[r].color }}>
              {r === 'WIN' ? wins : r === 'DRAW' ? draws : losses}
            </div>
            <div className="font-display text-xs tracking-widest" style={{ color: 'var(--text-dim)' }}>{r}</div>
          </div>
        ))}
      </div>

      {forecast !== null && (
        <div className="rounded-xl p-4 gold-border animate-pop-in" style={{ background: 'var(--bg-card)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-xs tracking-widest" style={{ color: 'var(--text-dim)' }}>
              ШАНС ПОБЕДЫ В СЛЕДУЮЩЕЙ
            </span>
            <span
              className="font-display text-sm font-bold"
              style={{ color: forecast >= 60 ? '#4CAF50' : forecast >= 40 ? '#FDD835' : '#EF5350' }}
            >
              {forecast}%
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${forecast}%`,
                background: forecast >= 60 ? '#4CAF50' : forecast >= 40 ? '#FDD835' : '#EF5350',
                boxShadow: `0 0 8px ${forecast >= 60 ? '#4CAF5080' : forecast >= 40 ? '#FDD83580' : '#EF535080'}`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="font-display text-xs" style={{ color: 'var(--text-dim)' }}>
              Общий винрейт: <span style={{ color: 'var(--text-main)' }}>{Math.round(overallWinRate * 100)}%</span>
            </span>
            <span className="font-display text-xs" style={{ color: 'var(--text-dim)' }}>
              Последние 5: <span style={{ color: 'var(--text-main)' }}>{Math.round(recentRate * 100)}%</span>
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {(['WIN', 'DRAW', 'LOST'] as DiceResult[]).map(r => (
          <button
            key={r}
            onClick={() => addResult(r)}
            className={`py-5 rounded-xl font-display text-base tracking-widest flex flex-col items-center gap-1 transition-all ${
              lastResult === r ? 'scale-95' : ''
            } ${r === 'WIN' ? 'btn-win' : r === 'DRAW' ? 'btn-draw' : 'btn-lost'}`}
          >
            <span className="text-2xl">{iconMap[r].emoji}</span>
            {r}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <div className="rounded-xl p-4 gold-border" style={{ background: 'var(--bg-card)' }}>
          <div className="font-display text-xs tracking-widest mb-3" style={{ color: 'var(--text-dim)' }}>
            ИСТОРИЯ ({history.length} игр)
          </div>
          <div className="flex flex-wrap gap-2">
            {history.slice(0, 30).map((r, i) => (
              <span key={i} className="text-lg">{iconMap[r].emoji}</span>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <button
          onClick={() => { setHistory([]); setLastResult(null); }}
          className="w-full py-2 btn-ghost rounded-lg font-display text-xs tracking-widest flex items-center justify-center gap-2"
        >
          <Icon name="Trash2" size={14} />
          ОЧИСТИТЬ ИСТОРИЮ
        </button>
      )}
    </div>
  );
}

// ─── Placeholder ──────────────────────────────────────────────────────────────

function PlaceholderTab({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 animate-fade-in">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl animate-glow"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--gold-border)' }}
      >
        {icon}
      </div>
      <div className="text-center">
        <div className="font-display text-xl tracking-widest mb-2" style={{ color: 'var(--text-main)' }}>{title}</div>
        <div className="font-display text-sm tracking-widest" style={{ color: 'var(--text-dim)' }}>СКОРО ОБНОВЛЕНИЕ...</div>
      </div>
    </div>
  );
}

// ─── Support Tab ──────────────────────────────────────────────────────────────

function SupportTab() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="text-center py-2">
        <div className="font-display text-lg tracking-widest gold-text mb-1">ПОДДЕРЖКА РАЗРАБОТЧИКА</div>
        <div className="font-display text-xs tracking-widest" style={{ color: 'var(--text-dim)' }}>
          Если LUDKA помогает тебе — поддержи проект
        </div>
      </div>

      <div className="rounded-xl p-4 gold-border" style={{ background: 'var(--bg-card)' }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">🏦</span>
          <span className="font-display tracking-widest" style={{ color: 'var(--text-main)' }}>БАНКОВСКИЙ СЧЁТ</span>
        </div>
        <div
          className="rounded-lg p-3 mb-3 font-display text-center text-lg tracking-wider"
          style={{ background: 'var(--bg-slot)', border: '1px solid var(--gold-border)', color: 'var(--gold)' }}
        >
          14 seattle 23080
        </div>
        <button
          onClick={() => copy('14 seattle 23080', 'bank')}
          className={`w-full py-2.5 rounded-lg font-display text-sm tracking-widest transition-all ${copied === 'bank' ? 'btn-win' : 'btn-gold'}`}
        >
          {copied === 'bank' ? '✅ СКОПИРОВАНО' : '📋 КОПИРОВАТЬ'}
        </button>
      </div>

      <div className="rounded-xl p-4 gold-border" style={{ background: 'var(--bg-card)' }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">🎟️</span>
          <div>
            <div className="font-display tracking-widest" style={{ color: 'var(--text-main)' }}>ПРОМОКОД MAJESTIC RP</div>
            <div className="font-display text-xs" style={{ color: 'var(--text-dim)' }}>Введи в игре и получи бонус</div>
          </div>
        </div>
        <div
          className="rounded-lg p-3 mb-3 font-display text-center text-2xl tracking-widest"
          style={{ background: 'var(--bg-slot)', border: '1px solid var(--gold-border)', color: 'var(--gold)', letterSpacing: '0.3em' }}
        >
          GOJO
        </div>
        <button
          onClick={() => copy('GOJO', 'promo')}
          className={`w-full py-2.5 rounded-lg font-display text-sm tracking-widest transition-all ${copied === 'promo' ? 'btn-win' : 'btn-gold'}`}
        >
          {copied === 'promo' ? '✅ СКОПИРОВАНО' : '📋 КОПИРОВАТЬ'}
        </button>
      </div>

      <div className="rounded-xl p-4 gold-border" style={{ background: 'var(--bg-card)' }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">💸</span>
          <div>
            <div className="font-display tracking-widest" style={{ color: 'var(--text-main)' }}>ДОНАТ</div>
            <div className="font-display text-xs" style={{ color: 'var(--text-dim)' }}>Поддержи через донат-страницу</div>
          </div>
        </div>
        <a
          href="https://dalink.to/0maverick0"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-2.5 rounded-lg font-display text-sm tracking-widest text-center btn-gold transition-all"
        >
          💸 ОТКРЫТЬ СТРАНИЦУ ДОНАТА
        </a>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'blackjack', label: 'БЛЭК ДЖЕК', emoji: '♠' },
  { id: 'dice', label: 'КОСТИ', emoji: '🎲' },
  { id: 'poker', label: 'ПОКЕР', emoji: '♥' },
  { id: 'roulette', label: 'РУЛЕТКА', emoji: '🎡' },
  { id: 'support', label: 'ДОНАТ', emoji: '❤️' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('blackjack');

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-main)', maxWidth: '480px', margin: '0 auto' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between"
        style={{ background: 'rgba(18,18,18,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--gold-border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="font-display text-2xl tracking-widest gold-text font-bold">LUDKA</span>
          <span
            className="px-1.5 py-0.5 rounded text-xs font-display tracking-widest"
            style={{ background: 'var(--gold-dim)', color: 'var(--gold)', border: '1px solid var(--gold-border)' }}
          >
            v1.0
          </span>
        </div>
        <span className="text-xs font-display tracking-widest" style={{ color: 'var(--text-dim)' }}>
          GTA MAJESTIC RP
        </span>
      </div>

      {/* Tab bar */}
      <div
        className="sticky z-10 px-2 py-2 flex gap-1 overflow-x-auto scrollbar-hide"
        style={{ top: '57px', background: 'rgba(18,18,18,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(255,215,0,0.1)' }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg font-display text-xs tracking-widest transition-all ${
              activeTab === tab.id ? 'btn-gold' : 'btn-ghost'
            }`}
          >
            <span>{tab.emoji}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 pb-10">
        {activeTab === 'blackjack' && <BlackjackTab />}
        {activeTab === 'dice' && <DiceTab />}
        {activeTab === 'poker' && <PlaceholderTab icon="♥️" title="ПОКЕР" />}
        {activeTab === 'roulette' && <PlaceholderTab icon="🎡" title="РУЛЕТКА" />}
        {activeTab === 'support' && <SupportTab />}
      </div>
    </div>
  );
}