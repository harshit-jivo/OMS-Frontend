import { memo } from "react";
import { getInitials } from "./helpers";

/** Circular initials avatar; full name shown on hover / focus. */
function ApprovalAvatar({ name }: { name: string }) {
  return (
    <span
      className="isec-avatar"
      title={name}
      tabIndex={0}
      role="img"
      aria-label={`Approver: ${name}`}
    >
      {getInitials(name)}
    </span>
  );
}

export default memo(ApprovalAvatar);
