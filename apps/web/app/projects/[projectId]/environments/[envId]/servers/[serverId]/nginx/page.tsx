"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { NginxMap } from "@/components/nginx/NginxMap";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { FileCode2, RefreshCw, Save, CheckCircle2, XCircle, File, Loader2 } from "lucide-react";
import type { NginxBlock } from "@/lib/types";

interface PageProps {
  params: { projectId: string; envId: string; serverId: string };
}

export default function NginxPage({ params }: PageProps) {
  const [activeTab, setActiveTab] = useState<"parsed" | "raw">("parsed");

  // Parsed tab
  const [blocks, setBlocks] = useState<NginxBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);

  // Raw editor tab
  const [files, setFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [rawContent, setRawContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ output: string; success: boolean } | null>(null);

  const loadParsed = useCallback(async () => {
    setBlocksLoading(true);
    try {
      setBlocks(await api.nginx.get(params.serverId));
    } catch {
      setBlocks([]);
    } finally {
      setBlocksLoading(false);
    }
  }, [params.serverId]);

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    setFilesError(null);
    try {
      const list = await api.nginx.listFiles(params.serverId);
      setFiles(list);
      // Use functional update to read current selectedFile — avoids stale closure.
      setSelectedFile((prev) => (prev === null && list.length > 0) ? list[0] : prev);
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : "Failed to list nginx files");
    } finally {
      setFilesLoading(false);
    }
  }, [params.serverId]);

  const loadFile = useCallback(async (path: string) => {
    setFileLoading(true);
    setFileError(null);
    setTestResult(null);
    try {
      const data = await api.nginx.getFile(params.serverId, path);
      setRawContent(data.content);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Failed to load file");
    } finally {
      setFileLoading(false);
    }
  }, [params.serverId]);

  useEffect(() => { loadParsed(); }, [loadParsed]);
  useEffect(() => { loadFiles(); }, [loadFiles]);
  useEffect(() => { if (selectedFile) loadFile(selectedFile); }, [selectedFile, loadFile]);

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setTestResult(null);
    try {
      const result = await api.nginx.updateRaw(params.serverId, rawContent, selectedFile);
      setTestResult(result);
      if (result.success) {
        toast({ title: "Saved and reloaded nginx" });
        loadParsed();
      } else {
        toast({ title: "nginx -t failed", description: "Config written but rejected by nginx.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const basename = (path: string) => path.split("/").pop() ?? path;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileCode2 className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Nginx Configuration</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            View and edit nginx server blocks on this server.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "parsed" | "raw")}>
        <TabsList>
          <TabsTrigger value="parsed">Parsed View</TabsTrigger>
          <TabsTrigger value="raw">Raw Editor</TabsTrigger>
        </TabsList>

        {/* ── Parsed tab ── */}
        <div className={activeTab !== "parsed" ? "hidden" : "mt-4 space-y-3"}>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={loadParsed} disabled={blocksLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${blocksLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {blocksLoading
            ? <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            : <NginxMap blocks={blocks} />
          }
        </div>

        {/* ── Raw editor tab ── */}
        <div className={activeTab !== "raw" ? "hidden" : "mt-4"}>
          {filesLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Listing config files...
            </div>
          ) : filesError ? (
            <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {filesError}
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground text-sm">
              No config files found in <code>/etc/nginx/sites-enabled</code> or <code>/etc/nginx/conf.d</code>.
            </div>
          ) : (
            <div className="flex gap-4 min-h-[60vh]">
              {/* File list sidebar */}
              <div className="w-56 flex-shrink-0 rounded-lg border overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground flex items-center justify-between">
                  Config Files
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={loadFiles}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
                <div className="divide-y">
                  {files.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSelectedFile(f)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-muted/50 transition-colors ${selectedFile === f ? "bg-muted font-medium" : ""}`}
                    >
                      <File className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono text-xs" title={f}>{basename(f)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor */}
              <div className="flex-1 flex flex-col gap-3 min-w-0">
                {selectedFile && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-muted-foreground truncate">{selectedFile}</span>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => loadFile(selectedFile)} disabled={fileLoading}>
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${fileLoading ? "animate-spin" : ""}`} />
                        Reload
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={saving || fileLoading}>
                        <Save className="h-3.5 w-3.5 mr-1" />
                        {saving ? "Saving..." : "Save & Reload Nginx"}
                      </Button>
                    </div>
                  </div>
                )}

                {fileLoading ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : fileError ? (
                  <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {fileError}
                  </div>
                ) : (
                  <textarea
                    value={rawContent}
                    onChange={(e) => { setRawContent(e.target.value); setTestResult(null); }}
                    className="flex-1 min-h-[55vh] w-full font-mono text-xs rounded-md border bg-zinc-950 text-zinc-100 p-4 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    spellCheck={false}
                  />
                )}

                {testResult && (
                  <Card className={testResult.success ? "border-green-500" : "border-red-500"}>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className={`text-sm flex items-center gap-2 ${testResult.success ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {testResult.success
                          ? <><CheckCircle2 className="h-4 w-4" />nginx -t passed — config reloaded</>
                          : <><XCircle className="h-4 w-4" />nginx -t failed — original config preserved</>
                        }
                      </CardTitle>
                    </CardHeader>
                    {testResult.output && (
                      <CardContent className="pt-0 px-4 pb-4">
                        <pre className="font-mono text-xs bg-zinc-950 text-zinc-200 rounded p-3 whitespace-pre-wrap overflow-x-auto">
                          {testResult.output}
                        </pre>
                      </CardContent>
                    )}
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
