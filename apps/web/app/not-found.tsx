export default function NotFound() {
  return (
    <main className="min-h-screen dot-grid flex items-center justify-center p-6 text-center">
      <div>
        <p className="label">Nothing in this tunnel</p>
        <h1 className="title text-5xl mt-2">That record isn't in the archive</h1>
        <p className="text-dim mt-2">It may belong to another installation, or it may not have happened yet.</p>
        <div className="flex gap-2 justify-center mt-4"><a className="btn btn-gold" href="/">Enter the world</a><a className="btn" href="/archive">2D archive</a></div>
      </div>
    </main>
  );
}
