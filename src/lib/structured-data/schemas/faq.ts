import { APP_BASE_URL } from "@/lib/app"
import { ORGANIZATION_ID } from "@/lib/structured-data/schemas/organization"
import { WEB_APPLICATION_ID } from "@/lib/structured-data/schemas/web-application"

export interface FaqItem {
  question: string
  answer: string
}

export function generateFaqPageSchema(faqs: FaqItem[], path: string) {
  const url = new URL(path, APP_BASE_URL).toString()

  return {
    "@type": "FAQPage",
    "@id": `${url}#faqpage`,
    name: "Frequently Asked Questions",
    url,
    inLanguage: "en",
    about: { "@id": WEB_APPLICATION_ID },
    publisher: { "@id": ORGANIZATION_ID },
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }
}
