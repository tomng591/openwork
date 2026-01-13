/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export interface ToolCall {
  callId: string;
  name: string;
  args?: Record<string, unknown>;
  // Status values from CoreToolScheduler
  status?:
    | 'pending'
    | 'validating'
    | 'awaiting_approval'
    | 'scheduled'
    | 'executing'
    | 'success'
    | 'error'
    | 'cancelled';
  result?: unknown;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolRequest {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  messageIndex: number;
}

export interface StreamEvent {
  type: string;
  value?: unknown;
}

export interface GeminiContentEvent extends StreamEvent {
  type: 'content';
  value: string;
}

export interface GeminiToolCallRequestEvent extends StreamEvent {
  type: 'tool_call_request';
  value: {
    callId: string;
    name: string;
    args: Record<string, unknown>;
  };
}

export interface GeminiToolCallResponseEvent extends StreamEvent {
  type: 'tool_call_response';
  value: {
    callId: string;
    result?: unknown;
    error?: string;
  };
}

export interface GeminiFinishedEvent extends StreamEvent {
  type: 'finished';
  value: {
    reason: string;
    usageMetadata?: unknown;
  };
}

export interface GeminiErrorEvent extends StreamEvent {
  type: 'error';
  value: {
    error: string;
  };
}

export type GeminiStreamEvent =
  | GeminiContentEvent
  | GeminiToolCallRequestEvent
  | GeminiToolCallResponseEvent
  | GeminiFinishedEvent
  | GeminiErrorEvent
  | StreamEvent;
