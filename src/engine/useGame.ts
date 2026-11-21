import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameClient } from './GameClient';

export const GameContext = createContext<GameClient | null>(null);

export function useClient(): GameClient {
  const c = useContext(GameContext);
  if (!c) throw new Error('GameContext missing');
  return c;
}

export function useSnapshot() {
  const c = useClient();
  return useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
}
