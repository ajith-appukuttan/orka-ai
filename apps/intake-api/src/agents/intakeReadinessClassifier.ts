import { query } from '../db/pool.js';
import { classifyIntakeReadiness } from '../services/claude.js';
import { createStorageClient, getArtifactBucket, buildArtifactKey } from '@orka/object-storage';

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

function runRuleBasedPrecheck(prd: Record<string, unknown>) {
  const result: {
    minClassification: IntakeDisposition | null;
    signals: Partial<ClassificationSignals>;
    blockingQuestions: string[];
  } = { minClassification: null, signals: {}, blockingQuestions: [] };

  const acceptanceCriteria = (prd.acceptanceCriteria as string[]) || [];
  const goals = (prd.goals as string[]) || [];
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
  const hasTestableGoals = goals.length > 0 && goals.some((g) => g.length > 20);

  if (allCriteria.length === 0 && !hasTestableGoals) {
    result.minClassification = 'NEEDS_ELABORATION';
    result.blockingQuestions.push('No formal acceptance criteria defined');
  }

  const openQuestions =
    (prd.openQuestions as string[]) || (prd.unresolvedQuestions as string[]) || [];
  if (openQuestions.length > 0) {
    result.minClassification = result.minClassification || 'NEEDS_ELABORATION';
    result.blockingQuestions.push(...openQuestions);
  }

  const userStories = (prd.userStories as unknown[]) || [];
  const uiReqCount = uiRequirements.length + uiUxRequirements.length;
  if (userStories.length > 3 || uiReqCount > 3) {
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

  const problemStatement = (prd.problemStatement as string) || '';
  if (typeof problemStatement === 'string' && problemStatement.length < 20) {
    const psObj = prd.problemStatement as Record<string, unknown> | undefined;
    if (!psObj || !(psObj.what as string)?.length) {
      result.blockingQuestions.push('Problem statement is missing or too vague');
      result.minClassification = result.minClassification || 'RETURN_TO_INTAKE';
    }
  }

  return result;
}

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
    const precheck = runRuleBasedPrecheck(prdContent);
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
      if (precheckSev > claudeSev) classification = precheck.minClassification;
    }

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
      await storageClient.putObject({
        bucket,
        key: objectKey,
        body: Buffer.from(
          JSON.stringify(
            {
              runId,
              classification,
              buildReadinessScore,
              reasoningSummary,
              signals,
              requiredNextStages,
              blockingQuestions,
              confidence,
              createdAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        ),
        contentType: 'application/json',
        metadata: { runId, classification, tenantId },
      });
    } catch {
      /* non-fatal */
    }

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

    console.info(
      `Intake classifier: run ${runId} → ${classification} (readiness: ${buildReadinessScore}, confidence: ${confidence})`,
    );

    return {
      id: result.rows[0].id,
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
      createdAt: result.rows[0].createdAt,
    };
  } catch (err) {
    console.error('Intake classifier failed:', err);
    return null;
  }
}
