import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Landing from '@/components/landing';
import { copy, isLocale, locales } from '@/lib/i18n';

export const dynamicParams = false;
export function generateStaticParams() { return locales.map(locale => ({ locale })); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const content = copy[locale];
  return {
    title: `SlideLatch — ${content.title.join(locale === 'zh' ? '' : ' ')}`,
    description: content.description,
    alternates: { languages: { 'zh-CN': '/zh', en: '/en' } },
    openGraph: { title: 'SlideLatch', description: content.description, type: 'website', locale: locale === 'zh' ? 'zh_CN' : 'en_US' },
  };
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Landing locale={locale} />;
}
