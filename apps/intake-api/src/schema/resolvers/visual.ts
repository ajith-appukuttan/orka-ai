import crypto from 'node:crypto';
import { query, getClient } from '../../db/pool.js';
import { runVisualRequirementGenerator } from '../../agents/visualRequirementGenerator.js';
import { runVisualPRDAggregator } from '../../agents/visualPRDAggregator.js';
import { pubsub, EVENTS } from '../../pubsub/index.js';
import { createStorageClient, getArtifactBucket } from '@orka/object-storage';
import { config } from '../../config.js';

const storageClient = createStorageClient();

const PREVIEW_BROWSER_URL = process.env.PREVIEW_BROWSER_URL || 'http://localhost:4002';

export const visualResolvers = {
  Query: {
    visualPreviewSession: async (_: unknown, { id }: { id: string }) => {
      const result = await query(
        `SELECT id, intake_workspace_id as "intakeWorkspaceId", url, status,
                created_at as "createdAt"
         FROM visual_preview_sessions WHERE id = $1`,
        [id],
      );
      return result.rows[0] || null;
    },

    visualSelections: async (_: unknown, { sessionId }: { sessionId: string }) => {
      const result = await query(
        `SELECT id, session_id as "sessionId", selector, dom_path as "domPath",
                text_content as "textContent", bounding_box as "boundingBox",
                aria_role as "ariaRole", screenshot_ref as "screenshotRef",
                page_url as "pageUrl", created_at as "createdAt"
         FROM visual_selections WHERE session_id = $1 ORDER BY created_at`,
        [sessionId],
      );
      return result.rows;
    },

    visualRequirements: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `SELECT id, intake_workspace_id as "intakeWorkspaceId",
                selection_id as "selectionId", title, summary,
                user_goal as "userGoal", target_area as "targetArea",
                requested_change as "requestedChange",
                change_category as "changeCategory",
                acceptance_criteria as "acceptanceCriteria",
                implementation_hints as "implementationHints",
                open_questions as "openQuestions", confidence, status,
                created_at as "createdAt"
         FROM visual_requirements
         WHERE intake_workspace_id = $1 AND status != 'ARCHIVED'
         ORDER BY created_at DESC`,
        [workspaceId],
      );
      return result.rows;
    },
  },

  Mutation: {
    startVisualIntakeSession: async (
      _: unknown,
      { workspaceId, url }: { workspaceId: string; url: string },
    ) => {
      // Launch a real Chrome window with the target URL
      let launchResult;
      try {
        const response = await fetch(`${PREVIEW_BROWSER_URL}/chrome/launch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        if (!response.ok) {
          const err = (await response.json()) as { error?: string };
          throw new Error(err.error || `Preview service returned ${response.status}`);
        }
        launchResult = (await response.json()) as { status: string; cdpPort: number; pid: number };
      } catch (err) {
        throw new Error(
          `Failed to launch browser: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }

      const sessionId = crypto.randomUUID();

      // Save session to DB
      const result = await query(
        `INSERT INTO visual_preview_sessions (id, intake_workspace_id, url)
         VALUES ($1, $2, $3)
         RETURNING id, intake_workspace_id as "intakeWorkspaceId", url, status,
                   created_at as "createdAt"`,
        [sessionId, workspaceId, url],
      );

      return {
        ...result.rows[0],
        browserLaunched: true,
      };
    },

    selectVisualElement: async (
      _: unknown,
      { sessionId, x, y }: { sessionId: string; x: number; y: number },
    ) => {
      // Get element info from preview-browser service
      let elementData;
      try {
        const response = await fetch(`${PREVIEW_BROWSER_URL}/sessions/${sessionId}/element-at`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x, y }),
        });
        if (!response.ok) {
          throw new Error(`Preview service returned ${response.status}`);
        }
        elementData = (await response.json()) as {
          element: {
            selector: string;
            domPath: string;
            textContent: string;
            boundingBox: { x: number; y: number; width: number; height: number };
            ariaRole: string | null;
            tagName: string;
          };
          screenshot: string | null;
        };
      } catch (err) {
        throw new Error(`Failed to get element: ${err instanceof Error ? err.message : 'unknown'}`);
      }

      // Get session URL
      const sessionResult = await query<{ url: string }>(
        'SELECT url FROM visual_preview_sessions WHERE id = $1',
        [sessionId],
      );
      const pageUrl = sessionResult.rows[0]?.url ?? '';

      // Save selection
      const result = await query(
        `INSERT INTO visual_selections
         (session_id, selector, dom_path, text_content, bounding_box, aria_role, screenshot_ref, page_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, session_id as "sessionId", selector, dom_path as "domPath",
                   text_content as "textContent", bounding_box as "boundingBox",
                   aria_role as "ariaRole", screenshot_ref as "screenshotRef",
                   page_url as "pageUrl", created_at as "createdAt"`,
        [
          sessionId,
          elementData.element.selector,
          elementData.element.domPath,
          elementData.element.textContent,
          JSON.stringify(elementData.element.boundingBox),
          elementData.element.ariaRole,
          elementData.screenshot,
          pageUrl,
        ],
      );

      return {
        ...result.rows[0],
        elementScreenshot: elementData.screenshot,
      };
    },

    // Save a visual selection captured from polling (so submitVisualChange can find it)
    saveVisualSelection: async (
      _: unknown,
      {
        sessionId,
        selector,
        domPath,
        textContent,
        boundingBox,
        ariaRole,
        screenshotRef,
        pageUrl,
      }: {
        sessionId: string;
        selector: string;
        domPath?: string;
        textContent?: string;
        boundingBox: Record<string, number>;
        ariaRole?: string;
        screenshotRef?: string;
        pageUrl: string;
      },
    ) => {
      const result = await query(
        `INSERT INTO visual_selections
         (session_id, selector, dom_path, text_content, bounding_box, aria_role, screenshot_ref, page_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, session_id as "sessionId", selector, dom_path as "domPath",
                   text_content as "textContent", bounding_box as "boundingBox",
                   aria_role as "ariaRole", screenshot_ref as "screenshotRef",
                   page_url as "pageUrl", created_at as "createdAt"`,
        [
          sessionId,
          selector,
          domPath || null,
          textContent || null,
          JSON.stringify(boundingBox),
          ariaRole || null,
          screenshotRef || null,
          pageUrl,
        ],
      );
      return result.rows[0];
    },

    submitVisualChange: async (
      _: unknown,
      {
        sessionId,
        selectionId,
        instruction,
      }: { sessionId: string; selectionId: string; instruction: string },
    ) => {
      // Load selection data
      const selResult = await query(
        `SELECT s.selector, s.dom_path, s.text_content, s.bounding_box,
                s.aria_role, s.page_url, vs.intake_workspace_id
         FROM visual_selections s
         JOIN visual_preview_sessions vs ON vs.id = s.session_id
         WHERE s.id = $1`,
        [selectionId],
      );

      const sel = selResult.rows[0];
      if (!sel) throw new Error('Selection not found');

      // Build intent
      const intent = {
        pageUrl: sel.page_url,
        selectedElement: {
          selector: sel.selector,
          domPath: sel.dom_path,
          textContent: sel.text_content,
          boundingBox: sel.bounding_box,
          ariaRole: sel.aria_role,
          tagName: sel.selector.split(/[.#\s>]/)[0] || 'unknown',
        },
        userInstruction: instruction,
      };

      // Generate requirement via Claude
      const requirement = await runVisualRequirementGenerator(
        sel.intake_workspace_id,
        selectionId,
        intent,
      );

      if (!requirement) {
        throw new Error('Failed to generate visual requirement');
      }

      // Publish event for subscriptions
      pubsub.publish(EVENTS.VISUAL_REQUIREMENT_GENERATED(sel.intake_workspace_id), {
        visualRequirementGenerated: requirement,
      });

      return requirement;
    },

    addVisualRequirementToDraft: async (
      _: unknown,
      { workspaceId, requirementId }: { workspaceId: string; requirementId: string },
    ) => {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // 1. Load the requirement
        const reqResult = await client.query(
          `SELECT id, title, summary, user_goal as "userGoal", target_area as "targetArea",
                  requested_change as "requestedChange", change_category as "changeCategory",
                  acceptance_criteria as "acceptanceCriteria",
                  implementation_hints as "implementationHints",
                  open_questions as "openQuestions", confidence, status
           FROM visual_requirements
           WHERE id = $1 AND intake_workspace_id = $2`,
          [requirementId, workspaceId],
        );

        if (reqResult.rows.length === 0) {
          throw new Error('Requirement not found');
        }
        const req = reqResult.rows[0];

        // 2. Load current draft
        const draftResult = await client.query(
          `SELECT draft_json, version FROM intake_draft_versions
           WHERE intake_workspace_id = $1 ORDER BY version DESC LIMIT 1`,
          [workspaceId],
        );

        const currentDraft = draftResult.rows[0]?.draft_json ?? {};
        const currentVersion = draftResult.rows[0]?.version ?? 0;

        // 3. Append requirement to uiRequirements array
        const uiRequirements = Array.isArray(currentDraft.uiRequirements)
          ? [...currentDraft.uiRequirements]
          : [];

        // Avoid duplicates by title
        const alreadyExists = uiRequirements.some((r: { title: string }) => r.title === req.title);
        if (!alreadyExists) {
          uiRequirements.push({
            title: req.title,
            summary: req.summary,
            userGoal: req.userGoal,
            targetArea: req.targetArea,
            requestedChange: req.requestedChange,
            changeCategory: req.changeCategory || undefined,
            acceptanceCriteria: req.acceptanceCriteria,
            implementationHints: req.implementationHints,
            openQuestions: req.openQuestions,
            confidence: req.confidence,
          });
        }

        const updatedDraft = { ...currentDraft, uiRequirements };

        // 4. Create new draft version
        await client.query(
          `INSERT INTO intake_draft_versions (intake_workspace_id, version, draft_json, change_source)
           VALUES ($1, $2, $3, 'visual_intake')`,
          [workspaceId, currentVersion + 1, JSON.stringify(updatedDraft)],
        );

        // 5. Update requirement status
        await client.query(`UPDATE visual_requirements SET status = 'ACCEPTED' WHERE id = $1`, [
          requirementId,
        ]);

        await client.query('COMMIT');

        console.info(`Visual requirement "${req.title}" merged into draft v${currentVersion + 1}`);

        const accepted = { ...req, status: 'ACCEPTED' };
        pubsub.publish(EVENTS.VISUAL_REQUIREMENT_UPDATED(workspaceId), {
          visualRequirementUpdated: accepted,
        });
        return accepted;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    // Save a screenshot to object storage and update the selection reference
    saveVisualScreenshot: async (
      _: unknown,
      { selectionId, screenshotBase64 }: { selectionId: string; screenshotBase64: string },
    ) => {
      const bucket = getArtifactBucket();
      const key = `visual-screenshots/${selectionId}.png`;

      await storageClient.putObject({
        bucket,
        key,
        body: Buffer.from(screenshotBase64, 'base64'),
        contentType: 'image/png',
        metadata: { selectionId },
      });

      // Update the selection record with the storage reference
      await query(`UPDATE visual_selections SET screenshot_ref = $1 WHERE id = $2`, [
        key,
        selectionId,
      ]);

      // Generate a signed URL if the client supports it
      let downloadUrl: string | null = null;
      if (storageClient.getSignedUrl) {
        try {
          downloadUrl = await storageClient.getSignedUrl({
            bucket,
            key,
            expiresInSeconds: 3600,
          });
        } catch {
          /* non-fatal */
        }
      }

      return { selectionId, objectKey: key, downloadUrl };
    },

    // Close a visual session
    closeVisualSession: async (_: unknown, { sessionId }: { sessionId: string }) => {
      const result = await query(
        `UPDATE visual_preview_sessions SET status = 'CLOSED'
         WHERE id = $1
         RETURNING id, intake_workspace_id as "intakeWorkspaceId", url, status,
                   created_at as "createdAt"`,
        [sessionId],
      );
      if (result.rows.length === 0) throw new Error('Session not found');
      return result.rows[0];
    },

    // Update a visual requirement
    updateVisualRequirement: async (
      _: unknown,
      { requirementId, patch }: { requirementId: string; patch: Record<string, unknown> },
    ) => {
      const allowedFields: Record<string, string> = {
        title: 'title',
        summary: 'summary',
        userGoal: 'user_goal',
        targetArea: 'target_area',
        requestedChange: 'requested_change',
        changeCategory: 'change_category',
        acceptanceCriteria: 'acceptance_criteria',
        implementationHints: 'implementation_hints',
        openQuestions: 'open_questions',
        confidence: 'confidence',
      };

      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      for (const [key, dbCol] of Object.entries(allowedFields)) {
        if (key in patch) {
          const val = Array.isArray(patch[key]) ? JSON.stringify(patch[key]) : patch[key];
          setClauses.push(`${dbCol} = $${paramIndex}`);
          values.push(val);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) throw new Error('No valid fields to update');

      values.push(requirementId);
      const result = await query(
        `UPDATE visual_requirements SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, title, summary, user_goal as "userGoal", target_area as "targetArea",
                   requested_change as "requestedChange", change_category as "changeCategory",
                   acceptance_criteria as "acceptanceCriteria",
                   implementation_hints as "implementationHints",
                   open_questions as "openQuestions", confidence, status,
                   created_at as "createdAt"`,
        values,
      );
      if (result.rows.length === 0) throw new Error('Requirement not found');
      return result.rows[0];
    },

    // Archive a visual requirement
    archiveVisualRequirement: async (_: unknown, { requirementId }: { requirementId: string }) => {
      const result = await query(
        `UPDATE visual_requirements SET status = 'ARCHIVED'
         WHERE id = $1
         RETURNING id, title, status`,
        [requirementId],
      );
      if (result.rows.length === 0) throw new Error('Requirement not found');
      return result.rows[0];
    },

    // Bulk accept visual requirements
    bulkAcceptVisualRequirements: async (
      _: unknown,
      { workspaceId, requirementIds }: { workspaceId: string; requirementIds: string[] },
    ) => {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Load all requirements
        const reqResult = await client.query(
          `SELECT id, title, summary, user_goal as "userGoal", target_area as "targetArea",
                  requested_change as "requestedChange", change_category as "changeCategory",
                  acceptance_criteria as "acceptanceCriteria",
                  implementation_hints as "implementationHints",
                  open_questions as "openQuestions", confidence
           FROM visual_requirements
           WHERE id = ANY($1) AND intake_workspace_id = $2 AND status = 'DRAFT'`,
          [requirementIds, workspaceId],
        );

        if (reqResult.rows.length === 0) {
          throw new Error('No draft requirements found');
        }

        // Load current draft
        const draftResult = await client.query(
          `SELECT draft_json, version FROM intake_draft_versions
           WHERE intake_workspace_id = $1 ORDER BY version DESC LIMIT 1`,
          [workspaceId],
        );

        const currentDraft = draftResult.rows[0]?.draft_json ?? {};
        const currentVersion = draftResult.rows[0]?.version ?? 0;

        // Merge all requirements
        const uiRequirements = Array.isArray(currentDraft.uiRequirements)
          ? [...currentDraft.uiRequirements]
          : [];

        for (const req of reqResult.rows) {
          const exists = uiRequirements.some((r: { title: string }) => r.title === req.title);
          if (!exists) {
            uiRequirements.push({
              title: req.title,
              summary: req.summary,
              userGoal: req.userGoal,
              targetArea: req.targetArea,
              requestedChange: req.requestedChange,
              changeCategory: req.changeCategory || undefined,
              acceptanceCriteria: req.acceptanceCriteria,
              implementationHints: req.implementationHints,
              openQuestions: req.openQuestions,
              confidence: req.confidence,
            });
          }
        }

        const updatedDraft = { ...currentDraft, uiRequirements };

        // Create new draft version
        await client.query(
          `INSERT INTO intake_draft_versions (intake_workspace_id, version, draft_json, change_source)
           VALUES ($1, $2, $3, 'visual_intake_bulk')`,
          [workspaceId, currentVersion + 1, JSON.stringify(updatedDraft)],
        );

        // Update all requirement statuses
        await client.query(
          `UPDATE visual_requirements SET status = 'ACCEPTED' WHERE id = ANY($1)`,
          [requirementIds],
        );

        await client.query('COMMIT');

        console.info(
          `Bulk accepted ${reqResult.rows.length} visual requirements into draft v${currentVersion + 1}`,
        );

        return reqResult.rows.map((r: Record<string, unknown>) => ({ ...r, status: 'ACCEPTED' }));
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    // Generate aggregated PRD from all accepted visual requirements
    generateVisualPRD: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      // Load all accepted visual requirements
      const reqResult = await query(
        `SELECT title, summary, user_goal as "userGoal", target_area as "targetArea",
                requested_change as "requestedChange", change_category as "changeCategory",
                acceptance_criteria as "acceptanceCriteria",
                implementation_hints as "implementationHints",
                open_questions as "openQuestions", confidence
         FROM visual_requirements
         WHERE intake_workspace_id = $1 AND status IN ('DRAFT', 'ACCEPTED')
         ORDER BY created_at`,
        [workspaceId],
      );

      if (reqResult.rows.length === 0) {
        throw new Error('No visual requirements found for this workspace');
      }

      // Load existing draft for context
      const draftResult = await query(
        `SELECT draft_json, version FROM intake_draft_versions
         WHERE intake_workspace_id = $1 ORDER BY version DESC LIMIT 1`,
        [workspaceId],
      );

      const currentDraft = draftResult.rows[0]?.draft_json ?? {};
      const currentVersion = draftResult.rows[0]?.version ?? 0;

      // Run the PRD aggregation agent
      const prd = await runVisualPRDAggregator(reqResult.rows, currentDraft);

      if (!prd) {
        throw new Error('Failed to generate aggregated PRD');
      }

      // Merge aggregated PRD fields into the draft
      const updatedDraft = {
        ...currentDraft,
        ...prd,
        uiRequirements: prd.uiUxRequirements || currentDraft.uiRequirements || [],
      };

      // Create new draft version
      await query(
        `INSERT INTO intake_draft_versions (intake_workspace_id, version, draft_json, change_source)
         VALUES ($1, $2, $3, 'visual_prd_aggregation')`,
        [workspaceId, currentVersion + 1, JSON.stringify(updatedDraft)],
      );

      console.info(
        `Visual PRD aggregated from ${reqResult.rows.length} requirements into draft v${currentVersion + 1}`,
      );

      return prd;
    },
  },

  Subscription: {
    visualRequirementGenerated: {
      subscribe: (_: unknown, { workspaceId }: { workspaceId: string }) => {
        return pubsub.asyncIterator(EVENTS.VISUAL_REQUIREMENT_GENERATED(workspaceId));
      },
    },
    visualRequirementUpdated: {
      subscribe: (_: unknown, { workspaceId }: { workspaceId: string }) => {
        return pubsub.asyncIterator(EVENTS.VISUAL_REQUIREMENT_UPDATED(workspaceId));
      },
    },
  },
};
