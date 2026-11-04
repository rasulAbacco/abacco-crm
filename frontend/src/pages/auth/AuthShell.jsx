export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2"><img src="/favicon.svg" alt="" className="h-9 w-9" /><span className="text-lg font-semibold">Abacco CRM</span></div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mb-5 mt-1 text-sm text-ink-500">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
