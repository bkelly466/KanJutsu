import { useEffect } from 'react';
import { useBackButton } from '../hooks/useBackButton';

/**
 * Shared modal shell.
 *
 * The app previously had four hand-rolled copies of the same Bootstrap markup
 * (`modal d-block` + an inline rgba backdrop). None of them used Bootstrap's
 * JavaScript Modal, so none of them locked body scroll — on iOS the page
 * visibly scrolled *behind* an open modal, which reads as broken.
 *
 * This component owns the shell and the behaviour; callers supply only the
 * contents of `.modal-content` (their own header/body/footer).
 *
 * Props:
 *   onClose          - called to dismiss the modal (backdrop tap, Escape)
 *   size             - 'sm' | 'lg', matching Bootstrap's modal-sm / modal-lg.
 *                      Omit for the default width.
 *   scrollable       - true to add modal-dialog-scrollable (long content keeps
 *                      the header/footer fixed and scrolls the body)
 *   closeOnBackdrop  - defaults to true. Pass false for destructive confirms,
 *                      where an accidental tap outside shouldn't dismiss.
 *   children         - rendered inside .modal-content
 */
export default function Modal({
  onClose,
  size,
  scrollable = false,
  closeOnBackdrop = true,
  children,
}) {
  // The device Back button closes the modal rather than leaving the app.
  // Every modal in the app routes through this component, so wiring it here
  // covers all of them. `true` because the component only exists while open.
  useBackButton(true, onClose);

  // Lock scrolling on the page behind the modal.
  //
  // Bootstrap's JS normally does this; we're not using it, so we do it by hand.
  // The cleanup restores whatever `overflow` was set before, so we don't clobber
  // a value someone else set. Only one modal is ever open at a time in this app
  // (AddToDeckModal *replaces* itself with CreateDeckModal rather than nesting),
  // so a simple save/restore is enough — no need for a lock counter.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Escape closes the modal — standard dialog behaviour, and it costs nothing
  // to support even though the main target here is touch.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Build the dialog classes.
  //
  // `modal-fullscreen-sm-down` is the mobile win: below Bootstrap's sm
  // breakpoint (576px) the dialog fills the screen edge-to-edge and its body
  // scrolls on its own; at larger widths it stays the centred dialog it is
  // today. That also stops tall forms (CreateDeckModal) overflowing a phone.
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
