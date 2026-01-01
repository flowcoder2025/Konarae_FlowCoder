import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  HeroSection,
  PainPointsSection,
  FeaturesSection,
  HowItWorksSection,
  SocialProofSection,
  CTASection,
  Footer,
} from "@/components/landing";

export default async function HomePage() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-col min-h-screen">
      <HeroSection />
      <PainPointsSection />
      <FeaturesSection />
      <HowItWorksSection />
      <SocialProofSection />
      <CTASection />
      <Footer />
    </main>
  );
}
