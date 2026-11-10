'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import GalaxyBackground from './galaxy-background';
import { copy, type Locale } from '@/lib/i18n';
import TemplateDemo from './template-demo';
import { seoCopy } from '@/lib/seo-copy';
import GeneratedShowcase from './generated-showcase';
import Analytics from './analytics';
import {EngagementProvider,TrialButton} from './engagement';

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h16m-6-6 6 6-6 6'} /></svg>;
}
function Brand() {
  return <span className="brand"><svg aria-hidden="true" width="30" height="30" viewBox="0 0 40 40"><rect x="1" y="1" width="38" height="38" rx="11" fill="#6056ed"/><path d="M11 12h18v12H17v5h-6V12Z" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/><path d="m20 17 4 3-4 3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>SlideLatch</span>;
}

export default function Landing({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const seo = seoCopy[locale];
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.12 });
    pageRef.current?.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return <EngagementProvider locale={locale}><Analytics locale={locale}/><div ref={pageRef} id="top" className={`site locale-${locale}`}>
    <GalaxyBackground />
    <header className="header-shell">
      <nav className="nav-bar" aria-label={locale === 'zh' ? '主导航' : 'Main navigation'}>
        <Link href={`/${locale}`} aria-label="SlideLatch"><Brand /></Link>
        <div className="nav-actions"><TrialButton locale={locale} source="header" className="nav-link nav-trial"/>
          <Link href={`/${locale}/deck-studio`} className="language-switch">{t.navStudio}</Link>
          <a href="#workflow" className="nav-link">{t.navWorkflow}</a>
          <Link className="language-switch" href={locale === 'zh' ? '/en' : '/zh'} hrefLang={locale === 'zh' ? 'en' : 'zh-CN'} aria-label={t.languageLabel}>
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>
            {locale === 'zh' ? 'EN' : '中文'}
          </Link>
          <a href="#demo" className="button button-small button-primary nav-cta">{t.navDemo}<Arrow /></a>
        </div>
      </nav>
    </header>

    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow hero-enter">{t.eyebrow}</p>
          <h1 id="hero-title" className="hero-enter">{t.title[0]}<br/><span>{t.title[1]}</span></h1>
          <div className="hero-actions hero-enter">
            <a className="button button-primary" href="#results">{t.primary}<Arrow /></a>
          </div>
        </div>

        <GeneratedShowcase locale={locale} />
        <TemplateDemo key={locale} locale={locale} />
      </section>

      <section className="template-reuse section-shell" id="template-reuse" aria-labelledby="reuse-title">
        <h2 id="reuse-title">{seo.workflowTitle}</h2>
        <ol className="reuse-steps" role="list">{seo.steps.map((step, index) => <li key={step.title}><span aria-hidden="true">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
      </section>

      <section className="template-faq section-shell" id="faq" aria-labelledby="faq-title">
        <h2 id="faq-title">{seo.faqTitle}</h2>
        {seo.faqs.map(faq => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
      </section>

      <section className="early-access section-shell reveal" aria-labelledby="early-title">
        <h2 id="early-title">{t.earlyTitle}</h2><p>{t.earlyDescription}</p>
        <TrialButton locale={locale} source="footer"/>
      </section>
    </main>
    <footer className="footer section-shell"><Link href={`/${locale}`} aria-label="SlideLatch"><Brand /></Link><a href="#top">{t.footerTop}<span aria-hidden="true">↑</span></a></footer>
  </div></EngagementProvider>;
}
