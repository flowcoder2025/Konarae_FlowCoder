import { PrismaClient, Prisma } from "@prisma/client"

const prisma = new PrismaClient()

// 테스트할 회사 ID (주식회사 엠엔티)
const COMPANY_ID = "cmj5tfh9x0000ii2ra6jsuchx"

async function testGenerateMasterProfile() {
  console.log("=== 마스터 프로필 생성 테스트 ===\n")

  // 1. 회사 정보 확인
  const company = await prisma.company.findUnique({
    where: { id: COMPANY_ID },
    select: { id: true, name: true }
  })

  if (!company) {
    console.log("회사를 찾을 수 없습니다.")
    return
  }

  console.log("회사:", company.name)
  console.log("ID:", company.id)

  // 2. 분석된 문서 조회
  const documents = await prisma.companyDocument.findMany({
    where: {
      companyId: COMPANY_ID,
      status: "analyzed",
      deletedAt: null,
    },
    include: {
      analysis: true
    }
  })

  console.log("\n분석된 문서:", documents.length + "개")
  documents.forEach(d => {
    console.log("  - " + d.documentType + ": " + d.fileName)
  })

  // 3. 기존 프로필 확인
  const existingProfile = await prisma.companyMasterProfile.findUnique({
    where: { companyId: COMPANY_ID }
  })

  if (existingProfile) {
    console.log("\n기존 프로필 존재:", existingProfile.status)
    console.log("버전:", existingProfile.version)
  } else {
    console.log("\n기존 프로필: 없음 (첫 생성)")
  }

  // 4. 마스터 프로필 생성 (직접 generate 함수 호출)
  console.log("\n--- AI 블록 생성 시작 ---\n")

  const { generateProfileBlocks } = await import("../src/lib/master-profile/generate")

  // 문서 분석 데이터 준비
  const documentInputs = documents
    .filter(d => d.analysis)
    .map(d => ({
      documentId: d.id,
      documentType: d.documentType,
      extractedData: d.analysis!.extractedData,
      summary: d.analysis!.summary || "",
      keyInsights: (d.analysis!.keyInsights as string[]) || [],
    }))

  console.log("입력 문서 수:", documentInputs.length)

  try {
    const startTime = Date.now()
    const result = await generateProfileBlocks(documentInputs, company.name)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log("\n--- 생성 완료 (" + elapsed + "초) ---")
    console.log("생성된 블록 수:", result.blocks.length)
    console.log("신뢰도 점수:", result.confidenceScore)

    // 블록 상세 출력
    console.log("\n--- 생성된 블록 ---")
    result.blocks.forEach((block, i) => {
      console.log("\n[" + (i + 1) + "] " + block.category + " - " + block.title)
      console.log("    타입:", block.contentType)
      console.log("    출처:", block.sourceDocumentTypes.join(", "))
      console.log("    내용 미리보기:", block.content.substring(0, 100) + "...")
    })

    // 5. DB에 저장
    console.log("\n--- DB 저장 ---")

    const profile = await prisma.companyMasterProfile.upsert({
      where: { companyId: COMPANY_ID },
      create: {
        companyId: COMPANY_ID,
        status: "completed",
        version: 1,
        generatedFromDocuments: documents.map(d => d.id),
        analyzedDocumentCount: documents.length,
        confidenceScore: result.confidenceScore,
        creditUsed: 0,
        isFreeGeneration: true,
        completedAt: new Date(),
      },
      update: {
        status: "completed",
        version: { increment: 1 },
        generatedFromDocuments: documents.map(d => d.id),
        analyzedDocumentCount: documents.length,
        confidenceScore: result.confidenceScore,
        completedAt: new Date(),
      }
    })

    console.log("프로필 ID:", profile.id)

    // 기존 블록 비활성화
    await prisma.profileBlock.updateMany({
      where: { profileId: profile.id },
      data: { isActive: false }
    })

    // 새 블록 생성
    for (const block of result.blocks) {
      await prisma.profileBlock.create({
        data: {
          profileId: profile.id,
          category: block.category,
          title: block.title,
          blockOrder: block.blockOrder,
          content: block.content,
          contentType: block.contentType,
          metadata: block.metadata as unknown as Prisma.InputJsonValue,
          sourceDocumentIds: [],
          sourceDocumentTypes: block.sourceDocumentTypes,
          isAiGenerated: true,
        }
      })
    }

    console.log("블록 저장 완료:", result.blocks.length + "개")
    console.log("\n✅ 마스터 프로필 생성 성공!")

  } catch (error) {
    console.error("\n❌ 생성 실패:", error)
  }
}

testGenerateMasterProfile().catch(console.error).finally(() => prisma.$disconnect())
