import { query } from '../db/pool.js';
import { streamCopilotResponse } from '../services/claude.js';
import { assembleContext, formatContextForPrompt } from '../services/contextAssembler.js';
import { pubsub, EVENTS } from '../pubsub/index.js';
import { runDraftExtractor } from './draftExtractor.js';
import { maybeSummarize } from './summaryGenerator.js';
import { runMemoryCurator } from './memoryCurator.js';
import { runToolPlanner, executeTools } from './toolPlanner.js';

/**
 * Run the full chat turn pipeline:
 * 1. Assemble runtime context bundle (replaces ad-hoc loading)
 * 2. Run Tool Planner
 * 3. If needed, execute tools via MCP Gateway
 * 4. Build combined context (runtime context + tool results)
 * 5. Stream Claude response
 * 6. Persist assistant message
 * 7. Publish final message
 * 8. Run draft extractor in parallel
 */
export async function runChatTurnPipeline(sessionId: string): Promise<void> {
  // 1. Assemble runtime context (messages, draft, summary, memory, open questions)
  const ctx = await assembleContext(sessionId);
  const contextPrompt = formatContextForPrompt(ctx);

  // 2. Run Tool Planner
  let toolContext = '';
  try {
    const plan = await runToolPlanner(ctx.recentMessages, ctx.currentDraft);

    if (plan.shouldCallTools && plan.toolsToCall.length > 0) {
      console.info(
        `Tool planner for session ${sessionId}: calling ${plan.toolsToCall.length} tools. Reason: ${plan.reasoning}`,
      );
      const toolResult = await executeTools(plan, sessionId, ctx.tenantId);
      toolContext = toolResult.toolContext;
    } else {
      console.info(
        `Tool planner for session ${sessionId}: no tools needed. Reason: ${plan.reasoning}`,
      );
    }
  } catch (err) {
    console.error(`Tool planner failed for session ${sessionId}, continuing without tools:`, err);
  }

  // 3. Build combined additional context for Claude
  const additionalContextParts: string[] = [];
  if (contextPrompt) additionalContextParts.push(contextPrompt);
  if (toolContext) {
    additionalContextParts.push(
      `## Tool Results\n\nThe following information was gathered from organizational tools:\n\n${toolContext}`,
    );
  }
  const additionalContext = additionalContextParts.join('\n\n') || undefined;

  // 4. Stream Claude response
  let fullResponseText = '';
  const generator = streamCopilotResponse(ctx.recentMessages, additionalContext);

  let streamResult = await generator.next();
  while (!streamResult.done) {
    const chunk = streamResult.value;
    fullResponseText += chunk;

    pubsub.publish(EVENTS.MESSAGE_STREAMING(sessionId), {
      intakeStreamingChunk: {
        sessionId,
        content: fullResponseText,
        done: false,
      },
    });

    streamResult = await generator.next();
  }

  if (streamResult.done && streamResult.value) {
    fullResponseText = streamResult.value;
  }

  // 5. Signal streaming done
  pubsub.publish(EVENTS.MESSAGE_STREAMING(sessionId), {
    intakeStreamingChunk: {
      sessionId,
      content: fullResponseText,
      done: true,
    },
  });

  // 6. Persist the complete assistant message
  const assistantMsg = await query(
    `INSERT INTO intake_messages (session_id, role, content)
     VALUES ($1, 'assistant', $2)
     RETURNING id, session_id as "sessionId", role, content,
               tool_calls as "toolCalls", created_at as "createdAt"`,
    [sessionId, fullResponseText],
  );

  const savedMessage = assistantMsg.rows[0];

  // 7. Publish final message
  pubsub.publish(EVENTS.MESSAGE_STREAM(sessionId), {
    intakeMessageStream: savedMessage,
  });

  // 8. Run post-turn agents in parallel (fire-and-forget)
  const updatedHistory = [
    ...ctx.recentMessages,
    { role: 'assistant' as const, content: fullResponseText },
  ];

  // Draft extractor
  runDraftExtractor(sessionId, ctx.workspaceId, updatedHistory, ctx.currentDraft).catch((err) => {
    console.error(`Draft extraction failed for session ${sessionId}:`, err);
  });

  // Memory curator (only if workspace exists)
  if (ctx.workspaceId) {
    runMemoryCurator({
      workspaceId: ctx.workspaceId,
      conversationHistory: updatedHistory,
      currentDraft: ctx.currentDraft,
    }).catch((err) => {
      console.error(`Memory curator failed for session ${sessionId}:`, err);
    });

    // Summary refresh (conditional — checks refresh rules internally)
    maybeSummarize({
      workspaceId: ctx.workspaceId,
      sessionId,
      conversationHistory: updatedHistory,
      currentDraft: ctx.currentDraft,
      currentReadiness: (ctx.currentDraft.readinessScore as number) ?? 0,
    }).catch((err) => {
      console.error(`Summary generation failed for session ${sessionId}:`, err);
    });
  }
}
