/**
 * Supabase Storage Utility
 * 프로젝트 첨부파일 저장 및 관리
 */

import { createClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "supabase-storage" });

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

// 서비스 키를 사용하여 스토리지 접근 (서버 사이드 전용)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// 버킷 이름
export const BUCKETS = {
  PROJECT_FILES: "project-files",
  BUSINESS_PLAN_FILES: "business-plan-files",
  EVALUATION_FILES: "evaluation-files",
} as const;

// 파일 타입
export type FileType = "hwp" | "hwpx" | "pdf" | "unknown";

// 업로드 결과
export interface UploadResult {
  success: boolean;
  storagePath?: string;
  publicUrl?: string;
  error?: string;
}

// 서명된 URL 결과
export interface SignedUrlResult {
  success: boolean;
  signedUrl?: string;
  error?: string;
}

/**
 * 버킷 초기화 (존재하지 않으면 생성)
 */
export async function ensureBucketExists(
  bucketName: string = BUCKETS.PROJECT_FILES
): Promise<boolean> {
  try {
    const { data: buckets, error: listError } =
      await supabase.storage.listBuckets();

    if (listError) {
      logger.error("버킷 목록 조회 실패", { error: listError });
      return false;
    }

    const exists = buckets?.some((b) => b.name === bucketName);

    if (!exists) {
      const { error: createError } = await supabase.storage.createBucket(
        bucketName,
        {
          public: false, // 비공개 버킷 (서명된 URL로 접근)
          fileSizeLimit: 50 * 1024 * 1024, // 50MB 제한
          allowedMimeTypes: [
            "application/pdf",
            "application/x-hwp",
            "application/haansofthwp",
            "application/vnd.hancom.hwp",
            "application/vnd.hancom.hwpx",
            "application/zip", // HWPX는 ZIP 기반
            // application/octet-stream 제거 - 보안 위험: 모든 바이너리 파일 허용됨
          ],
        }
      );

      if (createError) {
        logger.error("버킷 생성 실패", { error: createError });
        return false;
      }

      logger.info(`버킷 생성됨: ${bucketName}`);
    }

    return true;
  } catch (error) {
    logger.error("버킷 확인 중 오류", { error });
    return false;
  }
}

/**
 * 파일 업로드
 * @param buffer 파일 버퍼
 * @param projectId 프로젝트 ID
 * @param fileName 파일명
 * @param fileType 파일 타입
 */
