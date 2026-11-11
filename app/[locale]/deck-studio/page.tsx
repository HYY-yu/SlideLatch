import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import TemplateDemo from '@/components/template-demo';
import { isLocale, locales } from '@/lib/i18n';

export const dynamicParams = false;
export function generateStaticParams() { return locales.map(locale => ({ locale })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: locale === 'zh' ? 'PPT 工作台 | SlideLatch' : 'Deck studio | SlideLatch',
    alternates: { canonical: `https://slidelatch.app/${locale}/deck-studio`, languages: { 'zh-CN': 'https://slidelatch.app/zh/deck-studio', en: 'https://slidelatch.app/en/deck-studio' } },
  };
}

export default async function DeckStudioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <main><TemplateDemo key={locale} locale={locale} mode="studio" /></main>;
}
