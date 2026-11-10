import type { Metadata } from 'next';
import Link from 'next/link';
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
  const zh = locale === 'zh';
  return <div className={`site locale-${locale}`}>
    <header className="header-shell">
      <nav className="nav-bar" aria-label={zh ? '工作台导航' : 'Studio navigation'}>
        <Link href={`/${locale}`} className="brand">SlideLatch</Link>
        <div className="nav-actions">
          <Link href={`/${locale}`} className="language-switch">{zh ? '返回首页' : 'Back to home'}</Link>
          <Link href={`/${zh ? 'en' : 'zh'}/deck-studio`} className="language-switch" hrefLang={zh ? 'en' : 'zh-CN'} aria-label={zh ? '切换到英文' : 'Switch to Chinese'}>{zh ? 'EN' : '中文'}</Link>
        </div>
      </nav>
    </header>
    <main>
      <h1 className="section-shell" style={{ marginTop: 40, fontSize: 32 }}>{zh ? 'PPT 工作台' : 'Deck studio'}</h1>
      <TemplateDemo locale={locale} mode="studio" />
    </main>
  </div>;
}
