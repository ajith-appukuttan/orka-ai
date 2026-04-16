import type { Job } from 'bullmq';
import { query, getClient } from '../../db/pool.js';
import {
  createWorktree,
  commitInWorktree,
  pushWorktree,
  createPullRequest,
  writeWorktreeFile,
  readWorktreeFile,
  listWorktreeFiles,
  type WorktreeInfo,
} from '../../services/worktreeManager.js';
import {
  discoverSkills,
  selectSkillsForPRD,
  formatSkillsForPrompt,
} from '../../services/skillsLoader.js';
import { planBuildTasks, type BuildTask } from './taskPlanner.js';
import { generateCode } from './codeGenerator.js';
import { reviewChanges } from './reviewer.js';
import { generateTests } from './testGenerator.js';
import { createStorageClient, getArtifactBucket, buildArtifactKey } from '@orka/object-storage';
import { pubsub, EVENTS } from '../../pubsub/index.js';
import { transitionWorkspace } from '../../services/pipelineTransition.js';

const storageClient = createStorageClient();

export interface BuildResult {
  id: string;
  runId: string;
  branchName: string;
  commits: string[];
  pullRequestUrl: string | null;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  completedTasks: number;
  failedTasks: number;
  summary: string;
}

/**
 * Execute the full build pipeline for an approved PRD.
 */
