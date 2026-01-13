/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
interface TitleBarProps {
  title: string;
}

export function TitleBar({ title }: TitleBarProps): JSX.Element {
  return (
    <div className="titlebar-drag h-12 flex items-center justify-center bg-neutral-900/90 backdrop-blur-xl border-b border-neutral-800">
      {/* Traffic light buttons space (macOS) */}
      <div className="absolute left-0 w-20" />

      {/* Title */}
      <span className="text-sm font-medium text-neutral-400">{title}</span>
    </div>
  );
}
