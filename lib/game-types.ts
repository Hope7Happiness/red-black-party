export type Color = 'red' | 'black';
export type Phase = 'lobby' | 'submit' | 'guess' | 'results';
export interface PlayerView { id: string; name: string; isHost: boolean; submitted: boolean; guessed: boolean; guess: number | null; correct: boolean | null; revealedCard: Color | null; usedReveal: boolean; }
export interface RevealView { byId: string; targetId: string; color: Color; }
export interface RoomView { code: string; phase: Phase; round: number; version: number; players: PlayerView[]; me: { id: string; card: Color | null; guess: number | null; canReveal: boolean; }; submittedCount: number; guessedCount: number; redCount: number | null; reveals: RevealView[]; allRevealsDone: boolean; expiresAt: number; }
export type Action = { type: 'start' | 'next' | 'reset' | 'leave'; round: number } | { type: 'card'; round: number; color: Color } | { type: 'guess'; round: number; value: number } | { type: 'reveal' | 'kick'; round: number; targetId: string };
