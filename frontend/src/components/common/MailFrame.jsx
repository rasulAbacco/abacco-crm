// Shows an email's HTML safely (sandboxed: no scripts, no forms, links don't navigate the app).
export default function MailFrame({
  html,
  title = "Email",
  height = 420,
  className = "",
}) {
  return (
    <iframe
      title={title}
      sandbox=""
      srcDoc={html}
      className={`w-full bg-white ${className}`}
      style={{ height, border: 0 }}
    />
  );
}
