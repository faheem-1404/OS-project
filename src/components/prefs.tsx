"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface Prefs {
  reducedMotion: boolean;
  sound: boolean;
  setReducedMotion: (v: boolean) => void;
  setSound: (v: boolean) => void;
}

const PrefsContext = createContext<Prefs | null>(null);

const REDUCED_KEY = "campuslock:reduced";
const SOUND_KEY = "campuslock:sound";

/**
 * Accessibility + demo preferences.
 * Reduced motion starts from the OS setting and can be overridden in-app;
 * sound is strictly opt-in and never plays without a user gesture.
 */
export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [reducedMotion, setReducedMotionState] = useState(false);
  const [sound, setSoundState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const osReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stored = window.localStorage.getItem(REDUCED_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reading persisted preferences is a mount-time effect by definition.
setReducedMotionState(stored === null ? osReduced : stored === "true");
    setSoundState(window.localStorage.getItem(SOUND_KEY) === "true");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.reduced = String(reducedMotion);
  }, [reducedMotion, ready]);

  const setReducedMotion = useCallback((v: boolean) => {
    setReducedMotionState(v);
    window.localStorage.setItem(REDUCED_KEY, String(v));
  }, []);

  const setSound = useCallback((v: boolean) => {
    setSoundState(v);
    window.localStorage.setItem(SOUND_KEY, String(v));
  }, []);

  const value = useMemo(
    () => ({ reducedMotion, sound, setReducedMotion, setSound }),
    [reducedMotion, sound, setReducedMotion, setSound],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside <PrefsProvider>");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Sound — tiny WebAudio blips, no asset downloads                     */
/* ------------------------------------------------------------------ */

type Blip = "tick" | "lock" | "granted" | "denied" | "fanfare" | "reveal";

export function useSfx() {
  const { sound, reducedMotion } = usePrefs();

  return useCallback(
    (kind: Blip) => {
      if (!sound || typeof window === "undefined") return;
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      try {
        const ctx = new Ctx();
        const now = ctx.currentTime;
        const notes: Record<Blip, number[]> = {
          tick: [880],
          lock: [660, 990],
          granted: [523.25, 659.25, 783.99],
          denied: [311.13, 233.08],
          reveal: [440, 554.37, 659.25],
          fanfare: [523.25, 659.25, 783.99, 1046.5],
        };
        const list = reducedMotion ? notes[kind].slice(-1) : notes[kind];
        list.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = kind === "denied" ? "sawtooth" : "triangle";
          osc.frequency.value = freq;
          const start = now + i * 0.11;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.14, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.32);
        });
        setTimeout(() => void ctx.close().catch(() => {}), 900);
      } catch {
        /* audio unavailable */
      }
    },
    [sound, reducedMotion],
  );
}