/**
 * Choose one or more supporting documents for a credit limit submission.
 *
 * Each pick ADDS to the list — a native `multiple` input replaces its whole
 * selection on every pick, which loses files chosen from another folder. The
 * input is cleared after each pick so the same file can be re-added once
 * removed. A file already in the list (same name and size) is not added twice.
 */
import { useRef } from "react";
import { HiOutlinePaperClip, HiXMark } from "react-icons/hi2";

import { Button } from "../../components/ui/button";
import { Field, Input } from "../../components/ui/form";

/** Matches `MAX_ATTACHMENTS` in `credit_limit/services/flow.py`. */
export const MAX_ATTACHMENTS = 10;

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPicker({
  files,
  onChange,
  required = false,
  label = "Supporting documents",
  hint,
  span,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  required?: boolean;
  label?: string;
  hint?: React.ReactNode;
  span?: "full";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = files.length >= MAX_ATTACHMENTS;

  const add = (picked: FileList | null) => {
    const next = [...files];
    for (const file of Array.from(picked ?? [])) {
      if (next.length >= MAX_ATTACHMENTS) break;
      if (!next.some((f) => sameFile(f, file))) next.push(file);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Field
      label={label}
      required={required}
      span={span}
      hint={full ? `At most ${MAX_ATTACHMENTS} documents.` : hint}
    >
      {(c) => (
        <div className="min-w-0 space-y-2">
          <Input
            {...c}
            ref={inputRef}
            type="file"
            multiple
            disabled={full}
            className="py-1.5"
            onChange={(e) => add(e.target.files)}
          />
          {files.length > 0 && (
            <ul aria-label="Chosen documents" className="m-0 list-none space-y-1 p-0">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}`}
                  className="flex min-w-0 items-center gap-2 text-[12.5px]"
                >
                  <HiOutlinePaperClip aria-hidden className="shrink-0 text-subtle" />
                  <span className="min-w-0 truncate text-ink">{file.name}</span>
                  <span className="shrink-0 text-subtle">{formatSize(file.size)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => onChange(files.filter((_, i) => i !== index))}
                  >
                    <HiXMark aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}
