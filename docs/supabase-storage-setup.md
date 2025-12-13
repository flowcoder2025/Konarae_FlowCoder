# Supabase Storage 설정 가이드

## 1. 버킷 생성

Supabase Dashboard → Storage → Create Bucket

**버킷명**: `company-documents`
**Public**: No (Private)
**File size limit**: 10MB

## 2. RLS (Row Level Security) 정책 설정

```sql
-- 1. authenticated 사용자만 업로드 가능
CREATE POLICY "authenticated_users_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-documents'
);

-- 2. 본인이 업로드한 파일만 조회 가능
CREATE POLICY "users_select_own_documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. 본인이 업로드한 파일만 수정 가능
CREATE POLICY "users_update_own_documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. 본인이 업로드한 파일만 삭제 가능
CREATE POLICY "users_delete_own_documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

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

## 4. Signed URL 설정

- 파일 다운로드 시 Signed URL 생성
- 만료 시간: 1시간 (3600초)
- 보안: 직접 URL 접근 차단

```typescript
const { data, error } = await supabase.storage
  .from('company-documents')
  .createSignedUrl(filePath, 3600);
```

## 5. 파일 업로드 예제

```typescript
const filePath = `${userId}/${companyId}/${documentType}/${timestamp}_${fileName}`;

const { data, error } = await supabase.storage
  .from('company-documents')
  .upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  });
```

## 6. 주의사항

- **파일 타입 검증**: PDF, JPG, JPEG, PNG, WEBP만 허용
- **파일 크기 제한**: 10MB 이하
- **바이러스 스캔**: 향후 추가 고려
- **중복 업로드**: upsert: false로 중복 방지
