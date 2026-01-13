/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useRef, useEffect } from 'react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import type { UseGeminiReturn } from '../../hooks/useGemini';

interface ChatViewProps {
  gemini: UseGeminiReturn;
}

export function ChatView({ gemini }: ChatViewProps): JSX.Element {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gemini.messages]);

  const handleSubmit = async (): Promise<void> => {
    if (!input.trim() || gemini.isStreaming) return;

    const message = input.trim();
    setInput('');
    await gemini.sendMessage(message);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {gemini.messages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[400px] text-neutral-500">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-neutral-800 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-neutral-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <p className="text-lg font-medium text-neutral-400">
                  Start a conversation
                </p>
                <p className="text-sm text-neutral-500">
                  Ask Gemini to help with your code
                </p>
              </div>
            </div>
          ) : (
            <>
              <MessageList
                messages={gemini.messages}
                pendingTools={gemini.pendingTools}
                onApproveTool={gemini.approveTool}
                onRejectTool={gemini.rejectTool}
              />
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-800 bg-neutral-900/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <InputArea
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            isStreaming={gemini.isStreaming}
            onAbort={gemini.abort}
          />
        </div>
      </div>
    </div>
  );
}
