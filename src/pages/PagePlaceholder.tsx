export default function PagePlaceholder({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel h-[480px] grid place-items-center">
      <div className="text-center">
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted mt-1">Coming soon</p>
      </div>
    </div>
  )
}