import type { PropsWithChildren } from 'react'

type GlassProps = PropsWithChildren<{
  className?: string
  as?: 'section' | 'aside' | 'header' | 'div'
}>

export function Glass({ children, className = '', as: Tag = 'section' }: GlassProps) {
  return <Tag className={`glass ${className}`}>{children}</Tag>
}

export function DotMark() {
  return (
    <span className="dot-mark" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
    </span>
  )
}
