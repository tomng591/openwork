/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import type {
  Config,
  GeminiClient,
  MessageBus,
  CoreToolScheduler,
  ToolConfirmationOutcome,
} from '@google/gemini-cli-core';

// These will be dynamically imported to avoid issues with ESM/CJS
let config: Config | null = null;
let client: GeminiClient | null = null;
let messageBus: MessageBus | null = null;
let toolScheduler: CoreToolScheduler | null = null;
let currentAbortController: AbortController | null = null;
let mainWindowRef: BrowserWindow | null = null;

// Track pending tool calls for the current turn
interface PendingToolCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  promptId: string;
}

let pendingToolCalls: PendingToolCall[] = [];

// Store confirmation callbacks by correlationId
const pendingConfirmations = new Map<
  string,
  (outcome: ToolConfirmationOutcome) => Promise<void>
>();

export interface InitializeParams {
  targetDir: string;
  model?: string;
  approvalMode?: 'default' | 'autoEdit' | 'yolo';
}

async function processToolCallResults(
  completedCalls: Array<{
    callId: string;
    result?: unknown;
    error?: string;
    responseParts?: unknown[];
  }>,
  promptId: string,
): Promise<void> {
  if (!client || !mainWindowRef) return;

  // console.log('[Tool Execution] Processing completed tool calls:', completedCalls.length);

  // Send tool results to renderer for display
  for (const call of completedCalls) {
    mainWindowRef.webContents.send('gemini:stream-event', {
      type: 'tool_call_response',
      value: {
        callId: call.callId,
        result: call.result,
        error: call.error,
      },
    });
  }

  // Build response parts for Gemini
  const responseParts = completedCalls.flatMap(
    (call) => call.responseParts || [],
  );

  if (responseParts.length === 0) {
    // console.log('[Tool Execution] No response parts to send back to Gemini');
    return;
  }

  // Continue the conversation with tool results
  // console.log('[Tool Execution] Sending tool results back to Gemini...');

  try {
    const stream = client.sendMessageStream(
      responseParts as never,
      currentAbortController?.signal || new AbortController().signal,
      promptId,
    );

    await processStream(stream, promptId);
  } catch (error) {
    // console.error('[Tool Execution] Failed to continue conversation:', error);
    mainWindowRef.webContents.send('gemini:stream-event', {
      type: 'error',
      value: { error: String(error) },
    });
  }
}

async function processStream(
  stream: AsyncIterable<{ type: string; value?: unknown }>,
  promptId: string,
): Promise<void> {
  if (!mainWindowRef || !toolScheduler) return;

  const toolCallRequests: PendingToolCall[] = [];

  for await (const event of stream) {
    // console.log('========================================');
    // console.log('[Gemini Event]', event.type);
    // console.log('[Gemini Value]', JSON.stringify(event.value || {}, null, 2).slice(0, 500));
    // console.log('========================================');

    // Send event to renderer
    mainWindowRef.webContents.send('gemini:stream-event', event);

    // Collect tool call requests
    if (event.type === 'tool_call_request') {
      const toolRequest = event.value as {
        callId: string;
        name: string;
        args: Record<string, unknown>;
        prompt_id?: string;
      };
      toolCallRequests.push({
        callId: toolRequest.callId,
        name: toolRequest.name,
        args: toolRequest.args,
        promptId: toolRequest.prompt_id || promptId,
      });
    }
  }

  // If we have tool calls, schedule them for execution
  if (toolCallRequests.length > 0) {
    // console.log('[Tool Execution] Scheduling', toolCallRequests.length, 'tool calls');
    pendingToolCalls = toolCallRequests;

    const signal =
      currentAbortController?.signal || new AbortController().signal;

    // Schedule all tool calls
    for (const request of toolCallRequests) {
      try {
        await toolScheduler.schedule(
          {
            callId: request.callId,
            name: request.name,
            args: request.args,
            isClientInitiated: false,
            prompt_id: request.promptId,
          },
          signal,
        );
      } catch (_error) {
        // Tool scheduling failed - silently continue
      }
    }
  }
}

