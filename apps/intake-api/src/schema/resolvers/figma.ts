import crypto from 'node:crypto';
import { query } from '../../db/pool.js';
import {
  parseFigmaUrl,
  extractFigmaDesign,
  generateFigmaRequirements as generateFigmaRequirementsAgent,
  runFigmaRepoDiscovery as runFigmaRepoDiscoveryAgent,
  composeFigmaPRD,
} from '../../agents/figmaIntake.js';
import type { FigmaDesignContext, RepoMapping } from '../../agents/figmaIntake.js';
import { pubsub, EVENTS } from '../../pubsub/index.js';

const SESSION_COLUMNS = `
  id, intake_workspace_id AS "intakeWorkspaceId",
  figma_file_key AS "figmaFileKey", figma_file_url AS "figmaFileUrl",
  file_name AS "fileName", status,
  extracted_context AS "extractedContext", error_message AS "errorMessage",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

const FRAME_COLUMNS = `
  id, session_id AS "sessionId", node_id AS "nodeId", name,
  node_type AS "nodeType", parent_node_id AS "parentNodeId",
  page_name AS "pageName", width, height,
  thumbnail_url AS "thumbnailUrl",
  extracted_text AS "extractedText",
  child_components AS "childComponents",
  layout_info AS "layoutInfo"
`;

const COMPONENT_COLUMNS = `
  id, session_id AS "sessionId", node_id AS "nodeId", name,
  component_set_name AS "componentSetName", description,
  page_name AS "pageName", properties
`;

const SELECTION_COLUMNS = `
  id, session_id AS "sessionId", node_id AS "nodeId",
  node_type AS "nodeType", selected_at AS "selectedAt"
`;

const MAPPING_COLUMNS = `
  id, session_id AS "sessionId",
  figma_component_name AS "figmaComponentName",
  file_path AS "filePath", symbol_name AS "symbolName",
  confidence, match_reason AS "matchReason"
`;

const REQUIREMENT_COLUMNS = `
  id, session_id AS "sessionId",
  intake_workspace_id AS "intakeWorkspaceId",
  frame_node_id AS "frameNodeId", title, summary,
  requirement_type AS "requirementType",
  acceptance_criteria AS "acceptanceCriteria",
  code_target_hints AS "codeTargetHints",
  open_questions AS "openQuestions",
  confidence, status,
  created_at AS "createdAt"
