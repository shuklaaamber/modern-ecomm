export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="space-y-2">
          <div className="skeleton aspect-[4/5] w-full" />
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