export async function uploadFile(
  buffer: Buffer,
  projectId: string,
  fileName: string,
  fileType: FileType
): Promise<UploadResult> {
  try {
    // 버킷 확인
    await ensureBucketExists();

    // 스토리지 경로: projects/{projectId}/{timestamp}_{randomId}.{ext}
    // 한글 파일명은 DB에만 저장하고, Storage에는 ASCII-safe 경로 사용
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const ext = fileName.split('.').pop()?.toLowerCase() || fileType;
    const storagePath = `projects/${projectId}/${timestamp}_${randomId}.${ext}`;

    // MIME 타입 결정
    const mimeType = getMimeType(fileType);

    // 업로드
    const { data, error } = await supabase.storage
      .from(BUCKETS.PROJECT_FILES)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      logger.error("파일 업로드 실패", { error });
      return { success: false, error: error.message };
    }

    // 공개 URL 생성 (버킷이 public인 경우)
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKETS.PROJECT_FILES).getPublicUrl(storagePath);

    logger.info(`파일 업로드 성공: ${storagePath}`);

    return {
      success: true,
      storagePath: data.path,
      publicUrl,
    };
  } catch (error) {
    logger.error("파일 업로드 중 오류", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 서명된 URL 생성 (비공개 버킷용)
 * @param storagePath 스토리지 경로
 * @param expiresIn 만료 시간 (초), 기본 5분
 */
export async function getSignedUrl(
  storagePath: string,
  expiresIn: number = 300
): Promise<SignedUrlResult> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKETS.PROJECT_FILES)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      logger.error("서명된 URL 생성 실패", { error });
      return { success: false, error: error.message };
    }

    return {
      success: true,
      signedUrl: data.signedUrl,
    };
  } catch (error) {
    logger.error("서명된 URL 생성 중 오류", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 여러 파일의 서명된 URL 일괄 생성
 */
export async function getSignedUrls(
  storagePaths: string[],
  expiresIn: number = 300
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();

  // 병렬로 URL 생성
  const results = await Promise.all(
    storagePaths.map(async (path) => {
      const result = await getSignedUrl(path, expiresIn);
      return { path, url: result.signedUrl };
    })
  );

  results.forEach(({ path, url }) => {
    if (url) {
      urlMap.set(path, url);
    }
  });

  return urlMap;
}

/**
 * 파일 삭제
 */
export async function deleteFile(storagePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(BUCKETS.PROJECT_FILES)
      .remove([storagePath]);

    if (error) {
      logger.error("파일 삭제 실패", { error });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("파일 삭제 중 오류", { error });
    return false;
  }
}

/**
 * 프로젝트의 모든 파일 삭제
 */
export async function deleteProjectFiles(projectId: string): Promise<boolean> {
  try {
    const folderPath = `projects/${projectId}`;

    // 폴더 내 파일 목록 조회
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKETS.PROJECT_FILES)
      .list(folderPath);

    if (listError) {
      logger.error("파일 목록 조회 실패", { error: listError });
      return false;
    }

    if (!files || files.length === 0) {
      return true; // 삭제할 파일 없음
    }

    // 파일 경로 목록 생성
    const filePaths = files.map((file) => `${folderPath}/${file.name}`);

    // 일괄 삭제
    const { error: deleteError } = await supabase.storage
      .from(BUCKETS.PROJECT_FILES)
      .remove(filePaths);

    if (deleteError) {
      logger.error("파일 삭제 실패", { error: deleteError });
      return false;
    }

    logger.info(`프로젝트 파일 삭제됨: ${projectId} (${filePaths.length}개)`);
    return true;
  } catch (error) {
    logger.error("프로젝트 파일 삭제 중 오류", { error });
    return false;
  }
}

/**
 * 파일 타입에 따른 MIME 타입 반환
 * 보안: unknown 타입은 허용하지 않음
 */
function getMimeType(fileType: FileType): string {
  switch (fileType) {
    case "pdf":
      return "application/pdf";
    case "hwp":
      return "application/x-hwp";
    case "hwpx":
      return "application/vnd.hancom.hwpx";
    case "unknown":
      throw new Error("Unknown file type is not allowed for security reasons");
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * 파일명에서 파일 타입 추출
 */
export function getFileTypeFromName(fileName: string): FileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".hwp")) return "hwp";
  if (lower.endsWith(".hwpx")) return "hwpx";
  return "unknown";
}

// ============================================
// 스마트 파싱 유틸리티
// ============================================

// 파싱 대상 키워드 (공고문, 신청서, 사업계획서 등 핵심 문서)
const PARSE_KEYWORDS = [
  "공고",
  "신청서",
  "사업계획서",
  "지원서",
  "안내",
  "요강",
  "지침",
  "신청양식",
  "제출서류",
  "평가기준",
  "선정기준",
  "모집공고",
  "사업공고",
  "참가신청",
];

// 파싱 제외 키워드 (이미지, 로고 등 비문서 파일)
const SKIP_KEYWORDS = [
  "로고",
  "이미지",
  "배너",
  "썸네일",
  "포스터",
  "사진",
  "photo",
  "image",
  "logo",
  "banner",
  "poster",
];

/**
 * 파일이 파싱 대상인지 판단
 * - 공고, 신청서, 사업계획서 등 핵심 문서만 파싱
 * - 로고, 이미지 등은 제외
 */
