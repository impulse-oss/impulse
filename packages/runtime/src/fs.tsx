import { get, set, del } from 'idb-keyval'
import { useRef, useState } from 'react'
import { warn } from './logger'
import { getReactFiber } from './react-source'
import { AlertModal } from './dialog'
import { useSubject } from './event'
import { firstValueFrom } from 'rxjs'

export async function fsGetSourceForNode(
  element: Node,
  requestDirHandle: (params: { mode: FileSystemPermissionMode }) => Promise<FileSystemDirectoryHandle | null>,
) {
  const cWarn = (...messages: any[]) => warn('fsGetSourceForNode', ...messages)
  const fiber = getReactFiber(element)
  if (!fiber) {
    cWarn('no fiber found')
    return null
  }

  const source = fiber._debugSource
  if (!source) {
    cWarn('_debugSource is empty')
    return null
  }
  const dirHandle = await requestDirHandle({ mode: 'readwrite' })
  if (!dirHandle) {
    cWarn('failed to get FS access')
    return null
  }

  const contents = await fsGetFileContents(dirHandle, source.fileName)
  if (!contents) {
    cWarn('failed to get file contents')
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
  rawPath: string,
): Promise<OpenFile | undefined> {
  const normalizedPath = normalizePath(rawPath)
  const rootPath = await detectRootPath(dirHandle, normalizedPath)

  if (!rootPath) {
    console.log(`Could not find path ${normalizedPath} in the selected directory`)
    return
  }

  const relativePath = normalizedPath.replace(rootPath, '')
  const fileHandle = await fsGetFile(dirHandle, relativePath)

  if (!fileHandle) {
    console.log(`Could not find path ${normalizedPath} (relative path ${relativePath})`)
    return
  }

  const text = await fileToText(await fileHandle.getFile())

  return { text, fileHandle, path: normalizedPath }
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

export async function fsWriteToFile(fileHandle: FileSystemFileHandle, data: string): Promise<void> {
  await fileHandle.requestPermission({ mode: 'readwrite' })
  const writeStream = await fileHandle.createWritable()
  await writeStream.write(data)
  await writeStream.close()
}

async function detectRootPath(dirHandle: FileSystemDirectoryHandle, fullPath: string) {
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
    warn('Could not find the root path')
    return null
  }

  if (validVariantFiles.length > 1) {
    warn(`Multiple root paths found: ${validVariantFiles.map(([variant]) => variant).join('\n')}`)
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
    reader.onload = (e) => {
      resolve(e.target!.result! as string)
    }
    reader.readAsText(file)
  })
}

export function useDirHandle() {
  const dirHandlerRef = useRef<FileSystemDirectoryHandle | null>(null)

  const [alertIsOpen, setAlertIsOpen] = useState(false)
  const alertClosed$ = useSubject<void>()
  const FsAccessWarningAlert = () => (
    <AlertModal
      isOpen={alertIsOpen}
      title="File system access"
      description={[
        `For this feature to work, Impluse needs the access to your code.`,
        `In the following dialog, please select the root folder of your project.`,
        `This is usually the folder that contains your package.json file.`,
      ].join('\n')}
      buttonText="OK"
      onClose={() => {
        setAlertIsOpen(false)
        alertClosed$.next()
      }}
    />
  )

  const getDirHandle = async (params: { mode: FileSystemPermissionMode }) => {
    const dirHandler = await (async () => {
      const handlerFromRef = dirHandlerRef.current

      if (handlerFromRef) {
        return handlerFromRef
      }

      const handlerFromIdb = (await get('dirHandler')) as FileSystemDirectoryHandle

      if (handlerFromIdb) {
        dirHandlerRef.current = handlerFromIdb
        return handlerFromIdb
      }

      setAlertIsOpen(true)
      await firstValueFrom(alertClosed$)
      const dirHandler = await window.showDirectoryPicker()
      dirHandlerRef.current = dirHandler
      await set('dirHandler', dirHandler)
      return dirHandler
    })()

    if ((await dirHandler.queryPermission({ mode: params.mode })) !== 'granted') {
      const newPermissionState = await dirHandler.requestPermission({
        mode: params.mode,
      })

      if (newPermissionState === 'granted') {
        await set('dirHandler', dirHandler)
      } else {
        dirHandlerRef.current = null
        await del('dirHandler')
        warn(`fs: permission denied for ${params.mode}`)
      }
    }

    return dirHandler
  }

  return { getDirHandle, FsAccessWarningAlert, alertIsOpen }
}

export function normalizePath(path: string) {
  const pathUnixDelims = path.replace(/\\/g, '/')

  if (pathUnixDelims.startsWith('/')) {
    return pathUnixDelims
  }

  return `/${pathUnixDelims}`
}
