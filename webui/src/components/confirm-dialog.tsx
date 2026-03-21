"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  isDanger: boolean;
  resolve: ((value: boolean) => void) | null;
}

interface UseConfirmDialogReturn {
  ConfirmDialog: React.FC;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
  const [state, setState] = useState<ConfirmDialogState>({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    isDanger: false,
    resolve: null,
  });

  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    resolveRef.current = state.resolve;
  }, [state.resolve]);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || "Confirm",
        cancelText: options.cancelText || "Cancel",
        isDanger: options.isDanger || false,
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    resolveRef.current?.(true);
  }, []);

  const handleCancel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    resolveRef.current?.(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel();
      } else if (e.key === "Enter") {
        handleConfirm();
      }
    },
    [handleCancel, handleConfirm]
  );

  const ConfirmDialog: React.FC = useCallback(() => {
    if (!state.isOpen) return null;

    return (
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4"
        onClick={handleCancel}
      >
        <div
          className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <h3
            id="confirm-title"
            className="text-lg font-semibold text-white mb-3"
          >
            {state.title}
          </h3>
          <p className="text-gray-300 mb-6 leading-relaxed">{state.message}</p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
              autoFocus
            >
              {state.cancelText}
            </button>
            <button
              onClick={handleConfirm}
              className={`px-4 py-2 rounded transition-colors ${
                state.isDanger
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-green-600 hover:bg-green-500 text-white"
              }`}
            >
              {state.confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  }, [state, handleCancel, handleConfirm, handleKeyDown]);

  return { ConfirmDialog, confirm };
}
