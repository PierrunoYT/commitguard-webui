"use client";

// File System Access API storage with IndexedDB fallback
// Stores analysis history in ~/.commitguard-webui/history/

const DB_NAME = "CommitGuardHistory";
const DB_VERSION = 1;
const STORE_NAME = "analyses";
const METADATA_STORE = "metadata";

export interface AnalysisRecord {
  id: string;
  timestamp: number;
  repoPath: string;
  commitHash: string;
  commitMessage: string;
  author: string;
  date: string;
  result: string;
  diff: string;
  model: string;
  truncated?: boolean;
}

export interface HistoryMetadata {
  lastAccessed: number;
  totalAnalyses: number;
  folderHandle?: FileSystemDirectoryHandle;
}

class FileSystemStorage {
  private folderHandle: FileSystemDirectoryHandle | null = null;
  private historyFolderHandle: FileSystemDirectoryHandle | null = null;
  private useFileSystem: boolean = false;
  private db: IDBDatabase | null = null;

  constructor() {
    // Check if File System Access API is supported (guard against SSR)
    this.useFileSystem = typeof window !== "undefined" && "showDirectoryPicker" in window;
  }

  // Initialize storage - request permission if using File System Access API
  async initialize(): Promise<boolean> {
    if (this.useFileSystem) {
      // Try to restore previous permission
      const restored = await this.restoreFolderPermission();
      if (restored) {
        return true;
      }
      // Will need to request permission via selectFolder()
      return false;
    } else {
      // Use IndexedDB fallback
      return this.initIndexedDB();
    }
  }

  // Check if we have a folder selected
  isReady(): boolean {
    if (this.useFileSystem) {
      return this.folderHandle !== null;
    }
    return this.db !== null;
  }

  // Request user to select a folder
  async selectFolder(): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
    if (!this.useFileSystem) {
      console.log("File System Access API not supported, using IndexedDB");
      const success = await this.initIndexedDB();
      return { success };
    }

    try {
      // Show picker for user to select/create directory
       
      this.folderHandle = await (window as unknown as { showDirectoryPicker: (options: {
        id: string;
        mode: string;
        startIn?: string;
      }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({
        id: "commitguard-history",
        mode: "readwrite",
        startIn: "documents",
      });

      // Create/verify history subdirectory
      try {
        this.historyFolderHandle = await this.folderHandle.getDirectoryHandle("history", { create: true });
      } catch {
        this.historyFolderHandle = this.folderHandle;
      }

      // Save permission state
      await this.savePermissionState();
      
      return { success: true };
    } catch (error) {
      // Check if user cancelled the picker
      if (error instanceof Error && error.name === "AbortError") {
        return { success: false, cancelled: true };
      }
      
      console.error("Failed to select folder:", error);
      // Fallback to IndexedDB for other errors
      this.useFileSystem = false;
      const success = await this.initIndexedDB();
      return { success, error: error instanceof Error ? error.message : "Failed to access file system" };
    }
  }

  // Restore previous folder permission
  private async restoreFolderPermission(): Promise<boolean> {
    try {
      const stored = localStorage.getItem("commitguard_folder_permission");
      if (!stored) return false;

      // We don't need the stored handle, just check if we can restore permission
      void JSON.parse(stored);
      
      // Try to restore - this will prompt if permission was revoked
       
      this.folderHandle = await (window as unknown as { showDirectoryPicker: (options: {
        id: string;
        mode: string;
      }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({
        id: "commitguard-history",
        mode: "readwrite",
      });

      // Verify it's the same folder
      if (this.folderHandle && await this.verifyPermission(this.folderHandle)) {
        try {
          this.historyFolderHandle = await this.folderHandle.getDirectoryHandle("history", { create: false });
        } catch {
          this.historyFolderHandle = this.folderHandle;
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Verify we have permission
  private async verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const options = { mode: "readwrite" };
     
    const queryResult = await (handle as unknown as { queryPermission: (opts: { mode: string }) => Promise<string> }).queryPermission(options);
    if (queryResult === "granted") {
      return true;
    }
     
    const requestResult = await (handle as unknown as { requestPermission: (opts: { mode: string }) => Promise<string> }).requestPermission(options);
    if (requestResult === "granted") {
      return true;
    }
    return false;
  }

  // Save permission state to localStorage
  private async savePermissionState(): Promise<void> {
    if (this.folderHandle) {
      localStorage.setItem("commitguard_folder_permission", JSON.stringify({
        timestamp: Date.now(),
      }));
    }
  }

  // Initialize IndexedDB fallback
  private async initIndexedDB(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Failed to open IndexedDB:", request.error);
        resolve(false);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(true);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp", { unique: false });
          store.createIndex("repoPath", "repoPath", { unique: false });
          store.createIndex("commitHash", "commitHash", { unique: false });
        }
        
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: "key" });
        }
      };
    });
  }

  // Save analysis record
  async save(record: AnalysisRecord): Promise<boolean> {
    if (this.useFileSystem && this.historyFolderHandle) {
      return this.saveToFile(record);
    } else if (this.db) {
      return this.saveToIndexedDB(record);
    }
    return false;
  }

  // Save to file system
  private async saveToFile(record: AnalysisRecord): Promise<boolean> {
    try {
      // Create safe filename
      const safeRepo = record.repoPath.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50);
      const filename = `${safeRepo}_${record.commitHash.slice(0, 8)}_${record.id}.json`;
      
      const fileHandle = await this.historyFolderHandle!.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      
      await writable.write(JSON.stringify(record, null, 2));
      await writable.close();
      
      // Update metadata
      await this.updateMetadata();
      
      return true;
    } catch (error) {
      console.error("Failed to save to file:", error);
      // Fallback to IndexedDB
      if (this.db) {
        return this.saveToIndexedDB(record);
      }
      return false;
    }
  }

