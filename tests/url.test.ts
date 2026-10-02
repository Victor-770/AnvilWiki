import { describe, it, expect } from 'vitest';
import {
  localizePath,
  listPath,
  detailPath,
  homeUrl,
  slugifyTag,
  absoluteUrl,
  languageAlternates,
} from '~/lib/url';
import { locales, defaultLocale } from '~/i18n/routing';

/**
 * Non-default locales actually configured in this fork. The template ships
 * demo content in two locales; forks may keep only "en" (apply-template
 * supports that), which makes the prefix rules unreachable at runtime. The
 * non-default cases below iterate this list and self-skip when it's empty,
 * so the suite passes en-only AND keeps covering prefixes once a locale is
 * added back via scripts/new-locale.ts.
 */
const nonDefaultLocales = locales.filter((l) => l !== defaultLocale);
const itForEachNonDefault = nonDefaultLocales.length > 0 ? it : it.skip;

describe('url helpers', () => {
  describe('localizePath', () => {
    it('returns the path unchanged for the default locale (en)', () => {
      expect(localizePath('/bosses', 'en')).toBe('/bosses/');
      expect(localizePath('/bosses/emberfang', 'en')).toBe('/bosses/emberfang/');
    });

    itForEachNonDefault('prepends the locale prefix for non-default locales', () => {
      for (const loc of nonDefaultLocales) {
        expect(localizePath('/bosses', loc)).toBe(`/${loc}/bosses/`);
        expect(localizePath('/bosses/emberfang', loc)).toBe(`/${loc}/bosses/emberfang/`);
      }
    });

    it('ensures leading slash on input without one', () => {
      expect(localizePath('about', 'en')).toBe('/about/');
      for (const loc of nonDefaultLocales) {
        expect(localizePath('about', loc)).toBe(`/${loc}/about/`);
      }
    });
  });

  describe('homeUrl', () => {
    it('returns / for default locale', () => {
      expect(homeUrl('en')).toBe('/');
    });
    itForEachNonDefault('returns /<locale> for non-default locales', () => {
      for (const loc of nonDefaultLocales) {
        expect(homeUrl(loc)).toBe(`/${loc}/`);
      }
    });
  });

  describe('listPath', () => {
    it('builds the correct list URL for each locale', () => {
      expect(listPath('bosses', 'en')).toBe('/bosses/');
      for (const loc of nonDefaultLocales) {
        expect(listPath('bosses', loc)).toBe(`/${loc}/bosses/`);
      }
    });
  });

  describe('detailPath', () => {
    it('builds the correct article URL for each locale', () => {
      expect(detailPath('bosses', 'emberfang', 'en')).toBe('/bosses/emberfang/');
      for (const loc of nonDefaultLocales) {
        expect(detailPath('bosses', 'emberfang', loc)).toBe(`/${loc}/bosses/emberfang/`);
      }
    });

    it('handles nested slugs', () => {
      expect(detailPath('guides', 'early-game/beginner', 'en')).toBe(
        '/guides/early-game/beginner/',
      );
      for (const loc of nonDefaultLocales) {
        expect(detailPath('guides', 'early-game/beginner', loc)).toBe(
          `/${loc}/guides/early-game/beginner/`,
        );
      }
    });
  });
});

describe('slugifyTag (ASCII slug / raw fallback for non-ASCII)', () => {
  it('slugifies ASCII tags to lowercase kebab-case', () => {
    expect(slugifyTag('Boss Guide')).toBe('boss-guide');
    expect(slugifyTag('Fire_Warden')).toBe('fire-warden');
  });

  it('returns CJK tags raw instead of collapsing to empty', () => {
    // Folding a CJK tag leaves characters outside [a-z0-9-], so it takes the
    // raw path. Astro writes params to disk verbatim, so the built directory
    // is the raw tag and browser-encoded links (/tags/%E7%84%B0…) resolve to
    // it — while a partial ASCII strip would have collapsed this to ''.
    const zh = slugifyTag('焰牙');
    expect(zh).toBe('焰牙');
    expect(zh).not.toBe('');
  });

  it('returns mixed ASCII+CJK tags raw — a partial strip would collide them', () => {
    // Stripping only the non-ASCII would leave '焰牙 攻略' → '-' (truthy, so
    // no fallback) and BOTH 'Roblox 焰牙' and 'Roblox 攻略' → 'roblox-':
    // distinct tags crowding onto one /tags/ page. Any tag still holding a
    // non-[a-z0-9-] character after folding goes raw wholesale instead.
    expect(slugifyTag('焰牙 攻略')).toBe('焰牙 攻略');
    expect(slugifyTag('Roblox 焰牙')).not.toBe(slugifyTag('Roblox 攻略'));
    // The raw path is idempotent, like the ASCII one.
    expect(slugifyTag(slugifyTag('焰牙 攻略'))).toBe(slugifyTag('焰牙 攻略'));
  });

  it('keeps two different CJK tags distinguishable', () => {
    expect(slugifyTag('焰牙')).not.toBe(slugifyTag('风暴召唤者'));
  });

  it('keeps pure-symbol tags non-empty', () => {
    // Whatever the exact characters, the slug is stable and distinct from ''
    // — the property the raw path exists to guarantee.
    expect(slugifyTag('!!!')).toBe('!!!');
    expect(slugifyTag('  ???  ')).toBe('???');
  });
});

describe('absoluteUrl', () => {
  it('prefixes siteUrl and applies the locale prefix rules', () => {
    expect(absoluteUrl('/bosses', 'en')).toMatch(/^https:\/\/[^/]+\/bosses\/$/);
    for (const loc of nonDefaultLocales) {
      expect(absoluteUrl('/bosses', loc)).toMatch(new RegExp(`^https:\\/\\/[^/]+\\/${loc}\\/bosses\\/$`));
    }
  });
});

describe('languageAlternates', () => {
  // languageAlternates is locale-list-agnostic at runtime, but its signature
  // only accepts configured Locale values. Drive the multi-entry cases from
  // routing: with one configured locale the lists are short; adding a locale
  // via scripts/new-locale.ts restores full multi-entry coverage.
  it('builds absolute hreflang entries for exactly the given locales', () => {
    const alts = languageAlternates((loc) => localizePath('/bosses/x', loc), locales);
    expect(alts).toHaveLength(locales.length);
    alts.forEach((alt, i) => {
      expect(alt.hreflang).toBe(locales[i]);
      expect(alt.href).toMatch(/\/bosses\/x\/$/);
    });
  });

  it('never emits x-default (BaseLayout derives it separately)', () => {
    const alts = languageAlternates((loc) => localizePath('/guides', loc), locales);
    expect(alts.some((a) => a.hreflang === 'x-default')).toBe(false);
  });

  it('honors a reduced locale list (single-language article)', () => {
    const alts = languageAlternates((loc) => localizePath('/bosses/x', loc), [defaultLocale]);
    expect(alts).toHaveLength(1);
    expect(alts[0].hreflang).toBe(defaultLocale);
  });

  it('shares one domain-assembly with absoluteUrl — same path+locale, identical href', () => {
    // languageAlternates receives already-localized paths (its buildPath
    // returns localizePath output) while absoluteUrl localizes internally;
    // both must join the domain through the same single helper so the
    // `${siteUrl}${path}` construction can't drift between them.
    const alts = languageAlternates((loc) => localizePath('/faq', loc), locales);
    expect(alts.map((a) => a.href)).toEqual(locales.map((l) => absoluteUrl('/faq', l)));
  });
});
