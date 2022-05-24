import { get, set } from 'idb-keyval'
import { useRef } from 'react'
import { getReactFiber } from './react-source'

export async function fsGetSourceForElement(
  element: HTMLElement,
  requestDirHandle: () => Promise<FileSystemDirectoryHandle | null>,
) {
  const fiber = getReactFiber(element)
  if (!fiber) {
    return null
  }

  const source = fiber._debugSource

  const dirHandle = await requestDirHandle()
  if (!dirHandle) {
    return null
  }

  const contents = await fsGetFileContents(dirHandle, source.fileName)
  if (!contents) {
    return null
  }

  return {
    ...contents,
    fiberSource: source,
  }
}

export async function fsGetFileContents(
  dirHandle: FileSystemDirectoryHandle,
  path: string,
) {
  const rootPath = await detectRootPath(dirHandle, path)

  if (!rootPath) {
    return
  }

  const relativePath = path.replace(rootPath, '')
  const fileHandle = await fsGetFile(dirHandle, relativePath)

  if (!fileHandle) {
    return
  }

  const text = await fileToText(await fileHandle.getFile())

  return { text, fileHandle }
}

export async function fsGetFile(
  dirHandle: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle | null> {
  const pathChunks = path.split('/')
  const [first, ...rest] = pathChunks

  // if path starts with /, ignore it
  if (first === '') {
    return fsGetFile(dirHandle, rest.join('/'))
  }

  if (pathChunks.length === 1) {
    return dirHandle.getFileHandle(first).catch(() => null)
  }

  const dir = await dirHandle.getDirectoryHandle(first).catch(() => null)

  if (!dir) {
    return null
  }

  return fsGetFile(dir, rest.join('/'))
}

export async function fsWriteToFile(
  fileHandle: FileSystemFileHandle,
  data: string,
): Promise<void> {
  await fileHandle.requestPermission({ mode: 'readwrite' })
  const writeStream = await fileHandle.createWritable()
  await writeStream.write(data)
  await writeStream.close()
}

export async function detectRootPath(
  dirHandle: FileSystemDirectoryHandle,
  fullPath: string,
) {
  const pathChunks = fullPath.split('/')

  const variants = pathChunks.map((_pathChunk, idx) => {
    return pathChunks.slice(idx, pathChunks.length).join('/')
  })

  const variantFiles = await Promise.all(
    variants.map(async (variant) => {
      return [variant, await fsGetFile(dirHandle, variant)] as const
    }),
  )

  const validVariantFiles = variantFiles.filter(([, file]) => file !== null)

  if (validVariantFiles.length === 0) {
    return null
  }

  if (validVariantFiles.length > 1) {
    console.warn(
      `Multiple root paths found: ${validVariantFiles
        .map(([variant]) => variant)
        .join('\n')}`,
    )
    return null
  }

  const [validPath] = validVariantFiles[0]

  return fullPath.replace(validPath, '')
}

export function fileToText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    // eslint-disable-next-line immutable/no-mutation
    reader.onload = (e) => {
      resolve(e.target!.result! as string)
    }
    reader.readAsText(file)
  })
}

export function useDirHandle() {
  const dirHandlerRef = useRef<FileSystemDirectoryHandle | null>(null)

  const getDirHandle = async () => {
    const dirHandler = await (async () => {
      const handlerFromRef = dirHandlerRef.current

      if (handlerFromRef) {
        return handlerFromRef
      }

      const handlerFromIdb = (await get(
        'dirHandler',
      )) as FileSystemDirectoryHandle

      if (handlerFromIdb) {
        return handlerFromIdb
      }

      const dirHandler = await window.showDirectoryPicker()
      dirHandlerRef.current = dirHandler
      await set('dirHandler', dirHandler)
      return dirHandler
    })()

    if (
      (await dirHandler.queryPermission({ mode: 'readwrite' })) !== 'granted'
    ) {
      await dirHandler.requestPermission({ mode: 'readwrite' })
      await set('dirHandler', dirHandler)
    }

    return dirHandler
  }

  return { getDirHandle }
}
