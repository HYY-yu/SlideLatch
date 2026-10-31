import '../globals.css';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n';

const nacelle = localFont({
  src: [
    { path: '../../public/fonts/nacelle-regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/nacelle-semibold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-nacelle', display: 'swap',
});

export default async function LocaleLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <html lang={locale === 'zh' ? 'zh-CN' : 'en'}>
    <body className={nacelle.variable}>{children}</body>
  </html>;
}
