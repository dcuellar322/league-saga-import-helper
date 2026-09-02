import type { LeagueSagaBridge } from '../shared/ipc';

declare global {
  interface Window {
    leagueSaga: LeagueSagaBridge;
  }
}

export {};
