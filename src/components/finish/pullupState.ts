import type { PullupInProgressState } from '../../types';
import { buildDayPlan, loadPullupProgram } from '../../utils/pullupProgram';

export function buildInitialPullupState(): PullupInProgressState {
  const plan = buildDayPlan(loadPullupProgram());
  return {
    plan: {
      dayNumber: plan.dayNumber,
      effectiveDay: plan.effectiveDay,
      day5ActualDay: plan.day5ActualDay,
      targetReps: plan.targetReps,
      grips: plan.grips,
      plannedSets: plan.plannedSets,
      restSeconds: plan.restSeconds,
    },
    started: false,
    completedSets: [],
    currentSetIndex: 0,
    ladderFailed: false,
    ladderFinalSet: false,
    isResting: false,
    restSecondsLeft: 0,
    restSecondsTotal: 0,
  };
}
