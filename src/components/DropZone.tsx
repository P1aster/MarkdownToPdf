import { useCallback, useState, type DragEvent } from "react";

export type DropItem = {
  name: string;
  path: string;
  kind: "file" | "directory" | "zip" | "unknown";
};

export type DropZoneProps = {
  disabled?: boolean;
  onItems: (items: DropItem[]) => void;
  onError?: (message: string) => void;
  onBrowseFiles?: () => void;
  onBrowseFolder?: () => void;
};

const classifyItem = (name: string): DropItem["kind"] => {
  if (name.endsWith(".zip")) {
    return "zip";
  }
  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    return "file";
  }
  if (!name.includes(".")) {
    return "directory";
  }
  return "unknown";
};

const readFilePath = (file: File): string | null => {
  const candidate: unknown = Reflect.get(file, "path");
  if (typeof candidate === "string" && candidate.length > 0) {
    return candidate;
  }
  return null;
};

const resolvePath = (file: File): string => readFilePath(file) ?? file.name;

const isAbsolutePath = (value: string): boolean => {
  if (value.startsWith("/")) {
    return true;
  }
  if (value.startsWith("\\\\")) {
    return true;
  }
  return /^[A-Za-z]:[\\/]/.test(value);
};

export default function DropZone({
  disabled,
  onItems,
  onError,
  onBrowseFiles,
  onBrowseFolder,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) {
        return;
      }
      const items: DropItem[] = Array.from(fileList).map((file) => {
        return {
          name: file.name,
          path: resolvePath(file),
          kind: classifyItem(file.name.toLowerCase()),
        };
      });

      const hasAbsolutePath = items.every((item) => isAbsolutePath(item.path));
      if (!hasAbsolutePath) {
        onError?.("File paths are unavailable. Use Browse or drag from Finder inside the Tauri app.");
        return;
      }

      const hasAccepted = items.some((item) => item.kind !== "unknown");

      if (!hasAccepted) {
        onError?.("Drop a markdown file, a directory, or a zip archive.");
        return;
      }

      onItems(items);
    },
    [onItems, onError]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      if (disabled) {
        return;
      }
      handleFiles(event.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  return (
    <div
      className={[
        "relative w-full rounded-3xl border border-ink-800/80 bg-ink-900/70 p-8 transition",
        isDragging ? "border-signal-400 bg-ink-900/90" : "",
        disabled ? "opacity-60" : "hover:border-ink-700",
      ].join(" ")}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-200">drop zone</p>
            <h2 className="mt-3 font-display text-3xl text-ink-100">
              Drag files, directories, or zip archives
            </h2>
          </div>
          <div className="rounded-full border border-ink-700 px-4 py-2 text-xs text-ink-200">
            .md / .markdown / .zip
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-ink-800/60 bg-ink-950/60 p-6">
            <p className="text-sm text-ink-200">
              Keeps linked images intact and bundles nested markdown files into one clean PDF.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-ink-200">
              <span className="rounded-full border border-ink-800 px-3 py-1">Recursive scans</span>
              <span className="rounded-full border border-ink-800 px-3 py-1">Image embedding</span>
              <span className="rounded-full border border-ink-800 px-3 py-1">Single PDF output</span>
            </div>
          </div>
          <div className="relative flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-700/80 bg-ink-900/70 px-6 py-10 text-center transition hover:border-ink-500">
            <span className="text-sm text-ink-200">Or choose a source</span>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                className="rounded-full bg-ink-100 px-4 py-2 text-xs font-semibold text-ink-950 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onBrowseFiles}
                disabled={!onBrowseFiles || disabled}
              >
                Browse Files
              </button>
              <button
                type="button"
                className="rounded-full border border-ink-600 px-4 py-2 text-xs font-semibold text-ink-100 transition hover:border-ink-400 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onBrowseFolder}
                disabled={!onBrowseFolder || disabled}
              >
                Browse Folder
              </button>
            </div>
          </div>
        </div>
      </div>

      {disabled ? (
        <div className="absolute inset-0 rounded-3xl bg-ink-950/40" />
      ) : null}
    </div>
  );
}
