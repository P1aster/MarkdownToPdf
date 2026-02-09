import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import DropZone, { type DropItem } from "./components/DropZone";
import type { OpenDialogOptions } from "@tauri-apps/plugin-dialog";
import appIcon from "./assets/app-icon.png";

const STATUS_LABELS: Record<ProcessState, string> = {
  idle: "Awaiting input",
  processing: "Processing",
  success: "Complete",
  error: "Needs attention",
};

type ProcessState = "idle" | "processing" | "success" | "error";

type ProcessedInput = {
  markdown_files: string[];
  image_files: string[];
  root: string;
};

type ConvertResult = {
  output_path: string;
};

type InvokeArgs = Record<string, unknown>;

const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const callTauri = async <TResult,>(command: string, args: InvokeArgs) => {
  if (!isTauriRuntime()) {
    throw new Error("Tauri runtime not available. Open this inside the Tauri app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TResult>(command, args);
};

const openDialog = async (options: OpenDialogOptions): Promise<string | null> => {
  if (!isTauriRuntime()) {
    throw new Error("Tauri runtime not available. Open this inside the Tauri app.");
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open(options);
  if (Array.isArray(result)) {
    return result.length > 0 ? result[0] : null;
  }
  return result ?? null;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const maybeMessage: unknown = Reflect.get(error, "message");
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
  }
  return "Unexpected error.";
};

export default function App() {
  const [items, setItems] = useState<DropItem[]>([]);
  const [state, setState] = useState<ProcessState>("idle");
  const [message, setMessage] = useState<string>(
    "Drop a markdown file, directory, or zip to begin."
  );
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [processedInput, setProcessedInput] = useState<ProcessedInput | null>(null);
  const [manualOrderEnabled, setManualOrderEnabled] = useState(false);
  const [orderedMarkdown, setOrderedMarkdown] = useState<string[]>([]);
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsBooting(false), 900);
    return () => window.clearTimeout(timeout);
  }, []);

  const statusTone = useMemo(() => {
    switch (state) {
      case "processing":
        return "border-signal-400/60 bg-signal-400/10 text-signal-300";
      case "success":
        return "border-foam-400/60 bg-foam-400/10 text-foam-400";
      case "error":
        return "border-signal-500/70 bg-signal-500/10 text-signal-300";
      default:
        return "border-ink-700/60 bg-ink-900/70 text-ink-200";
    }
  }, [state]);

  const handleDropItems = useCallback((nextItems: DropItem[]) => {
    setItems(nextItems);
    setState("idle");
    setOutputPath(null);
    setMessage("Input captured. Ready to convert.");
    setProcessedInput(null);
    setManualOrderEnabled(false);
    setOrderedMarkdown([]);
  }, []);

  const handleDropError = useCallback((nextMessage: string) => {
    setState("error");
    setMessage(nextMessage);
  }, []);

  const handleBrowseFiles = useCallback(async () => {
    try {
      const path = await openDialog({
        multiple: false,
        filters: [
          { name: "Markdown", extensions: ["md", "markdown"] },
          { name: "Zip", extensions: ["zip"] },
        ],
      });

      if (!path) {
        return;
      }

      const lower = path.toLowerCase();
      const kind: DropItem["kind"] = lower.endsWith(".zip") ? "zip" : "file";
      handleDropItems([{ name: path.split("/").pop() ?? path, path, kind }]);
    } catch (error) {
      handleDropError(getErrorMessage(error));
    }
  }, [handleDropError, handleDropItems]);

  const handleBrowseFolder = useCallback(async () => {
    try {
      const path = await openDialog({
        multiple: false,
        directory: true,
      });

      if (!path) {
        return;
      }

      handleDropItems([{ name: path.split("/").pop() ?? path, path, kind: "directory" }]);
    } catch (error) {
      handleDropError(getErrorMessage(error));
    }
  }, [handleDropError, handleDropItems]);

  const ensureProcessedInput = useCallback(async (): Promise<ProcessedInput> => {
    const [firstItem] = items;
    if (!firstItem) {
      throw new Error("Add at least one markdown file, directory, or zip.");
    }
    if (processedInput) {
      return processedInput;
    }
    return callTauri<ProcessedInput>("process_input", {
      inputPath: firstItem.path,
    });
  }, [items, processedInput]);

  const handleManualOrderToggle = useCallback(async () => {
    if (!manualOrderEnabled) {
      setState("processing");
      setMessage("Scanning files to enable manual ordering.");
      try {
        const processed = await ensureProcessedInput();
        setProcessedInput(processed);
        setOrderedMarkdown(processed.markdown_files);
        setManualOrderEnabled(true);
        setState("idle");
        setMessage("Manual ordering enabled. Arrange markdown files before converting.");
      } catch (error) {
        setState("error");
        setMessage(getErrorMessage(error));
      }
      return;
    }

    setManualOrderEnabled(false);
    setOrderedMarkdown([]);
    if (state === "success" && outputPath) {
      setMessage("Manual ordering disabled. Previous export is preserved.");
    } else {
      setMessage("Manual ordering disabled. Ready to convert.");
    }
  }, [ensureProcessedInput, manualOrderEnabled, outputPath, state]);

  const handleMoveMarkdown = useCallback((index: number, delta: number) => {
    setOrderedMarkdown((current) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const copy = [...current];
      const [removed] = copy.splice(index, 1);
      if (!removed) {
        return current;
      }
      copy.splice(nextIndex, 0, removed);
      return copy;
    });
  }, []);


  const handleMarkdownKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, index: number) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        handleMoveMarkdown(index, -1);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        handleMoveMarkdown(index, 1);
      }
    },
    [handleMoveMarkdown]
  );

  const handleResetOrder = useCallback(() => {
    if (processedInput) {
      setOrderedMarkdown(processedInput.markdown_files);
    }
  }, [processedInput]);

  const handleConvert = useCallback(async () => {
    if (items.length === 0) {
      setState("error");
      setMessage("Add at least one markdown file, directory, or zip.");
      return;
    }

    setState("processing");
    setMessage("Scanning files, resolving images, and composing PDF.");

    try {
      const processed = await ensureProcessedInput();
      const input = manualOrderEnabled && orderedMarkdown.length > 0
        ? { ...processed, markdown_files: orderedMarkdown }
        : processed;

      const result = await callTauri<ConvertResult>("convert_to_pdf", { input });

      setOutputPath(result.output_path);
      setState("success");
      setMessage("PDF exported successfully.");
    } catch (error) {
      const detail = getErrorMessage(error);
      setState("error");
      setMessage(detail);
    }
  }, [ensureProcessedInput, items.length, manualOrderEnabled, orderedMarkdown]);

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      {isBooting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950">
          <div className="flex flex-col items-center gap-4">
            <img src={appIcon} alt="Markdown to PDF" className="h-16 w-16 animate-pulse" />
            <p className="text-[11px] uppercase tracking-[0.4em] text-ink-200">
              Loading
            </p>
          </div>
        </div>
      ) : null}
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-14">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="float-in">
            <div className="mb-5 flex items-center gap-3">
              <img
                src={appIcon}
                alt="Markdown to PDF app icon"
                className="h-11 w-11 rounded-2xl border border-ink-800/60 bg-ink-950/60 p-1"
              />
              <span className="text-xs uppercase tracking-[0.35em] text-ink-300">
                Markdown to PDF
              </span>
            </div>
            <h1 className="font-display text-4xl leading-tight text-ink-100 md:text-5xl">
              Markdown to PDF, engineered for messy project folders.
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-ink-200">
              Drop a folder, markdown file, or zip. The pipeline resolves linked markdown
              and images, then exports a single PDF.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-full border border-ink-700/70 bg-ink-900/70 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-100 transition hover:border-ink-400/70 hover:text-ink-50"
              onClick={handleBrowseFiles}
              disabled={state === "processing"}
            >
              Select File
            </button>
            <button
              type="button"
              className="rounded-full border border-ink-700/70 bg-ink-900/70 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-100 transition hover:border-ink-400/70 hover:text-ink-50"
              onClick={handleBrowseFolder}
              disabled={state === "processing"}
            >
              Select Folder
            </button>
          </div>
        </header>

        <section className="float-in" style={{ animationDelay: "120ms" }}>
          <DropZone
            disabled={state === "processing"}
            onItems={handleDropItems}
            onError={handleDropError}
            onBrowseFiles={handleBrowseFiles}
            onBrowseFolder={handleBrowseFolder}
          />
        </section>

        <section
          className="float-in grid gap-6 rounded-3xl border border-ink-800/80 bg-ink-900/70 p-6 md:grid-cols-[1.2fr_0.8fr]"
          style={{ animationDelay: "220ms" }}
        >
          <div className="space-y-4">
            <div className={
              [
                "inline-flex items-center gap-3 rounded-full border px-4 py-2 text-xs uppercase tracking-[0.3em]",
                statusTone,
              ].join(" ")
            }>
              <span className="h-2 w-2 rounded-full bg-current" />
              {STATUS_LABELS[state]}
            </div>
            <p className="text-sm text-ink-200">{message}</p>
            {outputPath ? (
              <div className="rounded-2xl border border-ink-700/60 bg-ink-950/60 p-4 text-xs text-ink-200">
                <p className="mb-2 uppercase tracking-[0.2em] text-ink-200">Output</p>
                <p className="break-all text-ink-100">{outputPath}</p>
              </div>
            ) : null}
          </div>
          <div className="flex h-full flex-col justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-ink-200">Queued Items</p>
              <div className="mt-4 space-y-2 text-sm text-ink-100">
                {items.length === 0 ? (
                  <p className="text-ink-200">No files loaded yet.</p>
                ) : (
                  items.map((item) => (
                    <div
                      key={`${item.path}-${item.name}`}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-ink-800/70 bg-ink-950/70 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-100">{item.name}</p>
                        <p className="text-[11px] uppercase tracking-[0.25em] text-ink-200">
                          {item.kind}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-ink-800/70 bg-ink-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-ink-200">
                    Manual Order
                  </p>
                  <p className="mt-2 text-sm text-ink-200">
                    Use arrow keys on a focused item to reorder.
                  </p>
                </div>
                <button
                  type="button"
                  className={[
                    "rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] transition",
                    manualOrderEnabled
                      ? "border border-ink-600 bg-ink-900 text-ink-100 hover:border-ink-400"
                      : "bg-ink-100 text-ink-950 hover:bg-ink-50",
                  ].join(" ")}
                  onClick={handleManualOrderToggle}
                  disabled={state === "processing" || items.length === 0}
                >
                  {manualOrderEnabled ? "Disable" : "Enable"}
                </button>
              </div>
              {manualOrderEnabled ? (
                <div className="mt-4 space-y-2 text-sm text-ink-100">
                  {orderedMarkdown.length === 0 ? (
                    <p className="text-ink-200">No markdown files detected.</p>
                  ) : (
                    orderedMarkdown.map((path, index) => {
                      const name = path.split(/[/\\\\]/).pop() ?? path;
                      const isFirst = index === 0;
                      const isLast = index === orderedMarkdown.length - 1;
                      return (
                        <div
                          key={path}
                          className="group flex items-center justify-between gap-3 rounded-2xl border border-ink-800/70 bg-ink-950/70 px-3 py-2 transition focus-visible:border-ink-400 focus-visible:shadow-[0_0_0_1px_rgba(148,163,184,0.35)] focus-visible:outline-none"
                          onKeyDown={(event) => handleMarkdownKeyDown(event, index)}
                          tabIndex={0}
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-3 w-full">
                            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-ink-800/70 bg-ink-900/70 text-[10px] uppercase tracking-[0.2em] text-ink-300">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-ink-100" title={name}>
                                {name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-ink-700 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-ink-200 transition hover:border-ink-400 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => handleMoveMarkdown(index, -1)}
                              disabled={isFirst || state === "processing"}
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-ink-700 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-ink-200 transition hover:border-ink-400 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => handleMoveMarkdown(index, 1)}
                              disabled={isLast || state === "processing"}
                            >
                              Down
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-ink-300">
                      {orderedMarkdown.length} markdown files
                    </p>
                    <button
                      type="button"
                      className="text-[11px] uppercase tracking-[0.2em] text-ink-200 transition hover:text-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={handleResetOrder}
                      disabled={state === "processing" || !processedInput}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-full bg-signal-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-ink-950 transition hover:bg-signal-400 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleConvert}
              disabled={state === "processing"}
            >
              Convert to PDF
            </button>
          </div>
        </section>

        <section
          className="float-in grid gap-4 rounded-3xl border border-ink-800/70 bg-ink-950/60 p-6 text-xs text-ink-200 md:grid-cols-3"
          style={{ animationDelay: "320ms" }}
        >
          <div>
            <p className="uppercase tracking-[0.3em] text-ink-200">Pipeline</p>
            <p className="mt-3">Scan inputs and follow linked markdown references.</p>
          </div>
          <div>
            <p className="uppercase tracking-[0.3em] text-ink-200">Images</p>
            <p className="mt-3">Embed linked images with safe relative path resolution.</p>
          </div>
          <div>
            <p className="uppercase tracking-[0.3em] text-ink-200">Output</p>
            <p className="mt-3">Generate a single PDF with consistent formatting.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
