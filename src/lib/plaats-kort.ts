// LAT-13771 — CMS-`plaats` draagt soms een NL-toelichting tussen haakjes
// ("Hermanus (boven de Oude Haven)"). Voor filter en kaartmeta tonen we alleen
// de plaatsnaam: taalneutraal, en dezelfde waarde in optie en data-plaats.
export function plaatsKort(plaats: string | null | undefined): string {
  return (plaats ?? '').replace(/\s*[(,].*$/, '').trim();
}
