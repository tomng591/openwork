/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  ChatMessage,
  ToolRequest,
  ToolCall,
  GeminiStreamEvent,
} from '../types/chat';

export interface UseGeminiReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingTools: ToolRequest[];
  sendMessage: (text: string) => Promise<void>;
  abort: () => void;
  approveTool: (callId: string) => void;
  rejectTool: (callId: string) => void;
  approveAllTools: () => void;
  rejectAllTools: () => void;
  clearMessages: () => void;
}

export function useGemini(): UseGeminiReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingTools, setPendingTools] = useState<ToolRequest[]>([]);
  const currentMessageIndex = useRef(0);

  // Helper function to update tool call result
  const updateToolResult = useCallback(
    (callId: string, result: unknown, isError: boolean) => {
      setMessages((prev) => {
        const newMessages = [...prev];
        for (let i = newMessages.length - 1; i >= 0; i--) {
          const msg = newMessages[i];
          if (msg.role === 'assistant' && msg.toolCalls) {
            const toolIndex = msg.toolCalls.findIndex(
              (tc) => tc.callId === callId,
            );
            if (toolIndex !== -1) {
              const newToolCalls = [...msg.toolCalls];
              newToolCalls[toolIndex] = {
                ...newToolCalls[toolIndex],
                status: isError ? 'error' : 'success',
                result,
              };
              newMessages[i] = { ...msg, toolCalls: newToolCalls };
              break;
            }
          }
        }
        return newMessages;
      });
    },
    [],
  );

  // Subscribe to stream events
  useEffect(() => {
    const unsubStream = window.api.gemini.onStreamEvent(
      (event: GeminiStreamEvent) => {
        // console.log('[useGemini] Stream event:', event.type, event);

        switch (event.type) {
          case 'content':
            // Append content to the last assistant message
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastIndex = newMessages.length - 1;
              if (
                lastIndex >= 0 &&
                newMessages[lastIndex].role === 'assistant'
              ) {
                newMessages[lastIndex] = {
                  ...newMessages[lastIndex],
                  content:
                    newMessages[lastIndex].content + (event.value as string),
                };
              }
              return newMessages;
            });
            break;

          case 'tool_call_request': {
            const toolRequest = event.value as {
              callId: string;
              name: string;
              args: Record<string, unknown>;
            };

            // Add tool call to the current assistant message
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastIndex = newMessages.length - 1;
              if (
                lastIndex >= 0 &&
                newMessages[lastIndex].role === 'assistant'
              ) {
                const toolCall: ToolCall = {
                  callId: toolRequest.callId,
                  name: toolRequest.name,
                  args: toolRequest.args,
                  status: 'pending',
                };
                newMessages[lastIndex] = {
                  ...newMessages[lastIndex],
                  toolCalls: [
                    ...(newMessages[lastIndex].toolCalls || []),
                    toolCall,
                  ],
                };
              }
              return newMessages;
            });
            break;
          }

          case 'tool_call_response': {
            const toolResponse = event.value as {
              callId: string;
              result?: unknown;
              error?: string;
            };
            updateToolResult(
              toolResponse.callId,
              toolResponse.result || toolResponse.error,
              !!toolResponse.error,
            );
            break;
          }

          case 'finished':
            setIsStreaming(false);
            // Show notification on completion
            window.api.notifications.show(
              'Task Complete',
              'Gemini has finished processing',
            );
            break;

          case 'error':
            setIsStreaming(false);
            // console.error('Gemini error:', event.value);
            break;

          case 'user_cancelled':
            setIsStreaming(false);
            break;

          default:
            // Handle other event types silently
            break;
        }
      },
    );

    // Subscribe to tool confirmation requests (with correlation ID for approve/reject)
    const unsubToolRequest = window.api.gemini.onToolConfirmationRequest(
      (request: unknown) => {
        // console.log('[useGemini] Tool confirmation request:', request);
        const toolRequest = request as {
          correlationId: string;
          toolCall: {
            name: string;
            args: Record<string, unknown>;
          };
        };

        // Add to pending tools using correlationId (used for approve/reject)
        setPendingTools((prev) => [
          ...prev,
          {
            callId: toolRequest.correlationId,
            name: toolRequest.toolCall.name,
            args: toolRequest.toolCall.args,
            messageIndex: currentMessageIndex.current,
          },
        ]);
      },
    );

    // Subscribe to tool calls updated (from CoreToolScheduler)
    const unsubToolCallsUpdated = window.api.gemini.onToolCallsUpdated(
      (toolCalls: unknown[]) => {
        // console.log('[useGemini] Tool calls updated:', toolCalls);

        const calls = toolCalls as Array<{
          callId: string;
          name: string;
          args: Record<string, unknown>;
          status: string;
          result?: unknown;
          error?: string;
        }>;

        // Update tool call statuses in messages
        setMessages((prev) => {
          const newMessages = [...prev];
          for (let i = newMessages.length - 1; i >= 0; i--) {
            const msg = newMessages[i];
            if (msg.role === 'assistant' && msg.toolCalls) {
              let updated = false;
              const newToolCalls = msg.toolCalls.map((tc) => {
                const schedulerCall = calls.find((c) => c.callId === tc.callId);
                if (schedulerCall) {
                  updated = true;
                  return {
                    ...tc,
                    status: schedulerCall.status as ToolCall['status'],
                    result:
                      schedulerCall.result || schedulerCall.error || tc.result,
                  };
                }
                return tc;
              });
              if (updated) {
                newMessages[i] = { ...msg, toolCalls: newToolCalls };
              }
            }
          }
          return newMessages;
        });
      },
    );

    // Subscribe to tool execution success
    const unsubToolSuccess = window.api.gemini.onToolExecutionSuccess(
      (result: unknown) => {
        // console.log('[useGemini] Tool execution success:', result);
        const execResult = result as {
          correlationId: string;
          toolName: string;
          result: unknown;
        };
        updateToolResult(execResult.correlationId, execResult.result, false);
      },
    );

    // Subscribe to tool execution failure
    const unsubToolFailure = window.api.gemini.onToolExecutionFailure(
      (result: unknown) => {
        // console.log('[useGemini] Tool execution failure:', result);
        const execResult = result as {
          correlationId: string;
          toolName: string;
          error: string;
        };
        updateToolResult(execResult.correlationId, execResult.error, true);
      },
    );

    return () => {
      unsubStream();
      unsubToolRequest();
      unsubToolCallsUpdated();
      unsubToolSuccess();
      unsubToolFailure();
    };
  }, [updateToolResult]);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    // Add empty assistant message (will be filled by streaming)
    setMessages((prev) => {
      currentMessageIndex.current = prev.length;
      return [...prev, { role: 'assistant', content: '' }];
    });

    setIsStreaming(true);

    try {
      const promptId = crypto.randomUUID();
      await window.api.gemini.send(text, promptId);
    } catch (_error) {
      setIsStreaming(false);
    }
  }, []);

  const abort = useCallback((): void => {
    window.api.gemini.abort();
    setIsStreaming(false);
  }, []);

  const approveTool = useCallback((callId: string): void => {
    window.api.tools.approve(callId);

    // Update tool status in messages immediately
    setMessages((prev) => {
      const newMessages = [...prev];
      for (let i = newMessages.length - 1; i >= 0; i--) {
        const msg = newMessages[i];
        if (msg.role === 'assistant' && msg.toolCalls) {
          const toolIndex = msg.toolCalls.findIndex(
            (tc) => tc.callId === callId,
          );
          if (toolIndex !== -1) {
            const approvedTool = msg.toolCalls[toolIndex];
            const newToolCalls = [...msg.toolCalls];
            newToolCalls[toolIndex] = {
              ...approvedTool,
              status: 'executing',
            };
            newMessages[i] = { ...msg, toolCalls: newToolCalls };

            // Also remove matching pending tool by name+args
            setPendingTools((pt) =>
              pt.filter(
                (t) =>
                  !(
                    t.name === approvedTool.name &&
                    JSON.stringify(t.args) === JSON.stringify(approvedTool.args)
                  ),
              ),
            );
            break;
          }
        }
      }
      return newMessages;
    });
  }, []);

  const rejectTool = useCallback((callId: string): void => {
    window.api.tools.reject(callId);
    setPendingTools((prev) => prev.filter((t) => t.callId !== callId));

    // Update tool status in messages
    setMessages((prev) => {
      const newMessages = [...prev];
      for (let i = newMessages.length - 1; i >= 0; i--) {
        const msg = newMessages[i];
        if (msg.role === 'assistant' && msg.toolCalls) {
          const toolIndex = msg.toolCalls.findIndex(
            (tc) => tc.callId === callId,
          );
          if (toolIndex !== -1) {
            const newToolCalls = [...msg.toolCalls];
            newToolCalls[toolIndex] = {
              ...newToolCalls[toolIndex],
              status: 'rejected',
            };
            newMessages[i] = { ...msg, toolCalls: newToolCalls };
            break;
          }
        }
      }
      return newMessages;
    });
  }, []);

  const approveAllTools = useCallback((): void => {
    pendingTools.forEach((tool) => {
      window.api.tools.approve(tool.callId);
    });
    setPendingTools([]);
  }, [pendingTools]);

  const rejectAllTools = useCallback((): void => {
    pendingTools.forEach((tool) => {
      window.api.tools.reject(tool.callId);
    });
    setPendingTools([]);
  }, [pendingTools]);

  const clearMessages = useCallback((): void => {
    setMessages([]);
    setPendingTools([]);
    currentMessageIndex.current = 0;
  }, []);

  return {
    messages,
    isStreaming,
    pendingTools,
    sendMessage,
    abort,
    approveTool,
    rejectTool,
    approveAllTools,
    rejectAllTools,
    clearMessages,
  };
}
