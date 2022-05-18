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
