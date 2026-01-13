/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import type { ToolCall } from '../../types/chat';

// Format tool result for display
function formatResult(result: unknown): string {
  if (result === null || result === undefined) {
    return 'null';
  }
  if (typeof result === 'string') {
    return result;
  }
  if (Array.isArray(result)) {
    // For file listings, show each item on a new line
    if (result.every((item) => typeof item === 'string')) {
      return result.join('\n');
    }
  }
  // For objects, pretty print JSON
  return JSON.stringify(result, null, 2);
}

interface ToolCallCardProps {
  toolCall: ToolCall;
  isPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function ToolCallCard({
  toolCall,
  isPending,
  onApprove,
  onReject,
}: ToolCallCardProps): JSX.Element {
  // Collapsed by default, expand when pending approval
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if tool is truly awaiting user approval (not just pending in general)
  const isAwaitingApproval =
    isPending &&
    (toolCall.status === 'pending' || toolCall.status === 'awaiting_approval');

  // Check if tool is currently executing
  const isExecuting =
    toolCall.status === 'executing' || toolCall.status === 'scheduled';

  // Determine status icon and colors
  const getStatusDisplay = () => {
    if (isExecuting) {
      return {
        icon: (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ),
        label: 'Running',
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
      };
    }
    if (toolCall.status === 'success') {
      return {
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ),
        label: 'Completed',
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
      };
    }
    if (toolCall.status === 'error' || toolCall.status === 'cancelled') {
      return {
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ),
        label: toolCall.status === 'cancelled' ? 'Cancelled' : 'Failed',
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
      };
    }
    // Pending approval
    return {
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      label: 'Awaiting approval',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
    };
  };

  const status = getStatusDisplay();

  // Get a friendly tool name
  const getToolDisplayName = (name: string) => {
    const nameMap: Record<string, string> = {
      list_directory: 'Listing directory',
      read_file: 'Reading file',
      write_file: 'Writing file',
      run_command: 'Running command',
      search_files: 'Searching files',
      edit_file: 'Editing file',
    };
    return nameMap[name] || name.replace(/_/g, ' ');
  };

  return (
    <div className="my-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Tool icon */}
          <div className={`p-1.5 rounded ${status.bgColor} ${status.color}`}>
            {status.icon}
          </div>

          <span className="font-medium text-neutral-200">
            {getToolDisplayName(toolCall.name)}
          </span>
        </div>

        {/* Expand/collapse icon */}
        <svg
          className={`w-5 h-5 text-neutral-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Request section */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Request
            </span>
            <pre className="text-sm bg-neutral-900/50 rounded-lg p-3 overflow-x-auto text-neutral-300 font-mono">
              {JSON.stringify(toolCall.args || {}, null, 2)}
            </pre>
          </div>

          {/* Response section */}
          {toolCall.result !== undefined && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                Response
              </span>
              <pre className="text-sm bg-neutral-900/50 rounded-lg p-3 overflow-x-auto text-neutral-300 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                {formatResult(toolCall.result)}
              </pre>
            </div>
          )}

          {/* Approval buttons - only show when truly awaiting approval */}
          {isAwaitingApproval && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove();
                }}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors border border-green-500"
              >
                Approve
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReject();
                }}
                className="flex-1 px-4 py-2.5 bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
