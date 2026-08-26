// Redirects to the first project once the database exists (milestone 2).
export default function Home() {
  return (
    <div className="flex h-screen items-center justify-center bg-mf-surface-1">
      <div className="mf-panel w-80">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Mission First</span>
        </div>
        <div className="p-4 text-mf-text-2">
          No projects yet. The demo project is created by the database seed
          (milestone 2).
        </div>
      </div>
    </div>
  );
}
