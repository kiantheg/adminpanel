"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { buildPageWindow } from "@/lib/admin-ui";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="pageHeader">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="supporting">{description}</p>}
      </div>
      {actions && <div className="headerActions">{actions}</div>}
    </header>
  );
}

export function StatusBanner({
  kind,
  message,
  onDismiss,
}: {
  kind: "error" | "success";
  message: string | null;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      key={`${kind}-${message}`}
      className={kind === "error" ? "statusToast statusToastError" : "statusToast statusToastSuccess"}
      role={kind === "error" ? "alert" : "status"}
      aria-live="polite"
      onAnimationEnd={() => onDismiss?.()}
    >
      {message}
    </div>,
    document.body,
  );
}

export function Pagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = buildPageWindow(current, total);

  return (
    <div className="pagination">
      <button type="button" className="secondaryButton" onClick={() => onChange(current - 1)} disabled={current <= 1}>
        Prev
      </button>
      <div className="paginationNumbers">
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            className={page === current ? "paginationButton paginationButtonActive" : "paginationButton"}
            onClick={() => onChange(page)}
          >
            {page}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="secondaryButton"
        onClick={() => onChange(current + 1)}
        disabled={current >= total}
      >
        Next
      </button>
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  canDismiss = true,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  canDismiss?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const closeWithAnimation = useCallback(() => {
    if (!canDismiss || isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current();
    }, 160);
  }, [canDismiss, isClosing]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && canDismiss) {
        closeWithAnimation();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [canDismiss, closeWithAnimation]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={isClosing ? "modalOverlay modalOverlayClosing" : "modalOverlay"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && canDismiss) {
          closeWithAnimation();
        }
      }}
    >
      <section className="modalCard" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modalHeader">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="supporting">{subtitle}</p>}
          </div>
          <button type="button" className="secondaryButton" onClick={closeWithAnimation} disabled={!canDismiss}>
            Close
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="emptyStateCard">
      <h2>{title}</h2>
      <p className="supporting">{description}</p>
      {action}
    </div>
  );
}

export function BooleanChoice({
  value,
  onChange,
  trueLabel,
  falseLabel,
  disabled = false,
  compact = false,
}: {
  value: boolean;
  onChange: (nextValue: boolean) => void;
  trueLabel: string;
  falseLabel: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "booleanChoice booleanChoiceCompact" : "booleanChoice"}
      role="group"
      data-state={value ? "true" : "false"}
    >
      <span
        aria-hidden="true"
        className={value ? "booleanChoiceIndicator" : "booleanChoiceIndicator booleanChoiceIndicatorRight"}
      />
      <button
        type="button"
        className={value ? "booleanChoiceButton booleanChoiceButtonActive" : "booleanChoiceButton"}
        data-active={value ? "true" : "false"}
        onClick={() => onChange(true)}
        aria-pressed={value}
        disabled={disabled}
      >
        {trueLabel}
      </button>
      <button
        type="button"
        className={!value ? "booleanChoiceButton booleanChoiceButtonActive" : "booleanChoiceButton"}
        data-active={!value ? "true" : "false"}
        onClick={() => onChange(false)}
        aria-pressed={!value}
        disabled={disabled}
      >
        {falseLabel}
      </button>
    </div>
  );
}
