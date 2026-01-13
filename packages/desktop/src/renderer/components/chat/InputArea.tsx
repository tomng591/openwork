/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useRef, useEffect } from 'react';

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isStreaming: boolean;
  onAbort: () => void;
}

export function InputArea({
  value,
  onChange,
  onSubmit,
  isStreaming,
  onAbort,
}: InputAreaProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) {
        onSubmit();
      }
    }
    if (e.key === 'Escape' && isStreaming) {
      onAbort();
    }
  };

  return (
    <div className="relative flex items-end gap-3">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Gemini anything..."
          disabled={isStreaming}
          className="w-full resize-none rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 pr-12 text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-[15px] leading-relaxed"
          rows={1}
        />
      </div>

      {/* Submit/Abort button */}
      <button
        onClick={isStreaming ? onAbort : onSubmit}
        disabled={!isStreaming && !value.trim()}
        className={`flex-shrink-0 p-3 rounded-xl transition-all ${
          isStreaming
            ? 'bg-red-600 hover:bg-red-500 text-white'
            : value.trim()
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
        }`}
        title={isStreaming ? 'Stop (Esc)' : 'Send (Enter)'}
      >
        {isStreaming ? (
          // Stop icon
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          // Send icon
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 12h14m-7-7l7 7-7 7"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
