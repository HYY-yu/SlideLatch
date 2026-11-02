import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Landing from '@/components/landing';
import { isLocale, locales } from '@/lib/i18n';
import { seoCopy } from '@/lib/seo-copy';

export const dynamicParams = false;
export function generateStaticParams() { return locales.map(locale => ({ locale })); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const content = seoCopy[locale];
  return {
    metadataBase: new URL('https://slidelatch.app'),
    title: content.title,
    description: content.description,
    alternates: { canonical: `/${locale}`, languages: { 'zh-CN': '/zh', en: '/en', 'x-default': '/zh' } },
    openGraph: { title: content.title, description: content.description, url: `/${locale}`, siteName: 'SlideLatch', type: 'website', locale: locale === 'zh' ? 'zh_CN' : 'en_US', alternateLocale: locale === 'zh' ? 'en_US' : 'zh_CN' },
    twitter: { card: 'summary', title: content.title, description: content.description },
  };
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Landing locale={locale} />;
}
