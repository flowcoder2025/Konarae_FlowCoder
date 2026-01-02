/**
 * 파일 업로드 유틸리티
 * Supabase Storage 연동
 */

import { createClient } from "@/lib/supabase/client";
import { createServerClient } from "@/lib/supabase/server";
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_FILE_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  DocumentType,
} from "./types";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "documents-upload" });

// ============================================
// 파일 검증
// ============================================

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Magic Byte 시그니처 정의
 * 파일의 실제 내용을 검증하여 위변조 방지
 */
const MAGIC_BYTES: Record<string, number[][]> = {
  // PDF: %PDF
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
  // JPEG: FFD8FF
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  // WEBP: RIFF....WEBP
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF (WEBP 확인은 offset 8에서 추가 검증)
};

/**
 * Magic byte 검증
 * 파일의 실제 바이트 시그니처를 확인하여 MIME 타입 위변조 방지
 */
async function validateMagicBytes(file: File): Promise<FileValidationResult> {
  try {
    // 파일의 처음 16바이트 읽기 (대부분의 magic bytes는 8바이트 이내)
    const buffer = await file.slice(0, 16).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const expectedSignatures = MAGIC_BYTES[file.type];
    if (!expectedSignatures) {
      // Magic byte 정의가 없는 MIME 타입은 허용하지 않음
      return {
        valid: false,
        error: `지원되지 않는 파일 형식입니다.`,
      };
    }

    // 시그니처 검증
    const isValidSignature = expectedSignatures.some((signature) => {
      for (let i = 0; i < signature.length; i++) {
        if (bytes[i] !== signature[i]) {
          return false;
        }
      }
      return true;
    });

    if (!isValidSignature) {
      logger.warn("Magic byte mismatch detected", {
        claimedType: file.type,
        fileName: file.name,
        actualBytes: Array.from(bytes.slice(0, 8))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" "),
      });
      return {
        valid: false,
        error: `파일 내용이 확장자와 일치하지 않습니다. 올바른 파일을 업로드해주세요.`,
      };
    }

    // WEBP 추가 검증: offset 8에서 "WEBP" 시그니처 확인
    if (file.type === "image/webp") {
      const webpSignature = [0x57, 0x45, 0x42, 0x50]; // WEBP
      const isWebp = webpSignature.every((b, i) => bytes[8 + i] === b);
      if (!isWebp) {
        return {
          valid: false,
          error: `유효하지 않은 WEBP 파일입니다.`,
        };
      }
    }

    return { valid: true };
  } catch (error) {
    logger.error("Magic byte validation error", { error });
    return {
      valid: false,
      error: `파일 검증 중 오류가 발생했습니다.`,
    };
  }
}

/**
 * 파일 유효성 검증
 * - 파일 타입 (PDF, 이미지만 허용)
 * - 파일 크기 (10MB 이하)
 */