`;

export const figmaResolvers = {
  Query: {
    figmaDesignSession: async (_: unknown, { sessionId }: { sessionId: string }) => {
      const result = await query(
        `SELECT ${SESSION_COLUMNS} FROM figma_design_sessions WHERE id = $1`,
        [sessionId],
      );
      return result.rows[0] || null;
    },

    figmaFrames: async (_: unknown, { sessionId }: { sessionId: string }) => {
      const result = await query(
        `SELECT ${FRAME_COLUMNS} FROM figma_frames
         WHERE session_id = $1 ORDER BY created_at`,
        [sessionId],
      );
      return result.rows;
    },

    figmaComponents: async (_: unknown, { sessionId }: { sessionId: string }) => {
      const result = await query(
        `SELECT ${COMPONENT_COLUMNS} FROM figma_components
         WHERE session_id = $1 ORDER BY created_at`,
        [sessionId],
      );
      return result.rows;
    },

    figmaRepoMappings: async (_: unknown, { sessionId }: { sessionId: string }) => {
      const result = await query(
        `SELECT ${MAPPING_COLUMNS} FROM figma_repo_mappings
         WHERE session_id = $1 ORDER BY created_at`,
        [sessionId],
      );
      return result.rows;
    },

    figmaRequirements: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `SELECT ${REQUIREMENT_COLUMNS} FROM figma_requirements
         WHERE intake_workspace_id = $1 AND status != 'ARCHIVED'
         ORDER BY created_at DESC`,
        [workspaceId],
      );
      return result.rows;
    },
  },

  Mutation: {
    startFigmaIntake: async (
      _: unknown,
      { workspaceId, figmaUrl }: { workspaceId: string; figmaUrl: string },
    ) => {
      const { fileKey } = parseFigmaUrl(figmaUrl);

      // Get tenant from workspace
      const ws = await query<{ tenant_id: string }>(
        'SELECT tenant_id FROM intake_workspaces WHERE id = $1',
        [workspaceId],
      );
      const tenantId = ws.rows[0]?.tenant_id ?? 'default';

      const sessionId = crypto.randomUUID();

      const result = await query(
        `INSERT INTO figma_design_sessions (id, intake_workspace_id, figma_file_key, figma_file_url)
         VALUES ($1, $2, $3, $4)
         RETURNING ${SESSION_COLUMNS}`,
        [sessionId, workspaceId, fileKey, figmaUrl],
      );

      const session = result.rows[0];

      // Fire-and-forget: extract design data asynchronously
      extractFigmaDesign(sessionId, fileKey, tenantId).catch((err: unknown) => {
        console.error(`[FigmaIntake] extractFigmaDesign failed for session ${sessionId}:`, err);
      });

      return session;
    },

    selectFigmaNodes: async (
      _: unknown,
      { sessionId, nodeIds }: { sessionId: string; nodeIds: string[] },
    ) => {
      // Delete existing selections for this session
      await query('DELETE FROM figma_node_selections WHERE session_id = $1', [sessionId]);

      if (nodeIds.length === 0) return [];

      // Insert new selections one at a time (simple and correct)
      const inserted = [];
      for (const nodeId of nodeIds) {
        const r = await query(
          `INSERT INTO figma_node_selections (id, session_id, node_id, node_type)
           VALUES ($1, $2, $3, 'FRAME')
           RETURNING ${SELECTION_COLUMNS}`,
          [crypto.randomUUID(), sessionId, nodeId],
        );
        inserted.push(r.rows[0]);
      }

      return inserted;
    },

    runFigmaRepoDiscovery: async (_: unknown, { sessionId }: { sessionId: string }) => {
      // Load session and workspace
      const sessionResult = await query(
        `SELECT s.id, s.extracted_context, s.intake_workspace_id,
                w.repo_url, w.tenant_id
         FROM figma_design_sessions s
         JOIN intake_workspaces w ON w.id = s.intake_workspace_id
         WHERE s.id = $1`,
        [sessionId],
      );
      const session = sessionResult.rows[0];
      if (!session) throw new Error('Figma session not found');

      const extractedContext = (session.extracted_context || {}) as FigmaDesignContext;
      const repoUrl = session.repo_url as string;
      const tenantId = (session.tenant_id as string) ?? 'default';
      if (!repoUrl) throw new Error('No repository URL configured on workspace');

      // Call agent — returns a JSON string of mappings
      const resultJson = await runFigmaRepoDiscoveryAgent(
        sessionId,
        extractedContext,
        repoUrl,
        tenantId,
      );

      // Delete old mappings
      await query('DELETE FROM figma_repo_mappings WHERE session_id = $1', [sessionId]);

      // Parse result
      let mappings: RepoMapping[];
      try {
        mappings = JSON.parse(resultJson);
      } catch {
        mappings = [];
      }
      if (!mappings || mappings.length === 0) return [];

      // Insert new mappings
      const inserted = [];
      for (const m of mappings) {
        const r = await query(
          `INSERT INTO figma_repo_mappings
             (session_id, figma_component_name, file_path, symbol_name, confidence, match_reason)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING ${MAPPING_COLUMNS}`,
          [sessionId, m.figmaComponentName, m.filePath, m.symbolName, m.confidence, m.matchReason],
        );
        inserted.push(r.rows[0]);
      }

      return inserted;
    },

    generateFigmaRequirements: async (_: unknown, { sessionId }: { sessionId: string }) => {
      // Load session
      const sessionResult = await query(
        `SELECT id, intake_workspace_id AS "intakeWorkspaceId",
                extracted_context AS "extractedContext"
         FROM figma_design_sessions WHERE id = $1`,
        [sessionId],
      );
      const session = sessionResult.rows[0];
      if (!session) throw new Error('Figma session not found');

      // Load selected node IDs
      const selectionsResult = await query(
        `SELECT node_id AS "nodeId"
         FROM figma_node_selections WHERE session_id = $1`,
        [sessionId],
      );
      const selectedNodeIds = selectionsResult.rows.map((r) => (r as { nodeId: string }).nodeId);

      // Load repo mappings
      const mappingsResult = await query(
        `SELECT figma_component_name AS "figmaComponentName",
                file_path AS "filePath", symbol_name AS "symbolName",
                confidence, match_reason AS "matchReason"
         FROM figma_repo_mappings WHERE session_id = $1`,
        [sessionId],
      );
      const repoMappings = mappingsResult.rows as RepoMapping[];

      const designContext = (session.extractedContext || {}) as FigmaDesignContext;

      // Call agent — returns a JSON string of requirements
      const resultJson = await generateFigmaRequirementsAgent(
        sessionId,
        selectedNodeIds,
        designContext,
        repoMappings,
      );

      // Parse result
      let requirements: Array<{
        frameNodeId?: string;
        title: string;
        summary?: string;
        requirementType?: string;
        acceptanceCriteria?: unknown[];
        codeTargetHints?: unknown[];
        openQuestions?: unknown[];
        confidence?: number;
      }>;
      try {
        requirements = JSON.parse(resultJson);
      } catch {
        requirements = [];
      }
      if (!requirements || requirements.length === 0) return [];

      // Insert requirements
      const inserted = [];
      for (const req of requirements) {
        const r = await query(
          `INSERT INTO figma_requirements
             (session_id, intake_workspace_id, frame_node_id, title, summary,
              requirement_type, acceptance_criteria, code_target_hints,
              open_questions, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING ${REQUIREMENT_COLUMNS}`,
          [
            sessionId,
            session.intakeWorkspaceId,
            req.frameNodeId || null,
            req.title,
            req.summary || '',
            req.requirementType || 'SCREEN',
            JSON.stringify(req.acceptanceCriteria || []),
            JSON.stringify(req.codeTargetHints || []),
            JSON.stringify(req.openQuestions || []),
            req.confidence ?? 0.8,
          ],
        );
        inserted.push(r.rows[0]);
      }

      return inserted;
    },

    generateFigmaPRD: async (_: unknown, { sessionId }: { sessionId: string }) => {
      // Load session
      const sessionResult = await query(
        `SELECT id, intake_workspace_id AS "intakeWorkspaceId",
                extracted_context AS "extractedContext"
         FROM figma_design_sessions WHERE id = $1`,
        [sessionId],
      );
      const session = sessionResult.rows[0];
      if (!session) throw new Error('Figma session not found');

      const workspaceId = session.intakeWorkspaceId as string;
      const designContext = (session.extractedContext || {}) as FigmaDesignContext;

      // Load figma requirements
      const reqResult = await query(
        `SELECT ${REQUIREMENT_COLUMNS} FROM figma_requirements
         WHERE session_id = $1 AND status != 'ARCHIVED'`,
        [sessionId],
      );

      // Load repo mappings
      const mappingsResult = await query(
        `SELECT figma_component_name AS "figmaComponentName",
                file_path AS "filePath", symbol_name AS "symbolName",
                confidence, match_reason AS "matchReason"
         FROM figma_repo_mappings WHERE session_id = $1`,
        [sessionId],
      );

      // Call agent to compose PRD — returns a JSON string
      const resultJson = await composeFigmaPRD(
        sessionId,
        reqResult.rows,
        mappingsResult.rows,
        designContext,
      );

      let prdJson: Record<string, unknown>;
      try {
        prdJson = JSON.parse(resultJson);
      } catch {
        throw new Error('Failed to parse Figma PRD output');
      }

      // Determine next version number
      const versionResult = await query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM intake_draft_versions WHERE intake_workspace_id = $1`,
        [workspaceId],
      );
      const nextVersion = versionResult.rows[0].next_version;

      // Insert new draft version
      const draftResult = await query(
        `INSERT INTO intake_draft_versions
           (intake_workspace_id, version, draft_json, readiness_score, change_source)
         VALUES ($1, $2, $3, $4, 'figma_prd')
         RETURNING id, intake_workspace_id AS "intakeWorkspaceId",
                   version, draft_json AS "draftJson",
                   readiness_score AS "readinessScore",
                   ready_for_review AS "readyForReview",
                   created_at AS "createdAt"`,
        [workspaceId, nextVersion, JSON.stringify(prdJson), (prdJson.confidence as number) ?? 0.5],
      );

      // Update workspace latest_draft_id
      await query('UPDATE intake_workspaces SET latest_draft_id = $1 WHERE id = $2', [
        draftResult.rows[0].id,
        workspaceId,
      ]);

      return draftResult.rows[0];
    },
  },

  Subscription: {
    figmaExtractionProgress: {
      subscribe: (_: unknown, { sessionId }: { sessionId: string }) => {
        return pubsub.asyncIterator(EVENTS.FIGMA_EXTRACTION_PROGRESS(sessionId));
      },
    },
  },

  // Field resolvers for FigmaDesignSession type
  FigmaDesignSession: {
    frames: async (session: { id: string }) => {
      const result = await query(
        `SELECT ${FRAME_COLUMNS} FROM figma_frames
         WHERE session_id = $1 ORDER BY created_at`,
        [session.id],
      );
      return result.rows;
    },

    components: async (session: { id: string }) => {
      const result = await query(
        `SELECT ${COMPONENT_COLUMNS} FROM figma_components
         WHERE session_id = $1 ORDER BY created_at`,
        [session.id],
      );
      return result.rows;
    },

    selections: async (session: { id: string }) => {
      const result = await query(
        `SELECT ${SELECTION_COLUMNS} FROM figma_node_selections
         WHERE session_id = $1 ORDER BY selected_at`,
        [session.id],
      );
      return result.rows;
    },
  },
};
