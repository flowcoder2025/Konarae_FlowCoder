/**
 * Flow UI - i18n 텍스트 설정
 *
 * 배포 환경에 따라 텍스트 스타일 분기:
 * - standalone: 비즈니스 용어 (간결하고 전문적)
 * - apps-in-toss: 해요체 (친근하고 대화형)
 */

const DEPLOYMENT_ENV = process.env.NEXT_PUBLIC_DEPLOYMENT_ENV || 'standalone'
const isAppsInToss = DEPLOYMENT_ENV === 'apps-in-toss'

/* ============================================
   BUTTON TEXT
   ============================================ */
export const BUTTON_TEXT = {
  // CTA (Call-to-Action)
  contactUs: isAppsInToss ? '문의해요' : '문의하기',
  consultRequest: isAppsInToss ? '상담 신청해요' : '상담 신청',
  learnMore: isAppsInToss ? '자세히 보기' : '자세히 보기',
  viewMore: isAppsInToss ? '더 보기' : '더 보기',
  startFree: isAppsInToss ? '무료로 시작해요' : '무료 시작',
  tryNow: isAppsInToss ? '지금 시도해요' : '지금 시도',
  getStarted: isAppsInToss ? '시작해요' : '시작하기',

  // Actions
  save: isAppsInToss ? '저장해요' : '저장',
  cancel: isAppsInToss ? '취소해요' : '취소',
  confirm: isAppsInToss ? '확인해요' : '확인',
  close: isAppsInToss ? '닫기' : '닫기',
  back: isAppsInToss ? '뒤로가기' : '뒤로',
  next: isAppsInToss ? '다음' : '다음',
  submit: isAppsInToss ? '제출해요' : '제출',
  delete: isAppsInToss ? '삭제해요' : '삭제',
  edit: isAppsInToss ? '수정해요' : '수정',
  create: isAppsInToss ? '만들어요' : '만들기',

  // Auth
  login: isAppsInToss ? '로그인해요' : '로그인',
  logout: isAppsInToss ? '로그아웃해요' : '로그아웃',
  signup: isAppsInToss ? '가입해요' : '회원가입',

  // Navigation
  home: '홈',
  dashboard: '대시보드',
  settings: '설정',
  profile: '프로필',
} as const

/* ============================================
   STATUS TEXT
   ============================================ */
export const STATUS_TEXT = {
  // Loading
  loading: isAppsInToss ? '불러오고 있어요' : '로딩 중',
  sending: isAppsInToss ? '전송하고 있어요' : '전송 중',
  processing: isAppsInToss ? '처리하고 있어요' : '처리 중',
  saving: isAppsInToss ? '저장하고 있어요' : '저장 중',

  // Completion
  completed: isAppsInToss ? '완료했어요' : '완료',
  sent: isAppsInToss ? '전송했어요' : '전송됨',
  saved: isAppsInToss ? '저장했어요' : '저장됨',
  success: isAppsInToss ? '성공했어요' : '성공',

  // Error
  failed: isAppsInToss ? '실패했어요' : '실패',
  error: isAppsInToss ? '오류가 발생했어요' : '오류 발생',
} as const

/* ============================================
   PLACEHOLDER TEXT
   ============================================ */
export const PLACEHOLDER_TEXT = {
  email: isAppsInToss ? '이메일을 입력해주세요' : '이메일 입력',
  password: isAppsInToss ? '비밀번호를 입력해주세요' : '비밀번호 입력',
  name: isAppsInToss ? '이름을 입력해주세요' : '이름 입력',
  search: isAppsInToss ? '검색어를 입력해주세요' : '검색',
  message: isAppsInToss ? '메시지를 입력해주세요' : '메시지 입력',
} as const

/* ============================================
   LABEL TEXT
   ============================================ */
export const LABEL_TEXT = {
  email: '이메일',
  password: '비밀번호',
  name: '이름',
  title: '제목',
  description: '설명',
} as const

/* ============================================
   MESSAGE TEXT (톤 코드별)
   ============================================ */
