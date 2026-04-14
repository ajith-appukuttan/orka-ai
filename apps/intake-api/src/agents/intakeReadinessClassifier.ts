import { query } from '../db/pool.js';
import { classifyIntakeReadiness } from '../services/claude.js';
import { createStorageClient, getArtifactBucket } from '@orka/object-storage';
import { buildArtifactKey } from '@orka/object-storage';

// ─── Types ─────────────────────────────────────────────
export type IntakeDisposition =
  | 'RETURN_TO_INTAKE'
  | 'DIRECT_TO_BUILD'
  | 'NEEDS_ELABORATION'
  | 'NEEDS_PLANNING'
  | 'NEEDS_ELABORATION_AND_PLANNING';

export interface ClassificationSignals {
  scopeSize: 'SMALL' | 'MEDIUM' | 'LARGE';
  ambiguity: 'LOW' | 'MEDIUM' | 'HIGH';
  uiComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  backendComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  integrationComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  architecturalUncertainty: 'LOW' | 'MEDIUM' | 'HIGH';
  taskDecompositionNeeded: boolean;
}

export interface IntakeRunDecision {
  id: string;
  runId: string;
  approvedArtifactId: string;
  classification: IntakeDisposition;
  buildReadinessScore: number;
  reasoningSummary: string;
  signals: ClassificationSignals;
  requiredNextStages: string[];
  blockingQuestions: string[];
  confidence: number;
  objectKey: string | null;
  createdAt: string;
}

// ─── Rule-Based Precheck ───────────────────────────────
interface PrecheckResult {
  minClassification: IntakeDisposition | null;
  signals: Partial<ClassificationSignals>;
  blockingQuestions: string[];
}

function runRuleBasedPrecheck(prd: Record<string, unknown>): PrecheckResult {
  const result: PrecheckResult = {
    minClassification: null,
    signals: {},
    blockingQuestions: [],
  };

  // Check acceptance criteria
  const acceptanceCriteria = (prd.acceptanceCriteria as string[]) || [];
  const uiRequirements = (prd.uiRequirements as unknown[]) || [];
  const uiUxRequirements = (prd.uiUxRequirements as unknown[]) || [];
  const allCriteria = [
    ...acceptanceCriteria,
    ...uiRequirements.flatMap(
      (r) => ((r as Record<string, unknown>).acceptanceCriteria as string[]) || [],
    ),
    ...uiUxRequirements.flatMap(
      (r) => ((r as Record<string, unknown>).acceptanceCriteria as string[]) || [],
    ),
  ];

  if (allCriteria.length === 0) {
    result.minClassification = 'RETURN_TO_INTAKE';
    result.blockingQuestions.push('No acceptance criteria defined');
  }

  // Check open questions
  const openQuestions =
    (prd.openQuestions as string[]) || (prd.unresolvedQuestions as string[]) || [];
  if (openQuestions.length > 0) {
    result.minClassification = result.minClassification || 'NEEDS_ELABORATION';
    result.blockingQuestions.push(...openQuestions);
  }

  // Check scope indicators
  const goals = (prd.goals as string[]) || [];
  const userStories = (prd.userStories as unknown[]) || [];
  const uiReqCount = uiRequirements.length + uiUxRequirements.length;

  if (userStories.length > 3 || uiReqCount > 3 || goals.length > 3) {
    result.signals.scopeSize = 'LARGE';
    result.signals.taskDecompositionNeeded = true;
    if (!result.minClassification || result.minClassification === 'DIRECT_TO_BUILD') {
      result.minClassification = 'NEEDS_PLANNING';
    }
  } else if (userStories.length > 1 || uiReqCount > 1) {
    result.signals.scopeSize = 'MEDIUM';
  } else {
    result.signals.scopeSize = 'SMALL';
  }

  // Check problem statement
  const problemStatement = (prd.problemStatement as string) || '';
  if (problemStatement.length < 20) {
    result.blockingQuestions.push('Problem statement is missing or too vague');
    result.minClassification = result.minClassification || 'RETURN_TO_INTAKE';
  }

  return result;
}

// ─── Main Classifier ───────────────────────────────────
const storageClient = createStorageClient();

