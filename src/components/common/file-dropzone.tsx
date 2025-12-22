/**
 * FileDropzone 공통 컴포넌트
 * 드래그 앤 드랍 + 클릭 파일 선택 기능 제공
 */

"use client";

import { cn } from "@/lib/utils";
import { useDropzone } from "@/hooks/use-dropzone";
import { Upload } from "lucide-react";

export interface FileDropzoneProps {
  /** 파일 선택 시 콜백 */
  onFileSelect: (files: File[]) => void;
  /** 에러 발생 시 콜백 */
  onError?: (error: string) => void;
  /** 허용할 파일 타입 (MIME type 또는 확장자) */
  accept?: string[];
  /** 최대 파일 크기 (bytes) */
  maxSize?: number;
  /** 다중 파일 허용 여부 */
  multiple?: boolean;
  /** 비활성화 여부 */
  disabled?: boolean;
  /** 추가 클래스명 */
  className?: string;
  /** 아이콘 */
  icon?: React.ReactNode;
  /** 타이틀 */
  title?: string;
  /** 설명 */
  description?: string;
  /** 허용 형식 표시 텍스트 */
  acceptText?: string;
  /** children (커스텀 렌더링) */
  children?: React.ReactNode;
}

export function FileDropzone({
  onFileSelect,
  onError,
  accept,
  maxSize,
  multiple = false,
  disabled = false,
  className,
  icon,
  title = "파일을 드래그하거나 클릭하여 선택",
  description,
  acceptText,
  children,
}: FileDropzoneProps) {
  const { isDragging, getRootProps, getInputProps } = useDropzone({
    accept,
    maxSize,
    multiple,
    disabled,
    onDrop: onFileSelect,
    onError,
  });

  const inputProps = getInputProps();

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 bg-muted/50 hover:border-muted-foreground/50 hover:bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <input {...inputProps} />

      {children ? (
        children
      ) : (
        <>
          <div
            className={cn(
              "mb-4 transition-transform",
              isDragging && "scale-110"
            )}
          >
            {icon || (
              <Upload
                className={cn(
                  "h-12 w-12",
                  isDragging ? "text-primary" : "text-muted-foreground"
                )}
              />
            )}
          </div>

          <p
            className={cn(
              "text-sm font-medium mb-1",
              isDragging ? "text-primary" : "text-foreground"
            )}
          >
            {isDragging ? "여기에 파일을 놓으세요" : title}
          </p>

          {description && (
            <p className="text-sm text-muted-foreground text-center">
              {description}
            </p>
          )}

          {acceptText && (
            <p className="text-xs text-muted-foreground mt-2">{acceptText}</p>
          )}
        </>
      )}
    </div>
  );
}
