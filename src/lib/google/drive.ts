// Google Drive API Client for Call Recordings
// Fetches audio recordings from user's Google Drive folder

import { google } from 'googleapis'
import type { DriveFile } from '@/types/ai.types'

// Scopes needed for Drive access
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
]

// Create Drive client with OAuth credentials
export function getDriveClient(accessToken: string, refreshToken?: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  return google.drive({ version: 'v3', auth: oauth2Client })
}

// Search for a folder by name (does NOT create)
export async function findFolderByName(
  accessToken: string,
  refreshToken?: string,
  folderName: string
): Promise<{ id: string; name: string } | null> {
  const drive = getDriveClient(accessToken, refreshToken)

  // Escape single quotes in folder name
  const escapedName = folderName.replace(/'/g, "\\'")

  // Search for existing folder
  const searchResponse = await drive.files.list({
    q: `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  })

  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    const folder = searchResponse.data.files[0]
    return { id: folder.id!, name: folder.name! }
  }

  return null
}

// Find or create the recordings folder (legacy - kept for backwards compatibility)
export async function getOrCreateRecordingsFolder(
  accessToken: string,
  refreshToken?: string,
  folderName: string = 'BharatCRM_Recordings'
): Promise<{ id: string; name: string }> {
  const found = await findFolderByName(accessToken, refreshToken, folderName)
  if (found) {
    return found
  }

  // Create new folder if not exists
  const drive = getDriveClient(accessToken, refreshToken)
  const createResponse = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id, name',
  })

  return {
    id: createResponse.data.id!,
    name: createResponse.data.name!,
  }
}

// List audio files in the recordings folder
// Supports: mp3, m4a, wav, ogg, mpeg, 3gp, amr, aac, flac, wma
export async function listRecordingFiles(
  accessToken: string,
  refreshToken: string | undefined,
  folderId: string,
  sinceDate?: Date
): Promise<DriveFile[]> {
  const drive = getDriveClient(accessToken, refreshToken)

  // Build query for all audio/video files (recording apps save in various formats)
  // MPEG files can be audio/mpeg, video/mpeg, or have .mpeg/.mpg extension
  let query = `'${folderId}' in parents and trashed=false and (`
  
  // Mime type checks for audio
  query += `mimeType contains 'audio/' `
  query += `or mimeType contains 'video/' `  // Many call recorders save as video
  
  // File extension checks (backup for when mime type is wrong)
  const audioExtensions = ['mp3', 'm4a', 'wav', 'ogg', 'mpeg', 'mpg', '3gp', 'amr', 'aac', 'flac', 'wma', 'opus', 'webm']
  audioExtensions.forEach(ext => {
    query += `or name contains '.${ext}' `
  })
  
  query += `)`
  
  if (sinceDate) {
    query += ` and modifiedTime > '${sinceDate.toISOString()}'`
  }

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)',
    orderBy: 'createdTime desc',
    pageSize: 100,
  })

  return (response.data.files || []).map(file => ({
    id: file.id!,
    name: file.name!,
    mimeType: file.mimeType!,
    size: file.size || '0',
    createdTime: file.createdTime!,
    modifiedTime: file.modifiedTime!,
    webViewLink: file.webViewLink || undefined,
    webContentLink: file.webContentLink || undefined,
  }))
}

// Get download URL for a file
export async function getFileDownloadUrl(
  accessToken: string,
  refreshToken: string | undefined,
  fileId: string
): Promise<string> {
  const drive = getDriveClient(accessToken, refreshToken)

  // Get the file metadata with webContentLink
  const response = await drive.files.get({
    fileId,
    fields: 'webContentLink',
  })

  if (response.data.webContentLink) {
    return response.data.webContentLink
  }

  // If no direct download link, generate one
  // This URL format allows downloading with the access token
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
}

// Download file content as buffer
export async function downloadFile(
  accessToken: string,
  refreshToken: string | undefined,
  fileId: string
): Promise<Buffer> {
  const drive = getDriveClient(accessToken, refreshToken)

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )

  return Buffer.from(response.data as ArrayBuffer)
}

// Extract phone number from filename
// Common formats: "Call_+919876543210_2024-01-15.mp3", "9876543210.m4a", etc.
export function extractPhoneFromFilename(filename: string): string | null {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
  
  // Common patterns for phone numbers in filenames
  const patterns = [
    // International format: +919876543210 or +91-9876543210
    /\+?\d{1,3}[-\s]?\d{10}/,
    // Indian 10-digit: 9876543210
    /\b[6-9]\d{9}\b/,
    // With country code separated: 91_9876543210
    /\b91[_-]?[6-9]\d{9}\b/,
    // General international: any 10-15 digit number
    /\b\d{10,15}\b/,
  ]

  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern)
    if (match) {
      // Clean the phone number - remove non-digits except leading +
      let phone = match[0].replace(/[-\s_]/g, '')
      
      // Normalize Indian numbers
      if (phone.length === 10 && /^[6-9]/.test(phone)) {
        phone = '+91' + phone
      } else if (phone.length === 12 && phone.startsWith('91')) {
        phone = '+' + phone
      } else if (!phone.startsWith('+') && phone.length > 10) {
        phone = '+' + phone
      }
      
      return phone
    }
  }

  return null
}

// Extract date from filename or use file creation date
export function extractDateFromFilename(filename: string, fallbackDate: string): Date {
  // Common date patterns in filenames
  const patterns = [
    // 2024-01-15 or 2024_01_15
    /(\d{4})[-_](\d{2})[-_](\d{2})/,
    // 15-01-2024 or 15_01_2024
    /(\d{2})[-_](\d{2})[-_](\d{4})/,
    // 20240115
    /(\d{4})(\d{2})(\d{2})/,
  ]

  for (const pattern of patterns) {
    const match = filename.match(pattern)
    if (match) {
      // Determine if year is first or last
      const isYearFirst = match[1].length === 4
      const year = isYearFirst ? match[1] : match[3]
      const month = isYearFirst ? match[2] : match[2]
      const day = isYearFirst ? match[3] : match[1]
      
      const date = new Date(`${year}-${month}-${day}`)
      if (!isNaN(date.getTime())) {
        return date
      }
    }
  }

  // Fallback to file creation date
  return new Date(fallbackDate)
}

// Check if we have Drive access
export async function checkDriveAccess(
  accessToken: string,
  refreshToken?: string
): Promise<boolean> {
  try {
    const drive = getDriveClient(accessToken, refreshToken)
    await drive.about.get({ fields: 'user' })
    return true
  } catch {
    return false
  }
}


