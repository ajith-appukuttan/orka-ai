import { query } from '../../db/pool.js';
import { runRepoAnalyzer, mapRequirementsToCode } from '../../agents/repoAnalyzer.js';

export const repoResolvers = {
  Query: {
    repositoryAnalysis: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `SELECT id, repo_url as "repoUrl", analysis_status as "status",
                readme_summary as "readmeSummary", tech_stack as "techStack",
                key_components as "keyComponents",
                architecture_notes as "architectureNotes",
                entry_points as "entryPoints",
                analyzed_at as "analyzedAt", created_at as "createdAt"
         FROM repository_analyses
         WHERE intake_workspace_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [workspaceId],
      );
      return result.rows[0] || null;
    },

    codeTargetsForRequirement: async (_: unknown, { requirementId }: { requirementId: string }) => {
      const result = await query(
        `SELECT id, file_path as "filePath", symbol_name as "symbolName",
                match_reason as "matchReason", confidence
         FROM visual_requirement_code_targets
         WHERE visual_requirement_id = $1
         ORDER BY confidence DESC`,
        [requirementId],
      );
      return result.rows;
    },
  },

  Mutation: {
    analyzeRepository: async (
      _: unknown,
      { workspaceId, repoUrl, branch }: { workspaceId: string; repoUrl: string; branch?: string },
    ) => {
      const analysis = await runRepoAnalyzer(workspaceId, repoUrl, branch || undefined);

      if (!analysis) {
        throw new Error('Repository analysis failed. Check logs for details.');
      }

      return {
        id: analysis.id,
        repoUrl: analysis.repoUrl,
        status: analysis.status,
        readmeSummary: analysis.readmeSummary,
        techStack: analysis.techStack,
        keyComponents: analysis.keyComponents,
        architectureNotes: analysis.architectureNotes,
        entryPoints: analysis.entryPoints,
        analyzedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
    },

    mapRequirementsToCode: async (
      _: unknown,
      { workspaceId, requirementIds }: { workspaceId: string; requirementIds?: string[] },
    ) => {
      const results = await mapRequirementsToCode(workspaceId, requirementIds);
      return results;
    },
  },

  // Field resolver: resolve repoAnalysis on IntakeWorkspace
  IntakeWorkspace: {
    repoAnalysis: async (workspace: { id: string }) => {
      const result = await query(
        `SELECT id, repo_url as "repoUrl", analysis_status as "status",
                readme_summary as "readmeSummary", tech_stack as "techStack",
                key_components as "keyComponents",
                architecture_notes as "architectureNotes",
                entry_points as "entryPoints",
                analyzed_at as "analyzedAt", created_at as "createdAt"
         FROM repository_analyses
         WHERE intake_workspace_id = $1 AND analysis_status = 'READY'
         ORDER BY created_at DESC LIMIT 1`,
        [workspace.id],
      );
      return result.rows[0] || null;
    },
  },
};