export async function runIntakeReadinessClassifier(
  runId: string,
  approvedArtifactId: string,
  workspaceId: string,
  tenantId: string,
  prdContent: Record<string, unknown>,
): Promise<IntakeRunDecision | null> {
  console.info(`Intake classifier: evaluating run ${runId}...`);

  try {
    // Step 1: Rule-based precheck
    const precheck = runRuleBasedPrecheck(prdContent);

    // Step 2: Claude classification
    const rawJson = await classifyIntakeReadiness(prdContent, precheck);

    let parsed: Record<string, unknown>;
    try {
      const cleaned = rawJson
        .replace(/^```json?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Intake classifier: failed to parse Claude response');
      return null;
    }

    // Step 3: Combine rule signals with Claude output
    let classification = (parsed.classification as IntakeDisposition) || 'NEEDS_ELABORATION';
    const buildReadinessScore = (parsed.buildReadinessScore as number) || 0.5;
    const confidence = (parsed.confidence as number) || 0.7;
    const reasoningSummary = (parsed.reasoningSummary as string) || '';
    const signals = {
      ...((parsed.signals as ClassificationSignals) || {}),
      ...precheck.signals,
    } as ClassificationSignals;
    const requiredNextStages = (parsed.requiredNextStages as string[]) || ['BUILD'];
    const blockingQuestions = [
      ...precheck.blockingQuestions,
      ...((parsed.blockingQuestions as string[]) || []),
    ];

    // Rule override: if precheck found a higher severity classification, use it
    const severityOrder: IntakeDisposition[] = [
      'DIRECT_TO_BUILD',
      'NEEDS_PLANNING',
      'NEEDS_ELABORATION',
      'NEEDS_ELABORATION_AND_PLANNING',
      'RETURN_TO_INTAKE',
    ];
    if (precheck.minClassification) {
      const precheckSev = severityOrder.indexOf(precheck.minClassification);
      const claudeSev = severityOrder.indexOf(classification);
      if (precheckSev > claudeSev) {
        classification = precheck.minClassification;
      }
    }

    // Step 4: Persist to object storage
    let objectKey: string | null = null;
    const bucket = getArtifactBucket();
    try {
      objectKey = buildArtifactKey({
        tenantId,
        workspaceId,
        projectId: 'default',
        stage: 'INTAKE',
        runId,
        artifactType: 'CLASSIFICATION',
        version: 1,
      });

      const classificationPayload = {
        runId,
        approvedArtifactId,
        classification,
        buildReadinessScore,
        reasoningSummary,
        signals,
        requiredNextStages,
        blockingQuestions,
        confidence,
        createdAt: new Date().toISOString(),
      };

      await storageClient.putObject({
        bucket,
        key: objectKey,
        body: Buffer.from(JSON.stringify(classificationPayload, null, 2)),
        contentType: 'application/json',
        metadata: { runId, classification, tenantId },
      });
    } catch (err) {
      console.warn('Intake classifier: object storage write failed (non-fatal):', err);
    }

    // Step 5: Persist to database
    const result = await query(
      `INSERT INTO intake_run_decisions
       (run_id, approved_artifact_id, intake_workspace_id, tenant_id,
        classification, build_readiness_score, confidence, reasoning_summary,
        signals, required_next_stages, blocking_questions, object_key, bucket_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, created_at as "createdAt"`,
      [
        runId,
        approvedArtifactId,
        workspaceId,
        tenantId,
        classification,
        buildReadinessScore,
        confidence,
        reasoningSummary,
        JSON.stringify(signals),
        JSON.stringify(requiredNextStages),
        JSON.stringify(blockingQuestions),
        objectKey,
        bucket,
      ],
    );

    const row = result.rows[0];

    console.info(
      `Intake classifier: run ${runId} → ${classification} (readiness: ${buildReadinessScore}, confidence: ${confidence})`,
    );

    return {
      id: row.id,
      runId,
      approvedArtifactId,
      classification,
      buildReadinessScore,
      reasoningSummary,
      signals,
      requiredNextStages,
      blockingQuestions,
      confidence,
      objectKey,
      createdAt: row.createdAt,
    };
  } catch (err) {
    console.error('Intake classifier failed:', err);
    return null;
  }
}
