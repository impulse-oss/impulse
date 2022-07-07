import { useEffect, useRef } from "react"
import {Subject} from 'rxjs'

export function useSubject<T>() {
  const subjectRef = useRef<Subject<T>>()
  if (!subjectRef.current) {
    subjectRef.current = new Subject<T>()
  }

  useEffect(() => {
    return () => {
      subjectRef.current!.complete()
      subjectRef.current = undefined
    }
  }, [])

  return subjectRef.current!
}
