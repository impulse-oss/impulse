import { PrimitiveAtom } from 'jotai'
import { useAtomCallback } from 'jotai/utils'
import { useCallback } from 'react'

export function useAtomGetter<T>(atom: PrimitiveAtom<T>) {
  return useAtomCallback(
    useCallback((get) => {
      return get(atom) as T
    }, []),
  ) as () => T
}
