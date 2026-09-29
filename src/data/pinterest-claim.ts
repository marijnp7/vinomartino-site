/**
 * LAT-11988: verificatiecode voor het claimen van vinomartino.com op Pinterest.
 * Pinterest genereert de code in het bedrijfsaccount (Instellingen, Geclaimde
 * accounts, website, HTML-tag). Leeg = geen tag in de head. Alleen de waarde van
 * `content` van `<meta name="p:domain_verify">` hier neerzetten.
 */
export const PINTEREST_DOMAIN_VERIFY = '861483c26151829e3cbd7a82022b217c';
