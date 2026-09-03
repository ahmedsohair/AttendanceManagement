"use client";

import { useRef } from "react";

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
  confirmationFieldName?: string;
  confirmationText?: string;
  message: string;
};

export function ConfirmSubmitButton({
  children,
  className,
  confirmationFieldName = "confirmationName",
  confirmationText,
  message
}: ConfirmSubmitButtonProps) {
  const confirmationInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {confirmationText ? (
        <input ref={confirmationInputRef} name={confirmationFieldName} type="hidden" />
      ) : null}
      <button
        className={className}
        type="submit"
        onClick={(event) => {
          if (confirmationText) {
            const entered = window.prompt(`${message}\n\nType "${confirmationText}" to confirm.`);
            if (entered !== confirmationText) {
              event.preventDefault();
              return;
            }
            if (confirmationInputRef.current) confirmationInputRef.current.value = entered;
            return;
          }
          if (!window.confirm(message)) event.preventDefault();
        }}
      >
        {children}
      </button>
    </>
  );
}
