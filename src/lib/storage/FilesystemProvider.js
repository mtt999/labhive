// iCloud (iOS) / local Documents (Android) via @capacitor/filesystem
// Files are stored in the app's Documents directory which syncs to iCloud on iOS.

const DIR = 'DOCUMENTS'

function getFilesystem() {
  return import('@capacitor/filesystem').then(m => ({ Filesystem: m.Filesystem, Directory: m.Directory }))
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export class FilesystemProvider {
  async upload(_bucket, path, file) {
    const { Filesystem, Directory } = await getFilesystem()
    const base64 = await fileToBase64(file)
    const fsPath = `iLab/${path}`
    await Filesystem.writeFile({ path: fsPath, data: base64, directory: Directory[DIR], recursive: true })
    const { uri } = await Filesystem.getUri({ path: fsPath, directory: Directory[DIR] })
    const ref = `ext:filesystem:${fsPath}`
    return { url: ref, ref }
  }

  async resolveUrl(ref) {
    try {
      const fsPath = ref.replace('ext:filesystem:', '')
      const { Filesystem, Directory } = await getFilesystem()
      const { data } = await Filesystem.readFile({ path: fsPath, directory: Directory[DIR] })
      const base64 = typeof data === 'string' ? data : await data.text()
      return `data:application/octet-stream;base64,${base64}`
    } catch { return null }
  }

  async remove(_bucket, ref) {
    try {
      const fsPath = ref.replace('ext:filesystem:', '')
      const { Filesystem, Directory } = await getFilesystem()
      await Filesystem.deleteFile({ path: fsPath, directory: Directory[DIR] })
    } catch {}
  }

  isConnected() { return true }
}
