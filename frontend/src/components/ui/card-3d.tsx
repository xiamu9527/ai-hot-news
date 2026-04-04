import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function Card3D({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [transform, setTransform] = useState('perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)')

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const node = ref.current
    if (!node) return

    const rect = node.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const rotateX = ((y - rect.height / 2) / rect.height) * -12
    const rotateY = ((x - rect.width / 2) / rect.width) * 14

    setTransform(`perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.01, 1.01, 1.01)`)
  }

  const reset = () => {
    setTransform('perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)')
  }

  return (
    <div className="[perspective:1200px]">
      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={reset}
        onBlur={reset}
        className={cn('transform-gpu transition-transform duration-200 ease-out will-change-transform', className)}
        style={{ transform, transformStyle: 'preserve-3d' }}
      >
        {children}
      </div>
    </div>
  )
}