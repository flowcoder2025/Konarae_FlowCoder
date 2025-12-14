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

// ============================================
// 파일 검증
// ============================================

export interface FileValidationResult {
  valid: boolean;
  error?: string;
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
  // 파일 검증
  const validation = validateFile(file);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  try {
    // 서버 사이드에서는 Service Role 키 사용 (RLS 우회)
    const supabase = createServerClient();

    // 파일 경로 생성
    const timestamp = Date.now();
    const fileName = file.name.replace(/[^a-zA-Z0-9가-힣.-]/g, "_"); // 특수문자 제거
    const filePath = `${userId}/${companyId}/${documentType}/${timestamp}_${fileName}`;

    // Supabase Storage 업로드
    const { data, error } = await supabase.storage
      .from("company-documents")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false, // 중복 방지
      });

    if (error) {
      console.error("[uploadToStorage] Supabase error:", error);
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
    console.error("[uploadToStorage] Error:", error);
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
      console.error("[createSignedUrl] Supabase error:", error);
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
    console.error("[createSignedUrl] Error:", error);
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
      console.error("[deleteFromStorage] Supabase error:", error);
      return {
        success: false,
        error: `파일 삭제 실패: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[deleteFromStorage] Error:", error);
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
      console.error("[getStorageFileAsBase64] Download error:", error);
      return null;
    }

    // Blob → Base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(data);
    });
  } catch (error) {
    console.error("[getStorageFileAsBase64] Error:", error);
    return null;
  }
}