export async function executeBuild(
  runId: string,
  workspaceId: string,
  tenantId: string,
  approvedArtifactId: string,
  classificationId: string,
  prd: Record<string, unknown>,
  repoUrl: string,
  sessionId?: string,
  job?: Job,
): Promise<BuildResult | null> {
  console.info(`[Builder] Starting build for run ${runId}...`);

  // Create build_run record
  const worktreeBranch = `run/${runId}`;
  const buildRunResult = await query(
    `INSERT INTO build_runs
     (run_id, intake_workspace_id, tenant_id, approved_artifact_id, classification_id,
      repo_url, worktree_branch, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'INITIALIZING')
     RETURNING id`,
    [runId, workspaceId, tenantId, approvedArtifactId, classificationId, repoUrl, worktreeBranch],
  );
  const buildRunId = buildRunResult.rows[0].id;

  const executionLog: Array<Record<string, unknown>> = [];
  const commits: string[] = [];

  try {
    // Step 1: Create worktree
    console.info(`[Builder] Creating worktree for ${repoUrl}...`);
    const worktree = await createWorktree(runId, repoUrl);

    await query(
      `UPDATE build_runs SET worktree_path = $1, repo_branch = $2, status = 'RUNNING', started_at = NOW()
       WHERE id = $3`,
      [worktree.worktreePath, worktree.baseBranch, buildRunId],
    );

    executionLog.push({ step: 'worktree_created', worktree, timestamp: new Date().toISOString() });
    await job?.updateProgress(10);

    // Step 2: Load skills
    console.info(`[Builder] Loading Claude skills...`);
    const allSkills = discoverSkills(worktree.worktreePath);
    const relevantSkills = selectSkillsForPRD(allSkills, prd);
    const skillsPrompt = formatSkillsForPrompt(relevantSkills);

    executionLog.push({
      step: 'skills_loaded',
      totalSkills: allSkills.length,
      selectedSkills: relevantSkills.map((s) => s.id),
      timestamp: new Date().toISOString(),
    });

    // Step 3: Load repo context
    const fileTree = listWorktreeFiles(worktree.worktreePath);

    // Load code targets if available
    const codeTargetsResult = await query<{
      filePath: string;
      symbolName: string;
      confidence: number;
    }>(
      `SELECT ct.file_path as "filePath", ct.symbol_name as "symbolName", ct.confidence
       FROM visual_requirement_code_targets ct
       JOIN visual_requirements vr ON vr.id = ct.visual_requirement_id
       WHERE vr.intake_workspace_id = $1
       ORDER BY ct.confidence DESC LIMIT 20`,
      [workspaceId],
    );

    // Load repo analysis
    const analysisResult = await query(
      `SELECT key_components, tech_stack FROM repository_analyses
       WHERE intake_workspace_id = $1 AND analysis_status = 'READY'
       ORDER BY analyzed_at DESC LIMIT 1`,
      [workspaceId],
    );

    const repoContext = {
      fileTree,
      keyComponents: analysisResult.rows[0]?.key_components || [],
      codeTargets: codeTargetsResult.rows,
      techStack: analysisResult.rows[0]?.tech_stack || [],
    };

    // Step 4: Plan tasks
    console.info(`[Builder] Planning tasks...`);
    const tasks = await planBuildTasks(prd, repoContext, skillsPrompt);

    if (tasks.length === 0) {
      throw new Error('Task planner produced no tasks');
    }

    // Persist tasks
    for (let i = 0; i < tasks.length; i++) {
      await query(
        `INSERT INTO build_tasks
         (build_run_id, task_index, description, files_affected, acceptance_criteria, dependencies)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          buildRunId,
          i,
          tasks[i].description,
          JSON.stringify(tasks[i].filesLikelyAffected),
          JSON.stringify(tasks[i].acceptanceCriteria),
          JSON.stringify(tasks[i].dependencies),
        ],
      );
    }

    await query(`UPDATE build_runs SET total_tasks = $1, updated_at = NOW() WHERE id = $2`, [
      tasks.length,
      buildRunId,
    ]);

    console.info(`[Builder] ${tasks.length} tasks planned`);
    await job?.updateProgress(20);
    executionLog.push({
      step: 'tasks_planned',
      taskCount: tasks.length,
      tasks: tasks.map((t) => ({ id: t.id, description: t.description })),
      timestamp: new Date().toISOString(),
    });

    // Step 5: Execute tasks iteratively
    let completedCount = 0;
    let failedCount = 0;

    for (const task of tasks) {
      console.info(`[Builder] Executing task: ${task.id} — ${task.description}`);

      // Update task status
      await query(
        `UPDATE build_tasks SET status = 'RUNNING', started_at = NOW()
         WHERE build_run_id = $1 AND task_index = $2`,
        [buildRunId, tasks.indexOf(task)],
      );

      try {
        // Generate code
        const codeResult = await generateCode(
          task,
          worktree.worktreePath,
          repoContext,
          skillsPrompt,
        );
        if (!codeResult || codeResult.changes.length === 0) {
          // No changes needed — mark as success (verification/read-only tasks)
          console.info(`[Builder] Task ${task.id}: no changes needed (verification task)`);
          completedCount++;
          await query(
            `UPDATE build_tasks SET status = 'SUCCESS', commit_message = 'No changes needed (verification)',
             completed_at = NOW() WHERE build_run_id = $1 AND task_index = $2`,
            [buildRunId, tasks.indexOf(task)],
          );
          await query(
            `UPDATE build_runs SET completed_tasks = $1, updated_at = NOW() WHERE id = $2`,
            [completedCount, buildRunId],
          );
          executionLog.push({
            step: 'task_completed',
            taskId: task.id,
            noChanges: true,
            timestamp: new Date().toISOString(),
          });
          await job?.updateProgress(20 + Math.round((80 * completedCount) / tasks.length));
          continue;
        }

        // Read originals for review
        const originals: Record<string, string | null> = {};
        for (const change of codeResult.changes) {
          originals[change.filePath] = readWorktreeFile(worktree.worktreePath, change.filePath);
        }

        // Review changes
        const review = await reviewChanges(task, codeResult.changes, originals);

        if (!review.approved && review.score < 0.7) {
          throw new Error(`Review failed (score: ${review.score}): ${review.issues.join('; ')}`);
        }

        // Apply changes to worktree
        for (const change of codeResult.changes) {
          if (change.action === 'DELETE') {
            // Skip deletes for safety
            continue;
          }
          writeWorktreeFile(worktree.worktreePath, change.filePath, change.content);
        }

        // Generate tests
        try {
          const testResult = await generateTests(task, codeResult.changes, worktree.worktreePath);
          if (testResult && testResult.testChanges.length > 0) {
            for (const testChange of testResult.testChanges) {
              writeWorktreeFile(worktree.worktreePath, testChange.filePath, testChange.content);
            }
            console.info(
              `[Builder] Generated ${testResult.testChanges.length} test file(s) for ${task.id}`,
            );
          }
        } catch (testErr) {
          console.warn(`[Builder] Test generation failed for ${task.id} (non-fatal):`, testErr);
        }

        // Commit
        const commitHash = await commitInWorktree(
          worktree.worktreePath,
          runId,
          codeResult.commitMessage,
        );

        commits.push(commitHash);
        completedCount++;

        // Update task status
        await query(
          `UPDATE build_tasks SET status = 'SUCCESS', commit_hash = $1, commit_message = $2,
           review_notes = $3, completed_at = NOW()
           WHERE build_run_id = $4 AND task_index = $5`,
          [
            commitHash,
            `[run:${runId}] ${codeResult.commitMessage}`,
            JSON.stringify({ score: review.score, suggestions: review.suggestions }),
            buildRunId,
            tasks.indexOf(task),
          ],
        );

        await query(
          `UPDATE build_runs SET completed_tasks = $1, updated_at = NOW() WHERE id = $2`,
          [completedCount, buildRunId],
        );

        console.info(`[Builder] Task ${task.id} completed (commit: ${commitHash.substring(0, 7)})`);

        executionLog.push({
          step: 'task_completed',
          taskId: task.id,
          commitHash,
          reviewScore: review.score,
          timestamp: new Date().toISOString(),
        });
        await job?.updateProgress(20 + Math.round((80 * completedCount) / tasks.length));
      } catch (taskErr) {
        failedCount++;
        const errMsg = taskErr instanceof Error ? taskErr.message : String(taskErr);
        console.error(`[Builder] Task ${task.id} failed: ${errMsg}`);

        await query(
          `UPDATE build_tasks SET status = 'FAILED', error_message = $1, completed_at = NOW()
           WHERE build_run_id = $2 AND task_index = $3`,
          [errMsg, buildRunId, tasks.indexOf(task)],
        );

        await query(`UPDATE build_runs SET failed_tasks = $1, updated_at = NOW() WHERE id = $2`, [
          failedCount,
          buildRunId,
        ]);

        executionLog.push({
          step: 'task_failed',
          taskId: task.id,
          error: errMsg,
          timestamp: new Date().toISOString(),
        });
        await job?.updateProgress(
          20 + Math.round((80 * (completedCount + failedCount)) / tasks.length),
        );
      }
    }

    // Step 6: Push and create PR
    let prUrl: string | null = null;
    let prNumber: number | undefined;

    if (completedCount > 0) {
      console.info(`[Builder] Pushing branch ${worktreeBranch}...`);
      await pushWorktree(worktree.worktreePath, worktreeBranch);

      console.info(`[Builder] Creating PR...`);
      const prdTitle = (prd.title as string) || 'Automated Build';
      const prdSummary = ((prd.problemStatement as Record<string, unknown>)?.what as string) || '';

      const prBody = [
        `## ${prdTitle}`,
        '',
        prdSummary,
        '',
        `### Tasks Completed: ${completedCount}/${tasks.length}`,
        '',
        ...tasks.map((t, i) => {
          const status = i < completedCount ? 'done' : 'x';
          return `- [${status}] ${t.description}`;
        }),
        '',
        `---`,
        `*Automated by Orka Builder | Run ID: ${runId}*`,
      ].join('\n');

      const pr = await createPullRequest(
        repoUrl,
        worktreeBranch,
        worktree.baseBranch,
        `[run:${runId}] ${prdTitle}`,
        prBody,
      );

      if (pr) {
        prUrl = pr.url;
        prNumber = pr.number;
        console.info(`[Builder] PR created: ${prUrl}`);
      }
    }

    // Step 7: Finalize
    const status = failedCount === 0 ? 'SUCCESS' : completedCount > 0 ? 'PARTIAL' : 'FAILED';
    const summary = `Build ${status.toLowerCase()}: ${completedCount}/${tasks.length} tasks completed${prUrl ? `. PR: ${prUrl}` : ''}`;

    await query(
      `UPDATE build_runs SET status = $1, summary = $2, pr_url = $3, pr_number = $4,
       completed_at = NOW(), updated_at = NOW()
       WHERE id = $5`,
      [status, summary, prUrl, prNumber || null, buildRunId],
    );

    // Persist execution log to object storage
    try {
      const objectKey = buildArtifactKey({
        tenantId,
        workspaceId,
        projectId: 'default',
        stage: 'BUILD',
        runId,
        artifactType: 'EXECUTION_LOG',
        version: 1,
      });

      await storageClient.putObject({
        bucket: getArtifactBucket(),
        key: objectKey,
        body: Buffer.from(JSON.stringify(executionLog, null, 2)),
        contentType: 'application/json',
        metadata: { runId, status, tenantId },
      });

      await query(`UPDATE build_runs SET execution_log_key = $1, bucket_name = $2 WHERE id = $3`, [
        objectKey,
        getArtifactBucket(),
        buildRunId,
      ]);
    } catch (storageErr) {
      console.warn('[Builder] Execution log storage failed (non-fatal):', storageErr);
    }

    // Post chat message if session exists
    if (sessionId) {
      const statusIcon = status === 'SUCCESS' ? 'teal' : status === 'PARTIAL' ? 'yellow' : 'red';
      let chatContent = `## Build ${status === 'SUCCESS' ? 'Complete' : status === 'PARTIAL' ? 'Partially Complete' : 'Failed'}\n\n`;
      chatContent += `**Tasks:** ${completedCount}/${tasks.length} completed\n`;
      chatContent += `**Commits:** ${commits.length}\n`;
      chatContent += `**Branch:** \`${worktreeBranch}\`\n`;
      if (prUrl) chatContent += `\n**Pull Request:** [View PR](${prUrl})\n`;
      chatContent += `\n*Run ID: ${runId}*`;

      const msgResult = await query(
        `INSERT INTO intake_messages (session_id, role, content, persona)
         VALUES ($1, 'assistant', $2, 'Virtual Builder')
         RETURNING id, session_id as "sessionId", role, content, persona,
                   tool_calls as "toolCalls", created_at as "createdAt"`,
        [sessionId, chatContent],
      );

      if (msgResult.rows[0]) {
        pubsub.publish(EVENTS.MESSAGE_STREAM(sessionId), {
          intakeMessageStream: msgResult.rows[0],
        });
      }
    }

    console.info(`[Builder] Build complete: ${summary}`);

    // Transition workspace: BUILDING → BUILT or FAILED
    await transitionWorkspace(
      workspaceId,
      status === 'FAILED' ? 'FAILED' : 'BUILT',
      'builder',
      runId,
      { completedTasks: completedCount, failedTasks: failedCount, prUrl },
    );

    return {
      id: buildRunId,
      runId,
      branchName: worktreeBranch,
      commits,
      pullRequestUrl: prUrl,
      status,
      completedTasks: completedCount,
      failedTasks: failedCount,
      summary,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Builder] Build failed for run ${runId}:`, errMsg);

    try {
      await query(
        `UPDATE build_runs SET status = 'FAILED', summary = $1, completed_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [`Build failed: ${errMsg}`, buildRunId],
      );
    } catch (dbErr) {
      console.error(`[Builder] Failed to update build_runs for ${runId}:`, dbErr);
    }

    try {
      await transitionWorkspace(workspaceId, 'FAILED', 'builder', runId, { error: errMsg });
    } catch (transitionErr) {
      console.error(`[Builder] Failed to transition workspace for ${runId}:`, transitionErr);
    }

    return null;
  }
}