  // Save to IndexedDB
  private async saveToIndexedDB(record: AnalysisRecord): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.db) {
        resolve(false);
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record);

      request.onsuccess = () => resolve(true);
      request.onerror = () => {
        console.error("Failed to save to IndexedDB:", request.error);
        resolve(false);
      };
    });
  }

  // Get all records
  async getAll(): Promise<AnalysisRecord[]> {
    if (this.useFileSystem && this.historyFolderHandle) {
      return this.getAllFromFiles();
    } else if (this.db) {
      return this.getAllFromIndexedDB();
    }
    return [];
  }

  // Get all from file system
  private async getAllFromFiles(): Promise<AnalysisRecord[]> {
    const records: AnalysisRecord[] = [];
    
    try {
       
      // @ts-expect-error - TypeScript doesn't know about async iterators on FileSystemDirectoryHandle
      for await (const [name, entryHandle] of this.historyFolderHandle!.entries()) {
        if (entryHandle.kind === "file" && name.endsWith(".json")) {
          try {
            const fileHandle = entryHandle as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            const content = await file.text();
            const record = JSON.parse(content) as AnalysisRecord;
            records.push(record);
          } catch (error) {
            console.warn("Failed to read file:", name, error);
          }
        }
      }
    } catch (error) {
      console.error("Failed to read files:", error);
    }

    return records.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Get all from IndexedDB
  private async getAllFromIndexedDB(): Promise<AnalysisRecord[]> {
    return new Promise((resolve) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("timestamp");
      const request = index.openCursor(null, "prev");

      const records: AnalysisRecord[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          records.push(cursor.value);
          cursor.continue();
        } else {
          resolve(records);
        }
      };

      request.onerror = () => {
        console.error("Failed to read from IndexedDB:", request.error);
        resolve([]);
      };
    });
  }

  // Get records by repository
  async getByRepo(repoPath: string): Promise<AnalysisRecord[]> {
    const all = await this.getAll();
    return all.filter(r => r.repoPath === repoPath);
  }

  // Get record by ID
  async getById(id: string): Promise<AnalysisRecord | null> {
    if (this.useFileSystem && this.historyFolderHandle) {
      // Search for file with this ID
      try {
         
        // @ts-expect-error - TypeScript doesn't know about async iterators on FileSystemDirectoryHandle
        for await (const [name, entryHandle] of this.historyFolderHandle.entries()) {
          if (name.includes(id) && name.endsWith(".json")) {
            const fileHandle = entryHandle as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            const content = await file.text();
            return JSON.parse(content) as AnalysisRecord;
          }
        }
      } catch (error) {
        console.error("Failed to find file:", error);
      }
      return null;
    } else if (this.db) {
      return new Promise((resolve) => {
        const transaction = this.db!.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    }
    return null;
  }

  // Delete a record
  async delete(id: string): Promise<boolean> {
    if (this.useFileSystem && this.historyFolderHandle) {
      try {
         
        // @ts-expect-error - TypeScript doesn't know about async iterators on FileSystemDirectoryHandle
        for await (const [name] of this.historyFolderHandle.entries()) {
          if (name.includes(id) && name.endsWith(".json")) {
            await this.historyFolderHandle!.removeEntry(name);
            await this.updateMetadata();
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error("Failed to delete file:", error);
        return false;
      }
    } else if (this.db) {
      return new Promise((resolve) => {
        const transaction = this.db!.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    }
    return false;
  }

  // Clear all history
  async clearAll(): Promise<boolean> {
    if (this.useFileSystem && this.historyFolderHandle) {
      try {
         
        // @ts-expect-error - TypeScript doesn't know about async iterators on FileSystemDirectoryHandle
        for await (const [name] of this.historyFolderHandle.entries()) {
          if (name.endsWith(".json")) {
            await this.historyFolderHandle!.removeEntry(name);
          }
        }
        await this.updateMetadata();
        return true;
      } catch (error) {
        console.error("Failed to clear files:", error);
        return false;
      }
    } else if (this.db) {
      return new Promise((resolve) => {
        const transaction = this.db!.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    }
    return false;
  }

  // Update metadata
  private async updateMetadata(): Promise<void> {
    const records = await this.getAllFromFiles();
    const metadata = {
      lastAccessed: Date.now(),
      totalAnalyses: records.length,
    };

    try {
      const fileHandle = await this.historyFolderHandle!.getFileHandle("metadata.json", { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(metadata, null, 2));
      await writable.close();
    } catch (error) {
      console.warn("Failed to update metadata:", error);
    }
  }

  // Get metadata
  async getMetadata(): Promise<{ lastAccessed: number; totalAnalyses: number } | null> {
    if (this.useFileSystem && this.historyFolderHandle) {
      try {
        const fileHandle = await this.historyFolderHandle!.getFileHandle("metadata.json", { create: false });
        const file = await fileHandle.getFile();
        const content = await file.text();
        return JSON.parse(content);
      } catch {
        return null;
      }
    } else if (this.db) {
      return new Promise((resolve) => {
        const transaction = this.db!.transaction([METADATA_STORE], "readonly");
        const store = transaction.objectStore(METADATA_STORE);
        const request = store.get("metadata");

        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            resolve({
              lastAccessed: result.lastAccessed,
              totalAnalyses: result.totalAnalyses,
            });
          } else {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null);
      });
    }
    return null;
  }

  // Export all data to JSON file
  async exportToJSON(): Promise<Blob> {
    const records = await this.getAll();
    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      totalRecords: records.length,
      records,
    };
    
    return new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  }

  // Import data from JSON
  async importFromJSON(jsonData: string): Promise<{ success: number; failed: number }> {
    try {
      const data = JSON.parse(jsonData);
      const records: AnalysisRecord[] = data.records || [];
      
      let success = 0;
      let failed = 0;

      for (const record of records) {
        // Ensure required fields
        if (!record.id || !record.timestamp) {
          failed++;
          continue;
        }
        
        const saved = await this.save(record);
        if (saved) {
          success++;
        } else {
          failed++;
        }
      }

      return { success, failed };
    } catch (error) {
      console.error("Failed to import:", error);
      return { success: 0, failed: 0 };
    }
  }

  // Get storage info
  async getStorageInfo(): Promise<{ 
    type: "filesystem" | "indexeddb"; 
    isPersistent: boolean; 
    recordCount: number;
    canExport: boolean;
    location?: string;
  }> {
    const records = await this.getAll();
    
    let location: string | undefined;
    if (this.useFileSystem && this.folderHandle) {
      // Try to get the folder name
      location = this.folderHandle.name;
    }
    
    return {
      type: this.useFileSystem ? "filesystem" : "indexeddb",
      isPersistent: this.useFileSystem,
      recordCount: records.length,
      canExport: true,
      location,
    };
  }

  // Get storage quota (IndexedDB only)
  async getStorageQuota(): Promise<{ used: number; total: number } | null> {
    if (this.useFileSystem) {
      return null; // File system doesn't have quota
    }

    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        total: estimate.quota || 0,
      };
    }
    return null;
  }
}

// Singleton instance
export const historyStorage = new FileSystemStorage();
