export interface NewsletterIssue {
    slug: string;
    issueNumber: string;
    title: string;
    monthLabel: string;
    publishDate: string;
    preview: string;
    bodyHtml: string;
    heroImage: string | null;
    status: string;
}

async function markdownToHtml(markdown: string): Promise<string> {
    const { fromMarkdown } = await import('mdast-util-from-markdown');
    const { toHast } = await import('mdast-util-to-hast');
    const { toHtml } = await import('hast-util-to-html');
    const mdast = fromMarkdown(markdown);
    const hast = toHast(mdast);
    return toHtml(hast as Parameters<typeof toHtml>[0]);
}

function getDirectusConfig() {
    const url = process.env['DIRECTUS_URL'] || '';
    const token = process.env['DIRECTUS_TOKEN'] || '';
    const cfClientId = process.env['CF_ACCESS_CLIENT_ID'] || '';
    const cfClientSecret = process.env['CF_ACCESS_CLIENT_SECRET'] || '';
    return { url, token, cfClientId, cfClientSecret };
}

const NL_MONTHS = [
    'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
    'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

function formatMonthLabel(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return `${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function mapIssue(r: Record<string, unknown>, directusUrl: string, bodyHtml: string): NewsletterIssue {
    const publishDate = String(r.publish_date || r.date || '');
    return {
        slug: String(r.slug || `issue-${r.issue_number || r.id}`),
        issueNumber: String(r.issue_number || ''),
        title: String(r.title || ''),
        monthLabel: String(r.month_label || formatMonthLabel(publishDate)),
        publishDate,
        preview: String(r.preview || r.summary || ''),
        bodyHtml,
        heroImage: r.hero_image ? `${directusUrl}/assets/${String(r.hero_image)}` : null,
        status: String(r.status || 'draft'),
    };
}

async function loadFromDirectus(url: string, token: string, cfClientId?: string, cfClientSecret?: string): Promise<NewsletterIssue[]> {
    let res: Response;
    try {
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        if (cfClientId && cfClientSecret) {
            headers['CF-Access-Client-Id'] = cfClientId;
            headers['CF-Access-Client-Secret'] = cfClientSecret;
        }
        res = await fetch(
            `${url}/items/newsletter_issues?limit=-1&fields=id,slug,issue_number,title,month_label,publish_date,preview,body,hero_image,status&filter[status][_in]=published,draft&sort=-publish_date`,
            {
                headers,
                signal: AbortSignal.timeout(15000),
            },
        );
    } catch (err) {
        console.warn(`[loadNewsletter] Directus unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
    if (!res.ok) {
        console.warn(`[loadNewsletter] Directus returned ${res.status} ${res.statusText} (collection may not exist yet)`);
        return [];
    }
    const json = await res.json();
    const data = (json.data || []) as Record<string, unknown>[];
    const items = await Promise.all(
        data.map(async (r) => {
            const bodyHtml = r.body ? await markdownToHtml(String(r.body)) : '';
            return mapIssue(r, url, bodyHtml);
        }),
    );
    console.log(`[loadNewsletter] fetched ${items.length} issues from Directus`);
    return items;
}

function getPlaceholderIssues(): NewsletterIssue[] {
    return [
        { issueNumber: '24', monthLabel: 'Oktober 2025', title: 'Mist boven Barolo, en waarom we steeds terugkomen', preview: 'Sophie schreef vorige week vanaf een terras in La Morra. De oogst was net begonnen, en…' },
        { issueNumber: '23', monthLabel: 'September 2025', title: 'Drie schuimwijnen die geen Champagne zijn', preview: 'Lambrusco, Cava, Crémant. Vooroordelen, en waarom ze allemaal onterecht zijn…' },
        { issueNumber: '22', monthLabel: 'Augustus 2025', title: 'Een week in Wachau zonder auto', preview: 'Per fiets langs de Donau van Krems naar Melk. Riesling, Grüner Veltliner, en de fout…' },
        { issueNumber: '21', monthLabel: 'Juli 2025', title: 'Wat te drinken bij ansjovis', preview: 'Een hardnekkige misvatting: ansjovis vraagt om witte wijn. Wij zeggen rosé van Bandol…' },
        { issueNumber: '20', monthLabel: 'Juni 2025', title: 'Rioja in juni: bijna nog leeg', preview: 'De wijnstreek tussen oogst en zomerdrukte is misschien wel de mooiste tijd…' },
        { issueNumber: '19', monthLabel: 'Mei 2025', title: 'Tien jaar oude Mosel-Riesling', preview: 'We openden een fles uit 2014 met de wijnmaker zelf. Wat we leerden over geduld…' },
    ].map((i) => ({
        slug: `issue-${i.issueNumber}`,
        issueNumber: i.issueNumber,
        title: i.title,
        monthLabel: i.monthLabel,
        publishDate: '',
        preview: i.preview,
        bodyHtml: '',
        heroImage: null,
        status: 'placeholder',
    }));
}

export async function loadNewsletterIssues(): Promise<NewsletterIssue[]> {
    const { url, token, cfClientId, cfClientSecret } = getDirectusConfig();
    if (url && token) {
        const items = await loadFromDirectus(url, token, cfClientId, cfClientSecret);
        if (items.length > 0) return items;
        console.warn(`[loadNewsletter] no items from Directus — falling back to placeholder content`);
    } else {
        console.warn(`[loadNewsletter] Directus not configured — using placeholder content`);
    }
    return getPlaceholderIssues();
}
