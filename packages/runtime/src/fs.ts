import { get, set } from 'idb-keyval'
import { useRef } from 'react'
import { warn } from './logger'
import { getReactFiber } from './react-source'

export async function fsGetSourceForNode(
  element: Node,
  requestDirHandle: (params: {
    mode: FileSystemPermissionMode
  }) => Promise<FileSystemDirectoryHandle | null>,
) {
  const fiber = getReactFiber(element)
  if (!fiber) {
    return null
  }

  const source = fiber._debugSource
  if (!source) {
    return null
  }
  const dirHandle = await requestDirHandle({ mode: 'readwrite' })
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

export type OpenFile = {
  path: string
  text: string
  fileHandle: FileSystemFileHandle
}

export async function fsGetFileContents(
  dirHandle: FileSystemDirectoryHandle,
  path: string,
): Promise<OpenFile | undefined> {
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

  return { text, fileHandle, path }
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
  const save = async () => {
    await fileHandle.requestPermission({ mode: 'readwrite' })
    const writeStream = await fileHandle.createWritable()
    await writeStream.write(data)
    await writeStream.close()
  }

  await save()
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
    warn(
      `Multiple root paths found: ${validVariantFiles
        .map(([variant]) => variant)
        .join('\n')}`,
    )
    return null
  }

  const [validPath] = validVariantFiles[0]

  return fullPath.replace(validPath, '')
}

export async function findClosestFile(
  dirHandle: FileSystemDirectoryHandle,
  closestTo: string,
  fileNameCandidates: string[],
): Promise<OpenFile | null> {
  const pathChunks = closestTo.split('/')

  const currentDir = pathChunks.slice(0, -1).join('/')

  for (const fileName of fileNameCandidates) {
    const candidateFullPath = `${currentDir}/${fileName}`
    const file = await fsGetFileContents(dirHandle, candidateFullPath)
    if (file) {
      return file
    }
  }

  if (currentDir === '/') {
    return null
  }

  return findClosestFile(dirHandle, currentDir, fileNameCandidates)

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

  const getDirHandle = async (params: { mode: FileSystemPermissionMode }) => {
    const dirHandler = await (async () => {
      const handlerFromRef = dirHandlerRef.current

      if (handlerFromRef) {
        return handlerFromRef
      }

      const handlerFromIdb = (await get(
        'dirHandler',
      )) as FileSystemDirectoryHandle

      if (handlerFromIdb) {
        dirHandlerRef.current = handlerFromIdb
        return handlerFromIdb
      }

      const dirHandler = await window.showDirectoryPicker()
      dirHandlerRef.current = dirHandler
      await set('dirHandler', dirHandler)
      return dirHandler
    })()

    if (
      (await dirHandler.queryPermission({ mode: params.mode })) !== 'granted'
    ) {
      await dirHandler.requestPermission({ mode: params.mode })
      await set('dirHandler', dirHandler)
    }

    return dirHandler
  }

  return { getDirHandle }
}
