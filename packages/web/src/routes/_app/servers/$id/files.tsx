import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useRef, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import {
  ChevronRight, Folder, FolderOpen, File, FileCode, FileText, FileJson,
  FileCog, Save, Loader2, Trash2, FolderPlus, AlertTriangle, X, Home, Upload, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import { cn } from "@/lib/utils.ts";

export const Route = createFileRoute("/_app/servers/$id/files")({
  validateSearch: (s: Record<string, unknown>) => ({
    path: typeof s.path === "string" ? s.path : "/",
    file: typeof s.file === "string" ? s.file : undefined as string | undefined,
  }),
  component: FilesPage,
});

interface Entry {
  name: string;
  type: "file" | "directory";
  path: string;
  size: number | null;
  modifiedAt: string | null;
}

// ── File icon / language helpers ─────────────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  js: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript",
  json: "json", yaml: "yaml", yml: "yaml", toml: "ini",
  properties: "ini", sh: "shell", bash: "shell", conf: "ini", cfg: "ini",
  xml: "xml", html: "html", css: "css", md: "markdown",
  txt: "plaintext", log: "plaintext", java: "java", py: "python",
};

function getLang(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "plaintext";
}

function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["json", "yaml", "yml", "toml"].includes(ext))
    return <FileJson className={cn("w-4 h-4 text-yellow-400", className)} />;
  if (["properties", "cfg", "conf", "ini"].includes(ext))
    return <FileCog className={cn("w-4 h-4 text-orange-400", className)} />;
  if (["js", "ts", "tsx", "jsx", "java", "py", "sh"].includes(ext))
    return <FileCode className={cn("w-4 h-4 text-blue-400", className)} />;
  if (["txt", "log", "md"].includes(ext))
    return <FileText className={cn("w-4 h-4 text-gray-400", className)} />;
  return <File className={cn("w-4 h-4 text-muted-foreground", className)} />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BINARY_EXTS = new Set(["jar", "zip", "gz", "tar", "png", "jpg", "jpeg", "gif", "webp", "ico", "dat", "nbt", "mca", "mcr"]);
function isBinary(filename: string) {
  return BINARY_EXTS.has(filename.split(".").pop()?.toLowerCase() ?? "");
}

// ── Component ────────────────────────────────────────────────────────────────

