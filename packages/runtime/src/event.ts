import { useEffect, useRef } from 'react'
import { Observable, Subject } from 'rxjs'

export function useSubject<T>() {
  const subjectRef = useRef<Subject<T>>()
  if (!subjectRef.current) {
    subjectRef.current = new Subject<T>()
  }

  useEffect(() => {
    return () => {
      subjectRef.current?.complete()
      subjectRef.current = undefined
    }
  }, [])

  return subjectRef.current!
}

export function useObservable<T>(observable: Observable<T>, fn: (value: T) => void) {
  useEffect(() => {
    const sub = observable.subscribe(fn)
    return () => sub.unsubscribe()
  }, [observable])
}
