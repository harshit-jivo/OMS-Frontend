import { HiExclamationTriangle } from "react-icons/hi2";

type Props = {
  /** The message to show. Falsy = the popup is not rendered. */
  message?: string;
  onClose: () => void;
  title?: string;
};

/** A small centered popup for surfacing an error, instead of an inline banner. */
export default function ErrorPopup({ message, onClose, title = "Something went wrong" }: Props) {
  if (!message) return null;
  return (
    <div className="hais-error-overlay" onClick={onClose}>
      <div className="hais-error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hais-error-icon">
          <HiExclamationTriangle />
        </div>
        <h3>{title}</h3>
        <p>{message}</p>
        <button className="ofs-primary" onClick={onClose} autoFocus>
          OK
        </button>
      </div>
    </div>
  );
}
