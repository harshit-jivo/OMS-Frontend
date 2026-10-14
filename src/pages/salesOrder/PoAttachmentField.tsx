/**
 * Optional customer PO files for the order. Picked files upload once the
 * order saves (see `uploadPendingPoFiles`); when editing, the ones already
 * attached are listed and can be removed.
 */
import { useRef } from "react";
import { HiOutlinePaperClip, HiOutlineXMark } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import type { SalesOrderForm } from "./useSalesOrderForm";

type Props = Pick<
  SalesOrderForm,
  "poFiles" | "existingPoFiles" | "poFileError" | "addPoFiles" | "removePoFile" | "removeExistingPoFile"
>;

function FileChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink">
      <HiOutlinePaperClip aria-hidden="true" className="shrink-0 text-subtle" />
      <span className="truncate">{label}</span>
      <Button variant="ghost" size="icon" aria-label={`Remove ${label}`} onClick={onRemove}>
        <HiOutlineXMark />
      </Button>
    </li>
  );
}

export default function PoAttachmentField({
  poFiles,
  existingPoFiles,
  poFileError,
  addPoFiles,
  removePoFile,
  removeExistingPoFile,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFiles = poFiles.length > 0 || existingPoFiles.length > 0;

  return (
    <Field label="PO attachment" hint="Optional. PDF, JPG or PNG, up to 5 MB each." error={poFileError || undefined}>
      {(control) => (
        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            id={control.id}
            aria-describedby={control["aria-describedby"]}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            className="sr-only"
            onChange={(event) => {
              addPoFiles(event.target.files);
              // Let the same file be picked again after removing it.
              event.target.value = "";
            }}
          />
          <Button className="self-start" onClick={() => inputRef.current?.click()}>
            <HiOutlinePaperClip aria-hidden="true" /> Attach PO
          </Button>
          {hasFiles && (
            <ul className="m-0 list-none space-y-0.5 p-0">
              {existingPoFiles.map((attachment, index) => (
                <FileChip
                  key={attachment.id}
                  label={`PO ${index + 1} (${attachment.file_type.toUpperCase()}, attached)`}
                  onRemove={() => removeExistingPoFile(attachment)}
                />
              ))}
              {poFiles.map((file, index) => (
                <FileChip
                  key={`${file.name}-${index}`}
                  label={file.name}
                  onRemove={() => removePoFile(index)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}