export function setupGeminiHandlers(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;

  // Initialize the Gemini client and config
  ipcMain.handle(
    'gemini:initialize',
    async (_event, params: InitializeParams) => {
      // Dynamic import of @google/gemini-cli-core to handle ESM
      const core = await import('@google/gemini-cli-core');

      const sessionId = crypto.randomUUID();

      config = new core.Config({
        sessionId,
        targetDir: params.targetDir,
        model: params.model || 'gemini-2.0-flash',
        interactive: true,
        debugMode: false,
        approvalMode:
          core.ApprovalMode[
            params.approvalMode?.toUpperCase() as keyof typeof core.ApprovalMode
          ] || core.ApprovalMode.DEFAULT,
      });

      await config.initialize();

      // Authenticate with Google OAuth (will open browser if needed)
      await config.refreshAuth(core.AuthType.LOGIN_WITH_GOOGLE);

      client = config.getGeminiClient();
      messageBus = config.getMessageBus();

      // Create tool scheduler with options object
      toolScheduler = new core.CoreToolScheduler({
        config,
        getPreferredEditor: () => undefined, // Desktop app doesn't use external editor
        onAllToolCallsComplete: async (completedToolCalls) => {
          // Map completed tool calls to our format
          const results = completedToolCalls.map(
            (tc: {
              request: { callId: string };
              response?: {
                result?: unknown;
                error?: { message: string };
                responseParts?: unknown[];
              };
            }) => ({
              callId: tc.request.callId,
              result: tc.response?.result,
              error: tc.response?.error?.message,
              responseParts: tc.response?.responseParts,
            }),
          );

          // Get the prompt ID from the first tool call
          const firstPending = pendingToolCalls.find((p) =>
            results.some((r: { callId: string }) => r.callId === p.callId),
          );
          const promptId = firstPending?.promptId || '';

          // Send results to renderer and continue conversation
          await processToolCallResults(results, promptId);
        },
        onToolCallsUpdate: (toolCalls) => {
          // Capture confirmation callbacks from awaiting_approval tool calls
          for (const tc of toolCalls) {
            const typedTc = tc as {
              request: { callId: string; name: string; args: unknown };
              status: string;
              confirmationDetails?: {
                onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
              };
              response?: { result?: unknown; error?: { message: string } };
            };
            if (
              typedTc.status === 'awaiting_approval' &&
              typedTc.confirmationDetails?.onConfirm
            ) {
              // Store the onConfirm callback using the callId
              pendingConfirmations.set(
                typedTc.request.callId,
                typedTc.confirmationDetails.onConfirm,
              );
            }
          }

          // Serialize tool calls (remove non-serializable properties like functions)
          const serializedCalls = toolCalls.map(
            (tc: {
              request: { callId: string; name: string; args: unknown };
              status: string;
              response?: { result?: unknown; error?: { message: string } };
            }) => ({
              callId: tc.request.callId,
              name: tc.request.name,
              args: tc.request.args,
              status: tc.status,
              result: tc.response?.result,
              error: tc.response?.error?.message,
            }),
          );
          // Send tool status updates to renderer
          mainWindow.webContents.send('tool:calls-updated', serializedCalls);
        },
      });

      // Subscribe to tool status changes for UI updates
      messageBus.subscribe(
        core.MessageBusType.TOOL_STATUS_CHANGED,
        (status) => {
          mainWindow.webContents.send('tool:status-changed', status);
        },
      );

      // Subscribe to tool confirmation requests
      messageBus.subscribe(
        core.MessageBusType.TOOL_CONFIRMATION_REQUEST,
        (request) => {
          mainWindow.webContents.send('tool:confirmation-request', request);
        },
      );

      // Subscribe to tool execution results
      messageBus.subscribe(
        core.MessageBusType.TOOL_EXECUTION_SUCCESS,
        (result) => {
          mainWindow.webContents.send('tool:execution-success', result);
        },
      );

      messageBus.subscribe(
        core.MessageBusType.TOOL_EXECUTION_FAILURE,
        (result) => {
          mainWindow.webContents.send('tool:execution-failure', result);
        },
      );

      return { success: true, sessionId };
    },
  );

  // Send a message to Gemini
  ipcMain.handle(
    'gemini:send',
    async (_event, message: string, promptId: string) => {
      if (!client) {
        throw new Error(
          'Gemini client not initialized. Call gemini:initialize first.',
        );
      }

      currentAbortController = new AbortController();
      pendingToolCalls = [];

      try {
        const stream = client.sendMessageStream(
          [{ text: message }],
          currentAbortController.signal,
          promptId,
        );

        await processStream(stream, promptId);

        return { success: true };
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          mainWindow.webContents.send('gemini:stream-event', {
            type: 'user_cancelled',
            value: {},
          });
          return { success: true, aborted: true };
        }
        throw error;
      } finally {
        currentAbortController = null;
      }
    },
  );

  // Abort the current request
  ipcMain.on('gemini:abort', () => {
    if (currentAbortController) {
      currentAbortController.abort();
    }
  });

  // Approve a tool call
  ipcMain.handle('tools:approve', async (_event, callId: string) => {
    const core = await import('@google/gemini-cli-core');

    // Try to find the confirmation callback
    const onConfirm = pendingConfirmations.get(callId);
    if (onConfirm) {
      await onConfirm(core.ToolConfirmationOutcome.ProceedOnce);
      pendingConfirmations.delete(callId);
      return { success: true };
    } else {
      throw new Error(
        `No confirmation callback found for tool call: ${callId}`,
      );
    }
  });

  // Reject a tool call
  ipcMain.handle(
    'tools:reject',
    async (_event, callId: string, _reason?: string) => {
      const core = await import('@google/gemini-cli-core');

      // Try to find the confirmation callback
      const onConfirm = pendingConfirmations.get(callId);
      if (onConfirm) {
        await onConfirm(core.ToolConfirmationOutcome.Cancel);
        pendingConfirmations.delete(callId);
        return { success: true };
      } else {
        throw new Error(
          `No confirmation callback found for tool call: ${callId}`,
        );
      }
    },
  );

  // Get conversation history
  ipcMain.handle('gemini:get-history', async () => {
    if (!client) {
      return [];
    }
    return client.getHistory();
  });

  // Reset/clear the conversation
  ipcMain.handle('gemini:reset', async () => {
    if (!client) {
      throw new Error('Gemini client not initialized');
    }
    await client.resetChat();
    pendingToolCalls = [];
    return { success: true };
  });

  // Get current settings
  ipcMain.handle('gemini:get-settings', async () => {
    if (!config) {
      return null;
    }
    return {
      model: config.getActiveModel(),
      approvalMode: config.getApprovalMode(),
      targetDir: config.getTargetDir(),
    };
  });
}
