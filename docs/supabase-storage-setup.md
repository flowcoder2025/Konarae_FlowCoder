# Supabase Storage 설정 가이드

## 1. 버킷 생성

Supabase Dashboard → Storage → Create Bucket

**버킷명**: `company-documents`
**Public**: No (Private)
**File size limit**: 10MB

> ⚠️ **RLS 정책 설정 불필요**: Private bucket + Signed URLs + API 레벨 ReBAC으로 충분합니다.

## 2. 보안 메커니즘

우리 시스템은 다층 보안 구조를 사용합니다:

1. **API 레벨 권한 체크** (ReBAC)
   - 모든 요청은 API 라우트에서 권한 검증
   - CompanyMember 테이블로 role 확인 (viewer/member/admin/owner)

2. **Private Bucket**
   - 공개 접근 완전 차단
   - Supabase service role key로만 접근 가능

3. **Signed URLs**
   - 1시간 시간 제한
   - 파일별 개별 URL 생성
   - 만료 후 자동 무효화

## 3. 파일 경로 구조

```
company-documents/
  └── {userId}/
      └── {companyId}/
          └── {documentType}/
              └── {timestamp}_{originalFileName}
```

**예시**:
```
company-documents/
  └── clx123456/
      └── cly789012/
          └── business_registration/
              └── 1702512000000_사업자등록증.pdf
```

## 4. 권한 체크 흐름

```
사용자 요청
  ↓
API 라우트 (/api/companies/[id]/documents/*)
  ↓
ReBAC 권한 체크 (CompanyMember.role)
  ↓ (권한 OK)
Supabase Storage 작업 (service role key)
  ↓
Signed URL 생성 (1시간 제한)
  ↓
클라이언트로 반환
```

## 5. 파일 업로드 예제 (서버 측)

```typescript
const filePath = `${userId}/${companyId}/${documentType}/${timestamp}_${fileName}`;

const { data, error } = await supabase.storage
  .from('company-documents')
  .upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  });
```

## 6. Signed URL 생성 예제

```typescript
import { createClient } from '@/lib/supabase/client';

export async function createSignedUrl(fileUrl: string) {
  const supabase = createClient();
  const filePath = fileUrl.split('/').slice(-4).join('/');

  const { data, error } = await supabase.storage
    .from('company-documents')
    .createSignedUrl(filePath, 3600); // 1시간

  return { signedUrl: data?.signedUrl, error };
}
```

## 7. 환경 변수 확인

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJxxx..."  # Public (제한적 권한)
SUPABASE_SERVICE_ROLE_KEY="eyJxxx..."     # Private (Storage 접근용)
```

## 8. 주의사항

- **파일 타입 검증**: PDF, JPG, JPEG, PNG, WEBP만 허용
- **파일 크기 제한**: 10MB 이하
- **Private Bucket**: 반드시 Public: No로 설정
- **중복 업로드**: upsert: false로 중복 방지
- **RLS 정책**: 설정하지 않음 (불필요)
