/**
 * useDropzone 커스텀 훅
 * 파일 드래그 앤 드랍 기능을 제공합니다.
 */

import { useState, useCallback, useRef, DragEvent } from "react";

export interface UseDropzoneOptions {
  /** 허용할 파일 타입 (MIME type) */
  accept?: string[];
  /** 최대 파일 크기 (bytes) */
  maxSize?: number;
  /** 다중 파일 허용 여부 */
  multiple?: boolean;
  /** 비활성화 여부 */
  disabled?: boolean;
  /** 파일 선택 시 콜백 */
  onDrop?: (files: File[]) => void;
  /** 에러 발생 시 콜백 */
  onError?: (error: string) => void;
}

export interface UseDropzoneReturn {
  /** 드래그 중 여부 */
  isDragging: boolean;
  /** 루트 요소에 적용할 props */
  getRootProps: () => {
    onDragEnter: (e: DragEvent<HTMLElement>) => void;
    onDragLeave: (e: DragEvent<HTMLElement>) => void;
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
    onClick: () => void;
  };
  /** input 요소에 적용할 props */
  getInputProps: () => {
    ref: React.RefObject<HTMLInputElement | null>;
    type: "file";
    accept: string | undefined;
    multiple: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    className: string;
    disabled: boolean;
  };
  /** 파일 선택 다이얼로그 열기 */
  open: () => void;
}

export function useDropzone(options: UseDropzoneOptions = {}): UseDropzoneReturn {
  const {
    accept,
    maxSize,
    multiple = false,
    disabled = false,
    onDrop,
    onError,
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const validateFile = useCallback(
    (file: File): string | null => {
      // 파일 타입 검증
      if (accept && accept.length > 0) {
        const fileType = file.type;
        const fileExtension = `.${file.name.split(".").pop()?.toLowerCase()}`;

        const isValidType = accept.some((acceptType) => {
          // MIME 타입 체크 (예: application/pdf, image/*)
          if (acceptType.includes("/")) {
            if (acceptType.endsWith("/*")) {
              return fileType.startsWith(acceptType.replace("/*", "/"));
            }
            return fileType === acceptType;
          }
          // 확장자 체크 (예: .pdf, .jpg)
          return fileExtension === acceptType.toLowerCase();
        });

        if (!isValidType) {
          return `지원하지 않는 파일 형식입니다: ${file.name}`;
        }
      }

      // 파일 크기 검증
      if (maxSize && file.size > maxSize) {
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
        return `파일 크기가 ${maxSizeMB}MB를 초과합니다: ${file.name}`;
      }

      return null;
    },
    [accept, maxSize]
  );

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      if (disabled) return;

      const fileArray = Array.from(files);
      const validFiles: File[] = [];
      const errors: string[] = [];

      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          errors.push(error);
        } else {
          validFiles.push(file);
        }
      }

      // 단일 파일 모드에서 첫 번째 파일만 사용
      const filesToUse = multiple ? validFiles : validFiles.slice(0, 1);

      if (errors.length > 0 && onError) {
        onError(errors.join("\n"));
      }

      if (filesToUse.length > 0 && onDrop) {
        onDrop(filesToUse);
      }
    },
    [disabled, multiple, validateFile, onDrop, onError]
  );

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      dragCounter.current++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDragging(false);
      }
    },
    [disabled]
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
    },
    []
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      setIsDragging(false);
      dragCounter.current = 0;

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processFiles(files);
      }
    },
    [disabled, processFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFiles(files);
      }
      // input 초기화 (같은 파일 다시 선택 가능하도록)
      e.target.value = "";
    },
    [processFiles]
  );

  const open = useCallback(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  }, [disabled]);

  const handleClick = useCallback(() => {
    open();
  }, [open]);

  const getRootProps = useCallback(
    () => ({
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
      onClick: handleClick,
    }),
    [handleDragEnter, handleDragLeave, handleDragOver, handleDrop, handleClick]
  );

  const getInputProps = useCallback(
    () => ({
      ref: inputRef,
      type: "file" as const,
      accept: accept?.join(","),
      multiple,
      onChange: handleInputChange,
      className: "hidden",
      disabled,
    }),
    [accept, multiple, handleInputChange, disabled]
  );

  return {
    isDragging,
    getRootProps,
    getInputProps,
    open,
  };
}
