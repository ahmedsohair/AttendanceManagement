type IconProps = {
  className?: string;
};

function SvgIcon({
  children,
  className
}: IconProps & {
  children: React.ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className || "action-svg"}
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      {children}
    </svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="8" cy="12" r="3.25" stroke="currentColor" strokeWidth="2" />
      <path d="M11.25 12H21M17 12V15M14.5 12V14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </SvgIcon>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 20H8L19 9L15 5L4 16V20Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="M13.5 6.5L17.5 10.5" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 7H19" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M9 7V5H15V7" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="M8 10V19H16V10" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
    </SvgIcon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 4V15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M5 20H19" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </SvgIcon>
  );
}

export function PublishIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 20V6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M7 11L12 6L17 11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M5 20H19" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </SvgIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M7 7L17 17M17 7L7 17" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </SvgIcon>
  );
}
