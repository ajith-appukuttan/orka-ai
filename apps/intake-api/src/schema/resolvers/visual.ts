import crypto from 'node:crypto';
import { query } from '../../db/pool.js';
import { runVisualRequirementGenerator } from '../../agents/visualRequirementGenerator.js';
import { config } from '../../config.js';

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

      return requirement;
    },

    addVisualRequirementToDraft: async (
      _: unknown,
      { workspaceId, requirementId }: { workspaceId: string; requirementId: string },
    ) => {
      // Update requirement status to ACCEPTED
      const result = await query(
        `UPDATE visual_requirements SET status = 'ACCEPTED'
         WHERE id = $1 AND intake_workspace_id = $2
         RETURNING id, title, status`,
        [requirementId, workspaceId],
      );

      if (result.rows.length === 0) {
        throw new Error('Requirement not found');
      }

      return result.rows[0];
    },
  },
};
