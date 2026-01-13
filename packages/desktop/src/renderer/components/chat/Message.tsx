/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ToolCallCard } from '../tools/ToolCallCard';
import type { ChatMessage, ToolRequest } from '../../types/chat';

interface MessageProps {
  message: ChatMessage;
  pendingTools: ToolRequest[];
  onApproveTool: (callId: string) => void;
  onRejectTool: (callId: string) => void;
}

export function Message({
  message,
  pendingTools,
  onApproveTool,
  onRejectTool,
}: MessageProps): JSX.Element {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[85%] bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5">
          <p className="whitespace-pre-wrap text-[15px]">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant message
  // Render tool calls FIRST, then text content (since text often describes tool results)
  return (
    <div className="mb-6">
      {/* Tool calls - rendered first */}
      {message.toolCalls?.map((toolCall) => {
        // Check if tool needs approval based on status or pendingTools list
        const pendingTool = pendingTools.find(
          (t) =>
            t.name === toolCall.name &&
            JSON.stringify(t.args) === JSON.stringify(toolCall.args),
        );
        const needsApproval =
          !!pendingTool ||
          toolCall.status === 'pending' ||
          toolCall.status === 'awaiting_approval';

        return (
          <ToolCallCard
            key={toolCall.callId}
            toolCall={toolCall}
            isPending={needsApproval}
            onApprove={() => onApproveTool(toolCall.callId)}
            onReject={() => onRejectTool(toolCall.callId)}
          />
        );
      })}

      {/* Text content with markdown rendering - after tool calls */}
      {message.content && (
        <div
          className="prose prose-invert prose-neutral max-w-none mt-4
          prose-p:text-neutral-200 prose-p:leading-relaxed prose-p:my-2
          prose-headings:text-neutral-100 prose-headings:font-semibold
          prose-strong:text-neutral-100 prose-strong:font-semibold
          prose-code:text-blue-300 prose-code:bg-neutral-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-[''] prose-code:after:content-['']
          prose-pre:bg-neutral-900 prose-pre:border prose-pre:border-neutral-700 prose-pre:rounded-lg
          prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
          prose-ul:my-2 prose-ol:my-2 prose-li:text-neutral-200 prose-li:my-1
          prose-blockquote:border-neutral-600 prose-blockquote:text-neutral-300
        "
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
