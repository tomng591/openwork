/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { SplitPane } from './components/layout/SplitPane';
import { ChatView } from './components/chat/ChatView';
import { FileViewer } from './components/files/FileViewer';
import { useGemini } from './hooks/useGemini';
import { useUIStore } from './stores/uiStore';

export default function App(): JSX.Element {
  const [isInitialized, setIsInitialized] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const { showFileViewer, toggleFileViewer } = useUIStore();
  const gemini = useGemini();

  // Initialize Gemini when project is selected
  useEffect(() => {
    if (projectPath && !isInitialized) {
      window.api.gemini
        .initialize({ targetDir: projectPath })
        .then(() => {
          setIsInitialized(true);
        })
        .catch((_error) => {
          // console.error('Failed to initialize:', error);
        });
    }
  }, [projectPath, isInitialized]);

  // Handle menu events
  useEffect(() => {
    const cleanups = [
      window.api.menu.onToggleFileViewer(toggleFileViewer),
      window.api.menu.onStopGeneration(gemini.abort),
      window.api.menu.onClearConversation(() => {
        gemini.clearMessages();
        window.api.gemini.reset();
      }),
      window.api.menu.onNewConversation(() => {
        gemini.clearMessages();
        window.api.gemini.reset();
      }),
      window.api.menu.onOpenProject(() => {
        // TODO: Open folder picker dialog
        // console.log('Open project picker');
      }),
    ];

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [gemini, toggleFileViewer]);

  // Project selection screen
  if (!projectPath) {
    return (
      <div className="flex flex-col h-screen bg-neutral-900">
        <TitleBar title="Gemini Desktop" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 p-8">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-neutral-100">
                Welcome to Gemini Desktop
              </h1>
              <p className="text-neutral-400">
                Select a project folder to get started
              </p>
            </div>
            <button
              onClick={async () => {
                const folder = await window.api.dialog.openFolder();
                if (folder) {
                  setProjectPath(folder);
                }
              }}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-600/20"
            >
              Open Project Folder
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TitleBar title={projectPath.split('/').pop() || 'Gemini Desktop'} />

      <div className="flex-1 overflow-hidden">
        {showFileViewer ? (
          <SplitPane
            left={<ChatView gemini={gemini} />}
            right={<FileViewer />}
            defaultLeftWidth={50}
            minLeftWidth={30}
            maxLeftWidth={70}
          />
        ) : (
          <ChatView gemini={gemini} />
        )}
      </div>
    </div>
  );
}