export const MESSAGE_TEXT = {
  // Confirm (긍정적 확인)
  confirm: {
    saved: isAppsInToss ? '저장되었어요' : '저장되었습니다',
    deleted: isAppsInToss ? '삭제되었어요' : '삭제되었습니다',
    created: isAppsInToss ? '생성되었어요' : '생성되었습니다',
  },

  // Destructive (파괴적/위험)
  destructive: {
    deleteConfirm: isAppsInToss ? '정말 삭제할까요?' : '정말 삭제하시겠습니까?',
    unsavedChanges: isAppsInToss ? '저장하지 않은 변경사항이 있어요' : '저장하지 않은 변경사항이 있습니다',
  },

  // Soft (부드러운 안내)
  soft: {
    required: isAppsInToss ? '필수 항목이에요' : '필수 항목입니다',
    optional: isAppsInToss ? '선택 항목이에요' : '선택 항목입니다',
  },

  // Neutral (중립적 정보)
  neutral: {
    noData: isAppsInToss ? '데이터가 없어요' : '데이터가 없습니다',
    empty: isAppsInToss ? '비어있어요' : '비어있습니다',
  },
} as const

/* ============================================
   TYPE EXPORTS
   ============================================ */
export type ButtonTextKey = keyof typeof BUTTON_TEXT
export type StatusTextKey = keyof typeof STATUS_TEXT
export type PlaceholderTextKey = keyof typeof PLACEHOLDER_TEXT
export type LabelTextKey = keyof typeof LABEL_TEXT

/* ============================================
   ID-BASED TEXT (네이밍 체계 기반)
   ============================================ */
export const ID_TEXT: Record<string, string> = {
  // Auth - Login
  "LID.AUTH.LOGIN.TITLE": isAppsInToss ? "로그인해요" : "로그인",
  "LID.AUTH.LOGIN.SUBTITLE": isAppsInToss ? "계정으로 로그인해주세요" : "계정으로 로그인하세요",
  "LID.AUTH.EMAIL.PLACEHOLDER": PLACEHOLDER_TEXT.email,
  "LID.AUTH.EMAIL.LABEL": LABEL_TEXT.email,
  "LID.AUTH.PASSWORD.PLACEHOLDER": PLACEHOLDER_TEXT.password,
  "LID.AUTH.PASSWORD.LABEL": LABEL_TEXT.password,
  "BTN.AUTH.LOGIN": BUTTON_TEXT.login,
  "BTN.AUTH.REGISTER": BUTTON_TEXT.signup,
  "BTN.AUTH.LOGOUT": BUTTON_TEXT.logout,

  // Common Actions
  "BTN.PRIMARY.SUBMIT": BUTTON_TEXT.submit,
  "BTN.PRIMARY.SAVE": BUTTON_TEXT.save,
  "BTN.SECONDARY.CANCEL": BUTTON_TEXT.cancel,
  "BTN.SECONDARY.BACK": BUTTON_TEXT.back,
  "BTN.CTA.START": BUTTON_TEXT.getStarted,
  "BTN.CTA.LEARN_MORE": BUTTON_TEXT.learnMore,

  // Status
  "LID.STATUS.LOADING": STATUS_TEXT.loading,
  "LID.STATUS.SUCCESS": STATUS_TEXT.success,
  "LID.STATUS.ERROR": STATUS_TEXT.error,

  // Modal
  "LID.MODAL.DELETE.TITLE": isAppsInToss ? "삭제할까요?" : "삭제하시겠습니까?",
  "LID.MODAL.DELETE.CONFIRM": MESSAGE_TEXT.destructive.deleteConfirm,
  "BTN.MODAL.CONFIRM": BUTTON_TEXT.confirm,
  "BTN.MODAL.CANCEL": BUTTON_TEXT.cancel,
} as const

/* ============================================
   UTILITIES
   ============================================ */
export const isStandalone = DEPLOYMENT_ENV === 'standalone'
export const isAppsInTossEnv = DEPLOYMENT_ENV === 'apps-in-toss'

export function getDeploymentEnvName(): string {
  return isAppsInToss ? '앱인토스' : '독립 서비스'
}

/**
 * ID 기반 텍스트 조회
 * @param id - 텍스트 ID (예: "LID.AUTH.LOGIN.TITLE", "BTN.PRIMARY.SUBMIT")
 * @returns 해당 ID의 텍스트, 없으면 ID 반환
 * @example getText("LID.AUTH.LOGIN.TITLE") // "로그인" 또는 "로그인해요"
 */
export function getText(id: string): string {
  return ID_TEXT[id] ?? id
}
