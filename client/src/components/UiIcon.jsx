const paths = {
  add: <path d="M12 5v14M5 12h14" />,
  arrowBack: <path d="M19 12H5M12 19l-7-7 7-7" />,
  camera: <path d="M4 8h11a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H4V8Zm14 3 4-2v9l-4-2" />,
  check: <path d="m5 13 4 4L19 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  delete: <path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 13h8l1-13" />,
  edit: <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />,
  grid: <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />,
  inventory: <path d="M4 7 12 3l8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10" />,
  memory: <path d="M8 8h8v8H8V8Zm-3 2H3m2 4H3m18-4h-2m2 4h-2M10 5V3m4 2V3m-4 18v-2m4 2v-2" />,
  search: <path d="m20 20-4.5-4.5M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
  smart: <path d="M9 7V4m6 3V4M7 10h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Zm3 4h.01M14 14h.01M9 17h6" />,
  warning: <path d="M12 4 3 20h18L12 4Zm0 5v5m0 3h.01" />,
};

export default function UiIcon({ name, className = '', size = 20 }) {
  return (
    <svg
      className={`ui-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name] || paths.camera}
    </svg>
  );
}