export function validateFile(file: File): FileValidationResult {
  // MIME 타입 검증
  if (!ALLOWED_MIME_TYPES.includes(file.type as any)) {
    return {
      valid: false,
      error: `허용되지 않는 파일 형식입니다. PDF 또는 이미지 파일(JPG, PNG, WEBP)만 업로드 가능합니다.`,
    };
  }

  // 파일 확장자 검증 (이중 검증)
  const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (!ALLOWED_FILE_EXTENSIONS.includes(extension as any)) {
    return {
      valid: false,
      error: `허용되지 않는 파일 확장자입니다. (.pdf, .jpg, .jpeg, .png, .webp만 가능)`,
    };
  }

  // 파일 크기 검증
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `파일 크기가 10MB를 초과합니다. (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  return { valid: true };
}

/**
 * 파일 유효성 검증 (비동기 버전 - Magic byte 포함)
 * - MIME 타입 검증
 * - 파일 확장자 검증
 * - 파일 크기 검증
 * - Magic byte 검증 (파일 내용 실제 확인)
 */
export async function validateFileAsync(file: File): Promise<FileValidationResult> {
  // 기본 검증 (동기)
  const basicValidation = validateFile(file);
  if (!basicValidation.valid) {
    return basicValidation;
  }

  // Magic byte 검증 (비동기)
  const magicByteValidation = await validateMagicBytes(file);
  if (!magicByteValidation.valid) {
    return magicByteValidation;
  }

  return { valid: true };
}

// ============================================
// Supabase Storage 업로드
// ============================================

export interface UploadOptions {
  userId: string;
  companyId: string;
  documentType: DocumentType;
  file: File;
}

export interface UploadResult {
  success: boolean;
  filePath?: string;
  fileUrl?: string;
  error?: string;
}

/**
 * Supabase Storage에 파일 업로드
 * 경로: company-documents/{userId}/{companyId}/{documentType}/{timestamp}_{fileName}
 */
export async function uploadToStorage({
  userId,
  companyId,
  documentType,
  file,
}: UploadOptions): Promise<UploadResult> {
  // 파일 검증 (Magic byte 포함)
  const validation = await validateFileAsync(file);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  try {
    // 서버 사이드에서는 Service Role 키 사용 (RLS 우회)
    const supabase = createServerClient();

    // 파일 경로 생성 (ASCII-safe: 한글 제거, 영문/숫자/하이픈/언더스코어만 허용)
    // 원본 파일명(한글 포함)은 DB에 저장하고, Storage에는 안전한 경로만 사용
    const timestamp = Date.now();
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const randomId = Math.random().toString(36).substring(2, 10);
    const safeFileName = `${timestamp}_${randomId}.${ext}`;
    const filePath = `${userId}/${companyId}/${documentType}/${safeFileName}`;

    // Supabase Storage 업로드
    const { data, error } = await supabase.storage
      .from("company-documents")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false, // 중복 방지
      });

    if (error) {
      logger.error("uploadToStorage Supabase error", { error });
      return {
        success: false,
        error: `파일 업로드 실패: ${error.message}`,
      };
    }

    // Public URL 생성 (Signed URL은 다운로드 시 생성)
    const {
      data: { publicUrl },
    } = supabase.storage.from("company-documents").getPublicUrl(filePath);

    return {
      success: true,
      filePath: data.path,
      fileUrl: publicUrl,
    };
  } catch (error) {
    logger.error("uploadToStorage error", { error });
    return {
      success: false,
      error: "파일 업로드 중 오류가 발생했습니다.",
    };
  }
}

// ============================================
// Signed URL 생성 (다운로드용)
// ============================================

export interface SignedUrlResult {
  success: boolean;
  signedUrl?: string;
  error?: string;
}

/**
 * 파일 다운로드용 Signed URL 생성
 * 만료 시간: 1시간
 */
export async function createSignedUrl(
  filePath: string
): Promise<SignedUrlResult> {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase.storage
      .from("company-documents")
      .createSignedUrl(filePath, 3600); // 1시간

    if (error) {
      logger.error("createSignedUrl Supabase error", { error });
      return {
        success: false,
        error: `Signed URL 생성 실패: ${error.message}`,
      };
    }

    return {
      success: true,
      signedUrl: data.signedUrl,
    };
  } catch (error) {
    logger.error("createSignedUrl error", { error });
    return {
      success: false,
      error: "Signed URL 생성 중 오류가 발생했습니다.",
    };
  }
}

// ============================================
// 파일 삭제
// ============================================

export interface DeleteResult {
  success: boolean;
  error?: string;
}

/**
 * Supabase Storage에서 파일 삭제
 */
export async function deleteFromStorage(
  filePath: string
): Promise<DeleteResult> {
  try {
    const supabase = createServerClient();

    const { error } = await supabase.storage
      .from("company-documents")
      .remove([filePath]);

    if (error) {
      logger.error("deleteFromStorage Supabase error", { error });
      return {
        success: false,
        error: `파일 삭제 실패: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    logger.error("deleteFromStorage error", { error });
    return {
      success: false,
      error: "파일 삭제 중 오류가 발생했습니다.",
    };
  }
}

// ============================================
// 파일 URL → Base64 변환 (Gemini Vision용)
// ============================================

/**
 * 파일 URL에서 Base64 데이터 가져오기
 * Gemini 2.5 Pro Vision API에 전달하기 위함
 */
export async function getFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // "data:image/png;base64,..." 형식에서 base64 부분만 추출
      const base64Data = base64.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Supabase Storage URL → Blob → Base64 변환
 * Node.js 서버 환경에서 사용 (Buffer 사용)
 */
export async function getStorageFileAsBase64(
  filePath: string
): Promise<string | null> {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase.storage
      .from("company-documents")
      .download(filePath);

    if (error || !data) {
      logger.error("getStorageFileAsBase64 download error", { error });
      return null;
    }

    // Blob → Base64 (Node.js Buffer 사용)
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");

    return base64Data;
  } catch (error) {
    logger.error("getStorageFileAsBase64 error", { error });
    return null;
  }
}

/**
 * Supabase Storage Public URL에서 filePath 추출
 * URL 형식: https://xxx.supabase.co/storage/v1/object/public/company-documents/{filePath}
 */
export function extractFilePathFromUrl(fileUrl: string): string | null {
  try {
    const marker = "/storage/v1/object/public/company-documents/";
    const markerIndex = fileUrl.indexOf(marker);

    if (markerIndex === -1) {
      logger.warn("Invalid Supabase storage URL format", { fileUrl });
      return null;
    }

    const filePath = fileUrl.substring(markerIndex + marker.length);
    return decodeURIComponent(filePath);
  } catch (error) {
    logger.error("extractFilePathFromUrl error", { error, fileUrl });
    return null;
  }
}

/**
 * Supabase Storage Public URL → Base64 변환
 * URL에서 filePath를 추출하여 Storage에서 다운로드 후 Base64 변환
 */
export async function getStorageFileAsBase64FromUrl(
  fileUrl: string
): Promise<string | null> {
  const filePath = extractFilePathFromUrl(fileUrl);

  if (!filePath) {
    logger.error("Failed to extract filePath from URL", { fileUrl });
    return null;
  }

  return getStorageFileAsBase64(filePath);
}
