export type ProgressionEvent =
  | { type: 'CoinsChanged'; newTotal: number; delta: number }
  | { type: 'UpgradePurchased'; upgradeId: string; newLevel: number }
  | { type: 'DeckCollectionChanged'; ownedDeckIds: string[]; selectedDeckId: string };

export type ProgressionEventListener = (event: ProgressionEvent) => void;
