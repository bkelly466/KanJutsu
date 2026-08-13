import { useEffect } from 'react';
import { useBackButton } from '../hooks/useBackButton';

/**
 * Shared modal shell — the Bootstrap markup plus the behaviours Bootstrap's own
 * JavaScript Modal would provide: body-scroll lock, Escape, and device Back.
 * Callers supply only the contents of `.modal-content`.
 *
 * **Never mount two of these at once — swap them.** Each installs its own
 * Escape listener, so one keypress would close both.
 *
 * Known gap: no focus trap, and the page behind is not `aria-hidden`, so a
 * keyboard or screen-reader user can reach the controls underneath.
 *
 * Props:
 *   onClose          - dismiss the modal (backdrop tap, Escape)
 *   size             - 'sm' | 'lg', matching modal-sm / modal-lg. Omit for the
 *                      default width.
 *   scrollable       - adds modal-dialog-scrollable: long content keeps the
 *                      header and footer fixed and scrolls the body
 *   closeOnBackdrop  - defaults to true. False for destructive confirms, where
 *                      an accidental tap outside shouldn't dismiss.
 *   children         - rendered inside .modal-content
 */
export default function Modal({
  onClose,
  size,
  scrollable = false,
  closeOnBackdrop = true,
  children,
}) {
  // Every modal routes through here, so wiring Back once covers all of them.
  // `true` because this component only exists while open.
  useBackButton(true, onClose);

  // Lock scrolling on the page behind. The cleanup restores whatever `overflow`
  // was set before rather than clearing it, so nesting or swapping modals can't
  // leave the page stuck at `hidden`. No lock counter: only one Modal is ever
  // mounted at a time, so save/restore is enough.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Escape closes the modal. Each Modal installs its own listener, which is why
  // two must never be mounted together.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // `modal-fullscreen-sm-down` fills the screen below Bootstrap's sm breakpoint
  // (576px) and stays a centred dialog above it, which is what stops tall forms
  // overflowing a phone.
  const dialogClasses = [
    'modal-dialog',
    'modal-dialog-centered',
    'modal-fullscreen-sm-down',
    size ? `modal-${size}` : '',
    scrollable ? 'modal-dialog-scrollable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      {/* stopPropagation keeps a tap *inside* the dialog from bubbling up to
          the backdrop handler above and closing the modal. */}
      <div className={dialogClasses} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