export function shouldParseFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();

  // 1. 제외 키워드 체크
  if (SKIP_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return false;
  }

  // 2. 파싱 대상 키워드 체크
  if (PARSE_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return true;
  }

  // 3. 파일 확장자가 문서 형식이면 기본적으로 파싱
  // (키워드가 없어도 HWP/HWPX/PDF는 문서이므로 파싱)
  const docExtensions = [".hwp", ".hwpx", ".pdf"];
  if (docExtensions.some((ext) => lower.endsWith(ext))) {
    return true;
  }

  return false;
}

/**
 * 파일의 파싱 우선순위 반환 (높을수록 먼저 파싱)
 * - 공고문이 가장 높음
 * - 신청서, 사업계획서가 그 다음
 * - 일반 문서가 가장 낮음
 */
export function getParsingPriority(fileName: string): number {
  const lower = fileName.toLowerCase();

  // 우선순위 1: 공고문
  if (
    lower.includes("공고") ||
    lower.includes("모집") ||
    lower.includes("안내")
  ) {
    return 100;
  }

  // 우선순위 2: 신청서/지원서
  if (
    lower.includes("신청서") ||
    lower.includes("지원서") ||
    lower.includes("신청양식")
  ) {
    return 80;
  }

  // 우선순위 3: 사업계획서
  if (lower.includes("사업계획서") || lower.includes("계획서")) {
    return 70;
  }

  // 우선순위 4: 평가/선정 관련
  if (lower.includes("평가") || lower.includes("선정") || lower.includes("기준")) {
    return 60;
  }

  // 우선순위 5: 일반 문서
  return 10;
}

/**
 * 파일 목록을 파싱 우선순위로 정렬
 */
export function sortByParsingPriority<T extends { fileName: string }>(
  files: T[]
): T[] {
  return [...files].sort(
    (a, b) => getParsingPriority(b.fileName) - getParsingPriority(a.fileName)
  );
}

// ============================================
// 평가 파일 업로드 유틸리티
// ============================================

/**
 * 평가용 파일 업로드
 * @param file 파일 객체 (File)
 * @param evaluationId 평가 ID
 * @param userId 사용자 ID
 */
export async function uploadEvaluationFile(
  file: File,
  evaluationId: string,
  userId: string
): Promise<UploadResult> {
  try {
    // 버킷 확인/생성
    await ensureBucketExists(BUCKETS.EVALUATION_FILES);

    // 파일을 Buffer로 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 스토리지 경로: evaluations/{userId}/{evaluationId}/{timestamp}_{randomId}.{ext}
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const storagePath = `evaluations/${userId}/${evaluationId}/${timestamp}_${randomId}.${ext}`;

    // MIME 타입 결정
    const fileType = getFileTypeFromName(file.name);
    const mimeType = getMimeTypeFromFileType(fileType);

    // 업로드
    const { data, error } = await supabase.storage
      .from(BUCKETS.EVALUATION_FILES)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      logger.error("평가 파일 업로드 실패", { error });
      return { success: false, error: error.message };
    }

    logger.info(`평가 파일 업로드 성공: ${storagePath}`);

    return {
      success: true,
      storagePath: data.path,
    };
  } catch (error) {
    logger.error("평가 파일 업로드 중 오류", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 평가 파일의 서명된 URL 생성
 */
export async function getEvaluationFileSignedUrl(
  storagePath: string,
  expiresIn: number = 300
): Promise<SignedUrlResult> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKETS.EVALUATION_FILES)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      logger.error("평가 파일 서명된 URL 생성 실패", { error });
      return { success: false, error: error.message };
    }

    return {
      success: true,
      signedUrl: data.signedUrl,
    };
  } catch (error) {
    logger.error("평가 파일 서명된 URL 생성 중 오류", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 파일 타입에 따른 MIME 타입 반환 (내부 함수 래퍼)
 * 보안: unknown 타입은 허용하지 않음
 */
function getMimeTypeFromFileType(fileType: FileType): string {
  switch (fileType) {
    case "pdf":
      return "application/pdf";
    case "hwp":
      return "application/x-hwp";
    case "hwpx":
      return "application/vnd.hancom.hwpx";
    case "unknown":
      throw new Error("Unknown file type is not allowed for security reasons");
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}
