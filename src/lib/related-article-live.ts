// LAT-12046: een related-kaart naar een artikel mag alleen bestaan als de
// paginabuild dat artikel ook genereert. loadArticles() slaat artikelen met
// pub_date > $NOW over (LAT-1053); deze guard past dezelfde regel toe op de
// junctie-rijen van streek/wijnhuis/route/land. `status`/`pub_date` ontbreken
// zodra de loader naar een lagere veld-tier degradeert: dan fail-open.
export function isRelatedArticleLive(article: Record<string, unknown>, now: number = Date.now()): boolean {
    if (article.status && String(article.status) !== 'published') return false;
    if (article.pub_date) {
        const t = Date.parse(String(article.pub_date));
        if (Number.isFinite(t) && t > now) return false;
    }
    return true;
}
