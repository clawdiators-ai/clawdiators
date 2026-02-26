import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { MappingGroundTruth } from "./data.js";

const WEIGHTS = { coverage: 0.35, accuracy: 0.3, efficiency: 0.15, exploration: 0.2 };
const TIME_LIMIT = 3600; // 1 hour

export function scoreMapping(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt, apiCallCount } = input;
  const groundTruth = gt as unknown as MappingGroundTruth;

  // === Coverage: how many nodes discovered (0-1000 raw) ===
  let coverageRaw = 0;
  const discoveredCount = Number(submission.nodes_discovered ?? submission.total_nodes ?? 0);
  if (discoveredCount > 0) {
    const ratio = Math.min(1, discoveredCount / groundTruth.totalNodes);
    coverageRaw = Math.round(ratio * 1000);
  }

  // === Accuracy: correct answers about the map (0-1000 raw) ===
  let accuracyRaw = 0;

  // Deepest node (250)
  if (submission.deepest_node !== undefined) {
    const deepest = typeof submission.deepest_node === "object"
      ? (submission.deepest_node as any).id || (submission.deepest_node as any).node_id
      : String(submission.deepest_node);
    if (deepest === groundTruth.deepestNode.id) accuracyRaw += 250;
  }

  // Most connected node (250)
  if (submission.most_connected_node !== undefined) {
    const mc = typeof submission.most_connected_node === "object"
      ? (submission.most_connected_node as any).id || (submission.most_connected_node as any).node_id
      : String(submission.most_connected_node);
    if (mc === groundTruth.mostConnectedNode.id) accuracyRaw += 250;
  }

  // Resources by type (300)
  if (submission.resources_by_type && typeof submission.resources_by_type === "object") {
    const submitted = submission.resources_by_type as Record<string, any>;
    const truth = groundTruth.resourcesByType;
    const types = Object.keys(truth);
    let correctTypes = 0;
    for (const type of types) {
      const sub = submitted[type];
      if (sub) {
        const subCount = Number(sub.count ?? sub);
        if (subCount === truth[type].count) correctTypes++;
      }
    }
    accuracyRaw += Math.round((correctTypes / Math.max(types.length, 1)) * 300);
  }

  // Total resource value (200)
  if (submission.total_resource_value !== undefined) {
    const val = Number(submission.total_resource_value);
    if (!Number.isNaN(val)) {
      const diff = Math.abs(val - groundTruth.totalResourceValue);
      if (diff === 0) accuracyRaw += 200;
      else if (diff <= groundTruth.totalResourceValue * 0.1) accuracyRaw += 100;
      else if (diff <= groundTruth.totalResourceValue * 0.25) accuracyRaw += 50;
    }
  }

  // === Efficiency: time and API calls ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  // For long-running, don't penalize time as harshly — penalize API call waste
  let efficiencyRaw: number;
  const callsPerNode = apiCallCount / Math.max(discoveredCount, 1);
  if (callsPerNode <= 1.5) efficiencyRaw = 1000;
  else if (callsPerNode <= 2) efficiencyRaw = 800;
  else if (callsPerNode <= 3) efficiencyRaw = 600;
  else if (callsPerNode <= 5) efficiencyRaw = 400;
  else efficiencyRaw = 200;

  // === Exploration quality: path value ===
  let explorationRaw = 0;
  if (submission.best_path && Array.isArray(submission.best_path)) {
    const pathValue = Number(submission.path_value ?? 0);
    if (pathValue > 0) {
      const ratio = Math.min(1, pathValue / groundTruth.optimalPathValue);
      explorationRaw = Math.round(ratio * 1000);
    }
  } else {
    // Partial credit for submitting any resource information
    if (discoveredCount > 0) {
      explorationRaw = Math.round((discoveredCount / groundTruth.totalNodes) * 500);
    }
  }

  // Weighted total
  const coverage = Math.round(coverageRaw * WEIGHTS.coverage);
  const accuracy = Math.round(accuracyRaw * WEIGHTS.accuracy);
  const efficiency = Math.round(efficiencyRaw * WEIGHTS.efficiency);
  const exploration = Math.round(explorationRaw * WEIGHTS.exploration);
  const total = Math.min(MAX_SCORE, coverage + accuracy + efficiency + exploration);

  return { breakdown: { coverage, accuracy, efficiency, exploration, total } };
}
