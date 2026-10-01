"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadCloudState, saveCloudState } from "@/lib/cloud-progress";

export type NationalDayAttempt = {
  values: string[];
  checked: boolean;
  correct: boolean | null;
  selfRated?: boolean;
};

export type NationalDayProgress = {
  attempts: Record<string, NationalDayAttempt>;
  completedSections: string[];
  drafts: Record<string, string>;
  writingChecks: Record<string, string[]>;
  lastSection: string;
};

const EMPTY_PROGRESS: NationalDayProgress = {
  attempts: {}, completedSections: [], drafts: {}, writingChecks: {}, lastSection: "01",
};

function normalizeProgress(value: Partial<NationalDayProgress> | null): NationalDayProgress {
  return {
    attempts: value?.attempts && typeof value.attempts === "object" ? value.attempts : {},
    completedSections: Array.isArray(value?.completedSections) ? value.completedSections.filter((item) => typeof item === "string") : [],
    drafts: value?.drafts && typeof value.drafts === "object" ? value.drafts : {},
    writingChecks: value?.writingChecks && typeof value.writingChecks === "object" ? value.writingChecks : {},
    lastSection: typeof value?.lastSection === "string" ? value.lastSection : "01",
  };
}

export function useNationalDayProgress(subjectId: string, sectionId?: string) {
  const scope = `english:national-day:${subjectId}:v1`;
  const storageKey = `study-plan-${scope}`;
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [ready, setReady] = useState(false);
  const current = useRef(EMPTY_PROGRESS);

  useEffect(() => {
    let active = true;
    void loadCloudState<NationalDayProgress>(scope, storageKey, EMPTY_PROGRESS).then((loaded) => {
      if (!active) return;
      const next = normalizeProgress(loaded);
      if (sectionId && next.lastSection !== sectionId) {
        next.lastSection = sectionId;
        saveCloudState(scope, storageKey, next);
      }
      current.current = next;
      setProgress(next);
      setReady(true);
    });
    return () => { active = false; };
  }, [scope, storageKey, sectionId]);

  const update = useCallback((patch: Partial<NationalDayProgress>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    setProgress(next);
    saveCloudState(scope, storageKey, next);
  }, [scope, storageKey]);

  const recordAttempt = useCallback((questionId: string, attempt: NationalDayAttempt) => {
    update({ attempts: { ...current.current.attempts, [questionId]: attempt } });
  }, [update]);

  const saveDraft = useCallback((id: string, text: string) => {
    update({ drafts: { ...current.current.drafts, [id]: text } });
  }, [update]);

  const toggleWritingCheck = useCallback((id: string, label: string) => {
    const existing = current.current.writingChecks[id] ?? [];
    const next = existing.includes(label) ? existing.filter((item) => item !== label) : [...existing, label];
    update({ writingChecks: { ...current.current.writingChecks, [id]: next } });
  }, [update]);

  const completeSection = useCallback((id: string) => {
    update({ completedSections: [...new Set([...current.current.completedSections, id])] });
  }, [update]);

  return { progress, ready, recordAttempt, saveDraft, toggleWritingCheck, completeSection };
}
