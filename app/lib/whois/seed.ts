/**
 * Seed map: TLD → WHOIS port-43 server.
 *
 * Used to skip the `whois.iana.org` discovery hop on cold starts for the
 * ~50 TLDs that account for >95% of registered domains. Discovery still
 * works for everything else and caches results in the DB.
 *
 * Empty string means "no WHOIS server exists" (registry doesn't run one).
 * Currently nothing is in that bucket — we let runtime discovery learn it.
 */

export const SEED_WHOIS_SERVERS: Record<string, string> = {
  // gTLDs
  com: "whois.verisign-grs.com",
  net: "whois.verisign-grs.com",
  org: "whois.publicinterestregistry.org",
  info: "whois.nic.info",
  biz: "whois.nic.biz",
  pro: "whois.nic.pro",
  name: "whois.nic.name",
  mobi: "whois.nic.mobi",

  // New gTLDs (popular)
  dev: "whois.nic.google",
  app: "whois.nic.google",
  page: "whois.nic.google",
  ai: "whois.nic.ai",
  io: "whois.nic.io",
  co: "whois.nic.co",
  me: "whois.nic.me",
  tv: "whois.nic.tv",
  cc: "ccwhois.verisign-grs.com",
  xyz: "whois.nic.xyz",
  online: "whois.nic.online",
  site: "whois.nic.site",
  store: "whois.nic.store",
  tech: "whois.nic.tech",
  shop: "whois.nic.shop",
  blog: "whois.nic.blog",
  cloud: "whois.nic.cloud",
  space: "whois.nic.space",
  club: "whois.nic.club",
  live: "whois.nic.live",
  world: "whois.nic.world",
  art: "whois.nic.art",
  vip: "whois.nic.vip",
  fun: "whois.nic.fun",
  host: "whois.nic.host",
  email: "whois.nic.email",
  life: "whois.nic.life",
  network: "whois.nic.network",
  business: "whois.nic.business",
  website: "whois.nic.website",
  solutions: "whois.nic.solutions",
  studio: "whois.nic.studio",
  agency: "whois.nic.agency",
  digital: "whois.nic.digital",
  media: "whois.nic.media",
  design: "whois.nic.design",

  // ccTLDs that lack RDAP — these are the critical gap fillers
  sh: "whois.nic.sh",
  ac: "whois.nic.ac",
  ws: "whois.nic.ws",
  to: "whois.tonic.to",
  ly: "whois.nic.ly",
  nu: "whois.iis.nu",

  // ccTLDs with both RDAP and WHOIS (we still keep for fallback)
  uk: "whois.nic.uk",
  us: "whois.nic.us",
  de: "whois.denic.de",
  fr: "whois.nic.fr",
  nl: "whois.domain-registry.nl",
  eu: "whois.eu",
  jp: "whois.jprs.jp",
  cn: "whois.cnnic.cn",
  in: "whois.registry.in",
  br: "whois.registro.br",
  ru: "whois.tcinet.ru",
  it: "whois.nic.it",
  es: "whois.nic.es",
  ch: "whois.nic.ch",
  at: "whois.nic.at",
  be: "whois.dns.be",
  se: "whois.iis.se",
  no: "whois.norid.no",
  dk: "whois.dk-hostmaster.dk",
  fi: "whois.fi",
  pl: "whois.dns.pl",
  cz: "whois.nic.cz",
  au: "whois.auda.org.au",
  ca: "whois.cira.ca",
  nz: "whois.srs.net.nz",
  mx: "whois.mx",
  ar: "whois.nic.ar",
  za: "whois.registry.net.za",
  kr: "whois.kr",
  hk: "whois.hkirc.hk",
  sg: "whois.sgnic.sg",
  tw: "whois.twnic.net.tw",
  ie: "whois.iedr.ie",
};
