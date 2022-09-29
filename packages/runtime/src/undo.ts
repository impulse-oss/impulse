import { fsGetFileContents, fsWriteToFile } from './fs'
import { warn } from './logger'

const undoStorageKey = `impulse:undo:latest`

export async function undoLatestChange(dirHandle: FileSystemDirectoryHandle) {
  const cWarn = (...messanges: any[]) => warn('Undo:', ...messanges)
  const { filePath, textBeforeChange, textAfterChange } = JSON.parse(
    localStorage.getItem(undoStorageKey) ?? '{}',
  )
  if (!filePath || !textBeforeChange || !textAfterChange) {
    cWarn('No undo action available. Undo is only supported for one latest change')
    return
  }

  const file = await fsGetFileContents(dirHandle, filePath)
  if (!file) {
    cWarn('Could not read the file', filePath)
    return
  }

  if (file.text !== textAfterChange) {
    cWarn('The file has been changed since the last undo')
    return
  }

  await fsWriteToFile(file.fileHandle, textBeforeChange)
  localStorage.removeItem(undoStorageKey)

  return {
    type: 'ok',
  }
}

export function undoFileOnChange(filePath: string, textBeforeChange: string, textAfterChange: string) {
  localStorage.setItem(
    undoStorageKey,
    JSON.stringify({
      filePath,
      textBeforeChange,
      textAfterChange,
    }),
  )
}
