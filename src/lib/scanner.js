import { Capacitor } from '@capacitor/core'

// Returns true when running inside the native iOS/Android app
export const isNative = () => Capacitor.isNativePlatform()

/**
 * Scan a single barcode/QR code using the best available method:
 *  - Native (iOS/Android): MLKit full-screen scanner
 *  - Web: BarcodeDetector API (Chrome/Android browser only)
 *  - Fallback: throws so the caller can show manual entry
 *
 * Resolves with the raw string value of the first code detected,
 * or rejects/throws if the user cancels or no camera is available.
 */
export async function scanBarcode() {
  if (isNative()) {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')

    // Check/request camera permission
    const { camera } = await BarcodeScanner.checkPermissions()
    if (camera === 'denied') {
      throw new Error('Camera permission denied. Enable it in Settings → LabHive.')
    }
    if (camera !== 'granted') {
      const { camera: granted } = await BarcodeScanner.requestPermissions()
      if (granted !== 'granted') throw new Error('Camera permission required to scan.')
    }

    const { barcodes } = await BarcodeScanner.scan({
      formats: ['QR_CODE', 'CODE_128', 'CODE_39', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'DATA_MATRIX'],
    })
    if (!barcodes?.length) throw new Error('No barcode detected.')
    return barcodes[0].rawValue
  }

  // Web fallback — BarcodeDetector (Chrome/Android browser)
  if (!('BarcodeDetector' in window)) {
    throw new Error('UNSUPPORTED')
  }
  throw new Error('UNSUPPORTED') // caller handles web scanning via <video> element
}
