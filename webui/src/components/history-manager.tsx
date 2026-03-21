"use client";

import { useEffect, useRef, useState } from "react";
import { AnalysisRecord, historyStorage } from "@/lib/history-storage";

interface HistoryManagerProps {
  onSelectRecord: (record: AnalysisRecord) => void;
}

export function HistoryManager({ onSelectRecord }: HistoryManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ 
    type: "filesystem" | "indexeddb"; 
    isPersistent: boolean; 
    recordCount: number;
    canExport: boolean;
  } | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize storage on mount
  useEffect(() => {
    const init = async () => {
      const ready = await historyStorage.initialize();
      if (!ready) {
        setShowSetup(true);
      }
      setIsInitialized(true);
      await loadStorageInfo();
    };
    init();
  }, []);

  // Load records when modal opens
  useEffect(() => {
    if (isOpen && isInitialized) {
      loadRecords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isInitialized]);

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const loadStorageInfo = async () => {
    const info = await historyStorage.getStorageInfo();
    setStorageInfo(info);
  };

  const loadRecords = async () => {
    setIsLoading(true);
    try {
      const data = await historyStorage.getAll();
      setRecords(data);
      await loadStorageInfo();
    } catch (error) {
      console.error("Failed to load records:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupStorage = async () => {
    const success = await historyStorage.selectFolder();
    if (success) {
      setShowSetup(false);
      await loadStorageInfo();
      await loadRecords();
    }
  };

  const handleExport = async () => {
    try {
      const blob = await historyStorage.exportToJSON();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `commitguard-history-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export:", error);
      alert("Failed to export history");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = await historyStorage.importFromJSON(text);
      alert(`Import complete: ${result.success} imported, ${result.failed} failed`);
      await loadRecords();
    } catch (error) {
      console.error("Failed to import:", error);
      alert("Failed to import history. Please check the file format.");
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this analysis?")) return;
    
    const success = await historyStorage.delete(id);
    if (success) {
      await loadRecords();
    } else {
      alert("Failed to delete analysis");
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to delete ALL analysis history? This cannot be undone.")) return;
    
    const success = await historyStorage.clearAll();
    if (success) {
      setRecords([]);
      await loadStorageInfo();
    } else {
      alert("Failed to clear history");
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatCommitMessage = (message: string, maxLen = 60) => {
    if (!message) return "No message";
    const firstLine = message.split("\n")[0];
    return firstLine.length > maxLen ? firstLine.slice(0, maxLen) + "..." : firstLine;
  };

  if (!isInitialized) {
    return null;
  }

  return (
    <>
      {/* History Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition-colors flex items-center gap-2"
        title="View Analysis History"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        History {storageInfo && storageInfo.recordCount > 0 && (
          <span className="bg-green-800 px-1.5 py-0.5 rounded text-xs">
            {storageInfo.recordCount}
          </span>
        )}
      </button>

      {/* Setup Modal */}
      {showSetup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-semibold text-white mb-4">Setup Analysis History</h2>
            
            <div className="space-y-4">
              <div className="bg-blue-900/30 border border-blue-700/50 rounded p-3">
                <p className="text-sm text-blue-200">
                  Choose where to store your analysis history:
                </p>
              </div>

              <button
                onClick={handleSetupStorage}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-500 text-white rounded text-left transition-colors"
              >
                <div className="font-medium">Save to File System (Recommended)</div>
                <div className="text-sm text-green-100 mt-1">
                  Choose a folder on your computer. Data persists even if browser data is cleared.
                </div>
              </button>

              <button
                onClick={() => {
                  setShowSetup(false);
                  loadRecords();
                }}
                className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-left transition-colors"
              >
                <div className="font-medium">Use Browser Storage</div>
                <div className="text-sm text-gray-400 mt-1">
                  Data stored in browser. Will be lost if you clear browser data.
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div 
            ref={modalRef}
            className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">Analysis History</h2>
                {storageInfo && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    storageInfo.isPersistent 
                      ? "bg-green-900/50 text-green-400 border border-green-700/50" 
                      : "bg-yellow-900/50 text-yellow-400 border border-yellow-700/50"
                  }`}>
                    {storageInfo.isPersistent ? "Persistent Storage" : "Browser Storage"}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {/* Export Button */}
                <button
                  onClick={handleExport}
                  disabled={records.length === 0}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors flex items-center gap-1.5"
                  title="Export all history to JSON"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export
                </button>

                {/* Import Button */}
                <button
                  onClick={handleImportClick}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors flex items-center gap-1.5"
                  title="Import history from JSON"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />

                {/* Refresh Button */}
                <button
                  onClick={loadRecords}
                  className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                  title="Refresh"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>

                {/* Close Button */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Records List */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-400">Loading history...</p>
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-gray-400 mb-2">No analysis history yet</p>
                  <p className="text-sm text-gray-500">
                    Run some analyses and they will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {records.map((record) => (
                    <div
                      key={record.id}
                      className="bg-gray-800/50 border border-gray-700 rounded p-3 hover:border-gray-600 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded">
                              {record.commitHash.slice(0, 7)}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDate(record.timestamp)}
                            </span>
                            {record.truncated && (
                              <span className="text-xs text-yellow-500 bg-yellow-900/30 px-1.5 py-0.5 rounded">
                                Truncated
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-white font-medium truncate">
                            {formatCommitMessage(record.commitMessage)}
                          </p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              {record.author}
                            </span>
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                              </svg>
                              {record.repoPath.split("/").pop()}
                            </span>
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              {record.model.split("/").pop()}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              onSelectRecord(record);
                              setIsOpen(false);
                            }}
                            className="p-1.5 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
                            title="View analysis"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {records.length > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-gray-700 bg-gray-900">
                <div className="text-sm text-gray-400">
                  {records.length} analysis{records.length !== 1 ? "es" : ""} stored
                </div>
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 text-sm rounded transition-colors"
                >
                  Clear All History
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
