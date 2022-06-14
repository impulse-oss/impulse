import { PropsWithChildren } from 'react'

export function RedText(props: PropsWithChildren<{}>) {
  return <span className="text-red-500">{props.children}</span>
}
