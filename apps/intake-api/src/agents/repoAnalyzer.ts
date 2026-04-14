import { query, getClient } from '../db/pool.js';
import { analyzeRepository } from '../services/claude.js';
import { invokeTool, logToolCall } from '../services/mcpClient.js';

export interface RepoAnalysisResult {
  id: string;
  repoUrl: string;
  readmeSummary: string | null;
  techStack: Array<{ category: string; name: string; version?: string }>;
  keyComponents: Array<{
    filePath: string;
    symbolName: string;
    type: string;
    description: string;
  }>;
  architectureNotes: string | null;
  entryPoints: string[];
  status: string;
}

/**
 * Run repository analysis:
 * 1. Invoke repo-discovery MCP tool to clone and extract raw data
 * 2. Send raw data to Claude with the repo-analyzer prompt
 * 3. Parse and persist the analysis results
 * 4. Update workspace repo status
 */
export async function runRepoAnalyzer(
  workspaceId: string,
  repoUrl: string,
  branch?: string,
  sessionId?: string,
): Promise<RepoAnalysisResult | null> {
  const tenantResult = await query<{ tenant_id: string }>(
    'SELECT tenant_id FROM intake_workspaces WHERE id = $1',
    [workspaceId],
  );
  const tenantId = tenantResult.rows[0]?.tenant_id ?? 'default';

  // Create analysis record
  const analysisResult = await query(
    `INSERT INTO repository_analyses (intake_workspace_id, repo_url, analysis_status)
     VALUES ($1, $2, 'ANALYZING')
     RETURNING id`,
    [workspaceId, repoUrl],
  );
  const analysisId = analysisResult.rows[0].id;

  // Update workspace status
  await query(
    `UPDATE intake_workspaces SET repo_url = $1, repo_status = 'ANALYZING', updated_at = NOW()
     WHERE id = $2`,
    [repoUrl, workspaceId],
  );

  try {
    // 1. Clone and extract via MCP tool
    console.info(`Repo analysis: cloning ${repoUrl}...`);
    const toolInput: Record<string, unknown> = { repoUrl };
    if (branch) toolInput.branch = branch;

    const discoveryResult = await invokeTool(
      'repo-discovery',
      toolInput,
      sessionId || workspaceId,
      tenantId,
    );

    if (discoveryResult.status !== 'success' || discoveryResult.output.error) {
      throw new Error(
        (discoveryResult.output.error as string) || discoveryResult.error || 'Clone failed',
      );
    }

    // Log the tool call
    if (sessionId) {
      await logToolCall(sessionId, null, discoveryResult, { repoUrl, branch });
    }

    const repoData = discoveryResult.output;
    const cloneDir = repoData.cloneDir as string;

    // 2. Send to Claude for analysis
    console.info(`Repo analysis: analyzing with Claude...`);
    const rawJson = await analyzeRepository({
      readme: repoData.readme as string | null,
      fileTree: repoData.fileTree as string[],
      manifests: repoData.manifests as Array<Record<string, unknown>>,
      entryPoints: repoData.entryPoints as string[],
      entryPointContents: repoData.entryPointContents as Record<string, string>,
    });

    // 3. Parse response
    let analysis: Record<string, unknown>;
    try {
      const cleaned = rawJson
        .replace(/^```json?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      analysis = JSON.parse(cleaned);
    } catch {
      throw new Error('Failed to parse Claude analysis response');
    }

    // 4. Persist results
    const dbClient = await getClient();
    try {
      await dbClient.query('BEGIN');

      await dbClient.query(
        `UPDATE repository_analyses SET
           analysis_status = 'READY',
           readme_summary = $1,
           tech_stack = $2,
           file_tree = $3,
           key_components = $4,
           architecture_notes = $5,
           entry_points = $6,
           analyzed_at = NOW(),
           updated_at = NOW()
         WHERE id = $7`,
        [
          analysis.readmeSummary || null,
          JSON.stringify(analysis.techStack || []),
          JSON.stringify(repoData.fileTree || []),
          JSON.stringify(analysis.keyComponents || []),
          (analysis.architecture as Record<string, unknown>)?.notes || null,
          JSON.stringify(
            (analysis.architecture as Record<string, unknown>)?.entryPoints ||
              repoData.entryPoints ||
              [],
          ),
          analysisId,
        ],
      );

      await dbClient.query(
        `UPDATE intake_workspaces SET repo_status = 'READY', updated_at = NOW()
         WHERE id = $1`,
        [workspaceId],
      );

      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }

    console.info(
      `Repo analysis complete: ${repoUrl} — ${(analysis.keyComponents as unknown[])?.length || 0} components found`,
    );

    return {
      id: analysisId,
      repoUrl,
      readmeSummary: (analysis.readmeSummary as string) || null,
      techStack: (analysis.techStack as RepoAnalysisResult['techStack']) || [],
      keyComponents: (analysis.keyComponents as RepoAnalysisResult['keyComponents']) || [],
      architectureNotes:
        ((analysis.architecture as Record<string, unknown>)?.notes as string) || null,
      entryPoints: (repoData.entryPoints as string[]) || [],
      status: 'READY',
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Repo analysis failed for ${repoUrl}:`, errorMsg);

    // Mark as failed
    await query(
      `UPDATE repository_analyses SET analysis_status = 'FAILED', error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [errorMsg, analysisId],
    );
    await query(
      `UPDATE intake_workspaces SET repo_status = 'FAILED', updated_at = NOW()
       WHERE id = $1`,
      [workspaceId],
    );

    return null;
  }
}

/**
 * Map visual requirements to code targets using GitHub Search API.
 * No cloning needed — searches the repo for selectors, class names,
 * component names, and text content from visual requirements.
 */
export async function mapRequirementsToCode(
  workspaceId: string,
  requirementIds?: string[],
): Promise<
  Array<{
    requirementId: string;
    codeTargets: Array<{ filePath: string; symbolName: string; confidence: number }>;
  }>
> {
  // Load workspace repo URL
  const wsResult = await query<{ repo_url: string; tenant_id: string }>(
    `SELECT repo_url, tenant_id FROM intake_workspaces WHERE id = $1`,
    [workspaceId],
  );

  if (wsResult.rows.length === 0 || !wsResult.rows[0].repo_url) {
    console.warn('mapRequirementsToCode: no repo URL configured');
    return [];
  }

  const repoUrl = wsResult.rows[0].repo_url;
  const tenantId = wsResult.rows[0].tenant_id;

  // Load visual requirements with their selection data
  let reqFilter = "AND vr.status != 'ARCHIVED'";
  const params: unknown[] = [workspaceId];
  if (requirementIds && requirementIds.length > 0) {
    reqFilter = 'AND vr.id = ANY($2)';
    params.push(requirementIds);
  }

  const reqsResult = await query<{
    id: string;
    target_area: string;
    requested_change: string;
    title: string;
    selector: string | null;
    text_content: string | null;
  }>(
    `SELECT vr.id, vr.target_area, vr.requested_change, vr.title,
            vs.selector, vs.text_content
     FROM visual_requirements vr
     LEFT JOIN visual_selections vs ON vs.id = vr.selection_id
     WHERE vr.intake_workspace_id = $1 ${reqFilter}`,
    params,
  );

  const results: Array<{
    requirementId: string;
    codeTargets: Array<{ filePath: string; symbolName: string; confidence: number }>;
  }> = [];

  for (const req of reqsResult.rows) {
    try {
      console.info(`Searching code targets for "${req.title}"...`);

      const searchResult = await invokeTool(
        'github-search',
        {
          repoUrl,
          element: {
            selector: req.selector || '',
            textContent: req.text_content || '',
            targetArea: req.target_area || '',
          },
        },
        workspaceId,
        tenantId,
      );

      const codeTargets: Array<{ filePath: string; symbolName: string; confidence: number }> = [];

      if (searchResult.status === 'success' && searchResult.output.matches) {
        const matches = searchResult.output.matches as Array<{
          filePath: string;
          query: string;
          fragment?: string;
        }>;

        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const confidence = i < 3 ? Math.max(0.9 - i * 0.1, 0.5) : Math.max(0.6 - i * 0.05, 0.3);
          const fileName = match.filePath.split('/').pop() || '';
          const symbolName = fileName.replace(/\.(tsx?|jsx?|vue|svelte)$/, '');

          codeTargets.push({ filePath: match.filePath, symbolName, confidence });

          await query(
            `INSERT INTO visual_requirement_code_targets
             (visual_requirement_id, file_path, symbol_name, match_reason, confidence)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT DO NOTHING`,
            [
              req.id,
              match.filePath,
              symbolName,
              `GitHub search: "${match.query}"${match.fragment ? ` — ${match.fragment.substring(0, 80)}` : ''}`,
              confidence,
            ],
          );
        }

        console.info(`Code targets for "${req.title}": ${codeTargets.length} files found`);
      }

      results.push({ requirementId: req.id, codeTargets });
    } catch (err) {
      console.error(`Code target mapping failed for "${req.title}":`, err);
      results.push({ requirementId: req.id, codeTargets: [] });
    }
  }

  return results;
}
