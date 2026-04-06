export function TypewriterLoader({ text = 'Анализируем фотографии...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="typewriter">
        <div className="slide"><i></i></div>
        <div className="paper"></div>
        <div className="keyboard"></div>
      </div>
      <p className="text-muted-foreground text-sm">{text}</p>
    </div>
  )
}