function FilesPage() {
  const { id } = Route.useParams();
  const { path: currentPath, file: openFilePath } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  const [openFile, setOpenFile] = useState<{ path: string; name: string } | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  /** Navigate to a directory — pushes into history */
  const goTo = useCallback((path: string) => {
    void navigate({ search: (prev) => ({ ...prev, path, file: undefined }) });
  }, [navigate]);

  /** Open a file — pushes into history */
  const pushFile = useCallback((filePath: string) => {
    void navigate({ search: (prev) => ({ ...prev, file: filePath }) });
  }, [navigate]);

  // ── Drag-n-drop state ───────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<{ name: string; done: boolean; error?: string }[]>([]);
  const dragCounter = useRef(0); // track nested dragenter/dragleave

  // ── Directory listing ───────────────────────────────────────────────────
  const { data: entries = [], isLoading: listLoading } = useQuery<Entry[]>({
    queryKey: ["files", id, currentPath],
    queryFn: () =>
      fetch(`/api/servers/${id}/files?path=${encodeURIComponent(currentPath)}`, { credentials: "include" })
        .then((r) => r.json()),
  });

  // ── Save file ───────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      fetch(`/api/servers/${id}/files/content?path=${encodeURIComponent(path)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }).then((r) => r.json()),
    onSuccess: () => setIsDirty(false),
  });

  // ── Delete ──────────────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (filePath: string) =>
      fetch(`/api/servers/${id}/files?path=${encodeURIComponent(filePath)}`, {
        method: "DELETE",
        credentials: "include",
      }).then((r) => r.json()),
    onSuccess: (_, filePath) => {
      void qc.invalidateQueries({ queryKey: ["files", id, currentPath] });
      if (openFile?.path === filePath) void navigate({ search: (prev) => ({ ...prev, file: undefined }) });
    },
  });

  // ── Upload files ────────────────────────────────────────────────────────
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    setUploads(list.map((f) => ({ name: f.name, done: false })));
    for (const file of list) {
      const form = new FormData();
      form.append("files", file);
      try {
        await fetch(`/api/servers/${id}/files/upload?path=${encodeURIComponent(currentPath)}`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
        setUploads((prev) => prev.map((u) => u.name === file.name ? { ...u, done: true } : u));
      } catch (e) {
        setUploads((prev) => prev.map((u) => u.name === file.name ? { ...u, done: true, error: String(e) } : u));
      }
    }
    void qc.invalidateQueries({ queryKey: ["files", id, currentPath] });
    setTimeout(() => setUploads([]), 3000);
  }, [id, currentPath, qc]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files);
  };

  // ── Load file from URL param ────────────────────────────────────────────
  useEffect(() => {
    if (!openFilePath) { setOpenFile(null); return; }
    const name = openFilePath.split("/").pop() ?? openFilePath;
    if (isBinary(name)) {
      setOpenFile({ path: openFilePath, name });
      setEditorContent(`// Binary file — cannot display\n// Path: ${openFilePath}`);
      setIsDirty(false);
      return;
    }
    setLoadingFile(true);
    fetch(`/api/servers/${id}/files/content?path=${encodeURIComponent(openFilePath)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: { content?: string; error?: string }) => {
        setOpenFile({ path: openFilePath, name });
        setEditorContent(data.content ?? `// Error: ${data.error ?? "unknown"}`);
        setIsDirty(false);
      })
      .finally(() => setLoadingFile(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFilePath, id]);

  // ── Open file — push path into URL ─────────────────────────────────────
  const handleOpenFile = useCallback((entry: Entry) => {
    pushFile(entry.path);
  }, [pushFile]);

  // ── Keyboard save (Ctrl/Cmd+S) ──────────────────────────────────────────
  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (window as unknown as { monaco: typeof Monaco }).monaco?.KeyMod.CtrlCmd | 83,
      () => {
        if (openFile && isDirty)
          saveMut.mutate({ path: openFile.path, content: editor.getValue() });
      }
    );
  };

  // ── Breadcrumbs ─────────────────────────────────────────────────────────
  const segments = currentPath.split("/").filter(Boolean);

  const sorted = [...entries].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Breadcrumb bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0 bg-card text-sm">
        <button
          onClick={() => goTo("/")}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="w-3.5 h-3.5" />
        </button>
        {segments.map((seg, i) => {
          const p = "/" + segments.slice(0, i + 1).join("/");
          return (
            <span key={p} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => goTo(p)}
              >
                {seg}
              </button>
            </span>
          );
        })}
      </div>

      {/* Main two-pane layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── File tree pane ─────────────────────────────────────────── */}
        <div
          className={cn(
            "w-64 shrink-0 flex flex-col border-r border-border overflow-hidden relative transition-colors",
            isDragging && "border-red-500/60 bg-red-600/5"
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drop overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none bg-background/80 backdrop-blur-sm border-2 border-dashed border-red-500/60 rounded-sm">
              <Upload className="w-8 h-8 text-red-400" />
              <p className="text-xs font-medium text-red-400">Drop to upload</p>
              <p className="text-[10px] text-muted-foreground">{currentPath}</p>
            </div>
          )}
          <ScrollArea className="flex-1">
            {listLoading ? (
              <div className="p-3 space-y-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">Empty directory.</p>
            ) : (
              <ul className="py-1">
                {/* Parent dir */}
                {currentPath !== "/" && (
                  <li>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                      onClick={() => {
                        const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
                        goTo(parent);
                      }}
                    >
                      <FolderOpen className="w-4 h-4 text-yellow-500/60 shrink-0" />
                      <span>..</span>
                    </button>
                  </li>
                )}
                {sorted.map((entry) => {
                  const isActive = openFile?.path === entry.path;
                  return (
                    <li key={entry.path}>
                      <button
                        className={cn(
                          "group w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                          isActive ? "bg-red-600/15 text-foreground" : "hover:bg-accent text-foreground/80 hover:text-foreground"
                        )}
                        onClick={() => {
                          if (entry.type === "directory") goTo(entry.path);
                          else void handleOpenFile(entry);
                        }}
                      >
                        {entry.type === "directory"
                          ? <Folder className="w-4 h-4 text-yellow-500 shrink-0" />
                          : <FileIcon name={entry.name} />}
                        <span className="flex-1 truncate text-left">{entry.name}</span>
                        {entry.size !== null && (
                          <span className="text-[10px] text-muted-foreground/50 hidden group-hover:block">
                            {formatBytes(entry.size)}
                          </span>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <span
                              role="button"
                              className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-red-600/20 text-muted-foreground hover:text-red-400 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-3 h-3" />
                            </span>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                Delete {entry.type === "directory" ? "folder" : "file"}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                <code className="text-xs bg-muted px-1 py-0.5 rounded">{entry.name}</code>
                                {entry.type === "directory"
                                  ? " and all its contents will be permanently deleted."
                                  : " will be permanently deleted."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => deleteMut.mutate(entry.path)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-t border-border shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title="New folder"
              onClick={async () => {
                const name = prompt("Folder name:");
                if (!name?.trim()) return;
                const newPath = currentPath.replace(/\/$/, "") + "/" + name.trim();
                await fetch(`/api/servers/${id}/files/mkdir?path=${encodeURIComponent(newPath)}`, {
                  method: "POST", credentials: "include",
                });
                void qc.invalidateQueries({ queryKey: ["files", id, currentPath] });
              }}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </Button>
            {/* Upload button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title="Upload files"
              onClick={() => document.getElementById(`upload-input-${id}`)?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <input
              id={`upload-input-${id}`}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) void uploadFiles(e.target.files); e.target.value = ""; }}
            />
            <span className="text-[10px] text-muted-foreground ml-1 select-none">Drop files to upload</span>
          </div>

          {/* Upload progress */}
          {uploads.length > 0 && (
            <div className="border-t border-border px-2 py-1.5 space-y-1 shrink-0">
              {uploads.map((u) => (
                <div key={u.name} className="flex items-center gap-1.5 text-[10px]">
                  {u.done
                    ? u.error
                      ? <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                      : <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                    : <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />}
                  <span className={cn("truncate", u.error ? "text-red-400" : u.done ? "text-green-400" : "text-muted-foreground")}>
                    {u.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Editor pane ──────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {openFile ? (
            <>
              {/* Editor header */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card shrink-0 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon name={openFile.name} />
                  <span className="text-xs font-mono truncate">{openFile.path}</span>
                  {isDirty && <Badge variant="outline" className="text-[10px] h-4 px-1 border-yellow-600/40 text-yellow-400">unsaved</Badge>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-red-600 hover:bg-red-700"
                    disabled={!isDirty || saveMut.isPending || isBinary(openFile.name)}
                    onClick={() => saveMut.mutate({ path: openFile.path, content: editorContent })}
                  >
                    {saveMut.isPending
                      ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      : <Save className="w-3 h-3 mr-1" />}
                    Save
                  </Button>
                  {/* Delete currently open file */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-600/10"
                        title="Delete file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          Delete file?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">{openFile.name}</code> will be permanently deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => deleteMut.mutate(openFile.path)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => { void navigate({ search: (prev) => ({ ...prev, file: undefined }) }); setIsDirty(false); }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {/* Monaco editor */}
              {loadingFile ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex-1 min-h-0">
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    language={getLang(openFile.name)}
                    value={editorContent}
                    options={{
                      fontSize: 13,
                      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 10, bottom: 10 },
                      readOnly: isBinary(openFile.name),
                      renderLineHighlight: "gutter",
                      lineNumbers: "on",
                      folding: true,
                      bracketPairColorization: { enabled: true },
                    }}
                    onChange={(val) => {
                      setEditorContent(val ?? "");
                      setIsDirty(true);
                    }}
                    onMount={handleEditorMount}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
              <FolderOpen className="w-12 h-12 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">Select a file to edit</p>
              <p className="text-xs text-muted-foreground/50">Supports syntax highlighting · Save with Ctrl+S</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

