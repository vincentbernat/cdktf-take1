import { Fn, TerraformOutput, Token } from "cdktn";
import type { ServerArray } from "./servers";
import { Construct } from "constructs";
import { GandiProvider } from "../.gen/providers/gandi/provider";
import { BunnynetProvider } from "../.gen/providers/bunnynet/provider";
import { DesecProvider } from "../.gen/providers/desec/provider";
import { DesecProviderFunctions } from "../.gen/providers/desec/provider-functions";
import * as gandi from "../.gen/providers/gandi";
import * as bunnynet from "../.gen/providers/bunnynet";
import * as desec from "../.gen/providers/desec";

const notdisabled = (servers: ServerArray) =>
  servers.filter((server) => !server.disabled);

/** Servers sharing the same role. */
type ServerGroup = { role: string; servers: ServerArray };

const RRTypes = [
  "A",
  "AAAA",
  "CAA",
  "CNAME",
  "DS",
  "HTTPS",
  "MX",
  "NS",
  "SRV",
  "TXT",
] as const;
const defaultTTL = 86400;

type RR = (typeof RRTypes)[number];

type Records = string[] | string;
type SigningKey = {
  publicKey: string;
  algorithm: number;
  dsRecord: string;
};
type CommonRecordOptions = {
  ttl: number;
};
type RecordOptions =
  | GandiRecordOptions
  | BunnyRecordOptions
  | DesecRecordOptions;
type GandiRecordOptions = Partial<CommonRecordOptions>;
type BunnyRecordOptions = Partial<CommonRecordOptions>;
type DesecRecordOptions = Partial<CommonRecordOptions>;

/**
 * Base class for a zone.
 */
abstract class BasicZone extends Construct {
  /** Create a record in the zone. */
  public abstract record(
    name: string,
    rrtype: RR,
    records: Records,
    options?: RecordOptions
  ): this;

  protected readonly name: string; // zone name

  constructor(scope: Construct, zoneName: string);
  constructor(scope: Construct, resourceName: string, zoneName: string);
  constructor(scope: Construct, zoneOrResourceName: string, zoneName?: string) {
    super(scope, zoneOrResourceName);
    this.name = zoneName === undefined ? zoneOrResourceName : zoneName;
  }

  A(name: string, records: Records, options?: RecordOptions) {
    return this.record(name, "A", records, options);
  }
  AAAA(name: string, records: Records, options?: RecordOptions) {
    return this.record(name, "AAAA", records, options);
  }
  CNAME(name: string, records: Records, options?: RecordOptions) {
    return this.record(name, "CNAME", records, options);
  }
  MX(name: string, records: Records, options?: RecordOptions) {
    return this.record(name, "MX", records, options);
  }
  NS(name: string, records: Records, options?: RecordOptions) {
    return this.record(name, "NS", records, options);
  }
  SRV(name: string, records: Records, options?: RecordOptions) {
    return this.record(name, "SRV", records, options);
  }
  TXT(name: string, records: Records, options?: RecordOptions) {
    return this.record(name, "TXT", records, options);
  }

  /** Create A/AAAA records to a selection of servers. */
  A_AAAA(name: string, servers: ServerArray, options?: RecordOptions) {
    (["A", "AAAA"] as const).forEach((rrtype) =>
      this[rrtype](
        name,
        servers
          .map((server) =>
            rrtype === "A" ? server.ipv4Address : server.ipv6Address
          )
          .filter((ip): ip is string => !!ip),
        options
      )
    );
    return this;
  }

  /** Setup MX for Fastmail. */
  fastmailMX(subdomains?: string[]) {
    // To receive emails
    (subdomains ?? [])
      .concat(["@", "*"])
      .forEach((d) =>
        this.MX(d, [
          "10 in1-smtp.messagingengine.com.",
          "20 in2-smtp.messagingengine.com.",
        ])
      );

    // To send emails
    (subdomains ?? [])
      .concat(["@"])
      .forEach((d) =>
        this.TXT(d, "v=spf1 include:spf.messagingengine.com -all")
      );
    ["mesmtp", "fm1", "fm2", "fm3"].forEach((dk) =>
      this.CNAME(`${dk}._domainkey`, `${dk}.${this.name}.dkim.fmhosted.com.`)
    );
    this.TXT("_dmarc", "v=DMARC1; p=reject; sp=reject"); // p = this domain, sp = subdomains
    return this;
  }

  /** Create service records for Fastmail. */
  fastmailServices() {
    this.SRV("_submission._tcp", "0 1 587 smtp.fastmail.com.");
    [
      ["imap", 993],
      ["carddav", 443],
      ["caldav", 443],
    ].forEach(([service, port]) => {
      this.SRV(`_${service}._tcp`, "0 0 0 .");
      this.SRV(`_${service}s._tcp`, `0 1 ${port} ${service}.fastmail.com.`);
    });
    return this;
  }

  /** Create records for web servers. */
  www(name: string, group: ServerGroup, options?: RecordOptions) {
    group = {
      ...group,
      servers: group.servers.filter(
        (server) =>
          server.tags.includes("web-standard") ||
          server.tags.includes("web-volume")
      ),
    };
    (this.node.scope as Resources).sites[
      name === "@" ? this.name : `${name}.${this.name}`
    ] = group.servers.map((server) => server.name);
    const web = (name: string) => {
      this.www_A_AAAA(name, group, { ...options, ttl: 60 * 60 });
      this.record(name, "HTTPS", '1 . alpn="h3,h2"', {
        ...options,
        ttl: 60 * 60,
      });
    };
    web(name);
    if (name === "@") {
      this.record(name, "CAA", [
        '0 issue "letsencrypt.org"',
        '0 issuewild ";"',
      ]);
      this.CNAME("_acme-challenge", `${this.name}.acme.luffy.cx.`);
    } else if (name.startsWith("*.")) {
      name = name.slice(2);
      web(name);
      this.record(name, "CAA", [
        '0 issue "letsencrypt.org"',
        '0 issuewild "letsencrypt.org"',
      ]);
      this.CNAME(
        `_acme-challenge.${name}`,
        `${name}.${this.name}.acme.luffy.cx.`
      );
    } else {
      this.record(name, "CAA", [
        '0 issue "letsencrypt.org"',
        '0 issuewild ";"',
      ]);
      this.CNAME(
        `_acme-challenge.${name}`,
        `${name}.${this.name}.acme.luffy.cx.`
      );
    }
    return this;
  }

  www_A_AAAA(name: string, group: ServerGroup, options?: RecordOptions) {
    return this.A_AAAA(name, notdisabled(group.servers), options);
  }

  /** Create A/AAAA records for server names if they match the domain. */
  servers(servers: ServerArray, options?: RecordOptions) {
    servers = servers.filter((server) => server.name.endsWith(`.${this.name}`));
    servers.forEach((server) =>
      this.A_AAAA(
        server.name.slice(0, -this.name.length - 1),
        [server],
        options
      )
    );
    return this;
  }
}

/** Propagate records to multiple zones. */
function MultiZone(...zones: Zone[]): BasicZone {
  const proxy = new Proxy(new Object(), {
    get(_, prop) {
      if (
        Object.getOwnPropertyNames(BasicZone.prototype).includes(
          prop.toString()
        )
      ) {
        return (...args: any[]) => {
          zones.forEach((zone) => {
            Reflect.get(zone, prop, zone).apply(zone, args);
          });
          return proxy;
        };
      }
      return undefined;
    },
  });
  return proxy as unknown as BasicZone;
}

/** A zone is the abstract construct for a real zone (one that can be registered). */
abstract class Zone extends BasicZone {
  /** Get nameservers for this zone. */
  public abstract get nameservers(): string[];
  /** KSK for this zone. */
  public ksk: SigningKey | null;

  constructor(scope: Construct, resourceName: string, zoneName: string);
  constructor(scope: Construct, resourceAndZoneName: string);
  constructor(scope: Construct, resourceOrZoneName: string, zoneName?: string) {
    super(scope, resourceOrZoneName, zoneName ?? resourceOrZoneName);
    this.ksk = null;
  }

  /** Register the zone to Gandi. */
  registrar(provider: GandiProvider, dnssec: boolean = true) {
    new gandi.nameservers.Nameservers(
      this.node.scope as Construct,
      `NS-${this.name}`,
      {
        domain: this.name,
        nameservers: this.nameservers,
        provider: provider,
      }
    );
    if (dnssec) this.registrarKey(provider);
    return this;
  }

  /** Publish the KSK of the zone to Gandi. */
  registrarKey(provider: GandiProvider) {
    if (!this.ksk) throw new Error(`${this.name} was not signed`);
    new gandi.dnssecKey.DnssecKey(this, "NSSEC", {
      domain: this.name,
      algorithm: this.ksk.algorithm,
      publicKey: this.ksk.publicKey,
      type: "ksk",
      provider: provider,
    });
    return this;
  }
}

class GandiZone extends Zone {
  constructor(
    scope: Construct,
    name: string,
    private readonly provider: GandiProvider
  ) {
    super(scope, `G-${name}`, name);
  }

  record(
    name: string,
    rrtype: RR,
    records: Records,
    options?: GandiRecordOptions
  ) {
    // Gandi does not accept "." as target
    if (rrtype === "HTTPS") return this;
    let providerOptions = {
      ttl: defaultTTL,
      ...options,
      provider: this.provider,
    };
    let values = Array.isArray(records) ? records : [records];
    if (rrtype === "TXT") values = Fn.formatlist('\\"%s\\"', [values]);
    new gandi.livednsRecord.LivednsRecord(this, `${rrtype}-${name}`, {
      zone: this.name,
      type: rrtype,
      name,
      values,
      ...providerOptions,
    });
    return this;
  }

  sign() {
    const ksk = new gandi.livednsKey.LivednsKey(this, "KSK", {
      domain: this.name,
      provider: this.provider,
    });
    this.ksk = {
      publicKey: ksk.publicKey,
      algorithm: ksk.algorithm,
      dsRecord: ksk.ds,
    };
    return this;
  }

  get nameservers() {
    const ns = new gandi.dataGandiLivednsDomainNs.DataGandiLivednsDomainNs(
      this,
      `LiveDNSNS`,
      { name: this.name, provider: this.provider }
    );
    return ns.nameservers;
  }
}

class BunnyZone extends Zone {
  // DS records are not supported by Bunny DNS
  public readonly zone: bunnynet.dnsZone.DnsZone;
  private readonly scripts: Record<string, bunnynet.dnsScript.DnsScript> = {};
  constructor(
    scope: Construct,
    name: string,
    private readonly provider: BunnynetProvider
  ) {
    super(scope, `B-${name}`, name);
    this.zone = new bunnynet.dnsZone.DnsZone(this, "zone", {
      domain: name,
      provider: this.provider,
    });
  }

  record(
    name: string,
    rrtype: RR,
    records: Records,
    options?: BunnyRecordOptions
  ) {
    if (rrtype === "DS") throw new Error(`${rrtype} not supported by Bunny`);
    if (!Array.isArray(records)) records = [records];
    if (Token.isUnresolved(records))
      throw new Error(`${rrtype} ${name}: records cannot be a token list`);
    const fqdn = (value: string) =>
      value !== "." && value.endsWith(".") ? value.slice(0, -1) : value;
    records.forEach((record, idx) => {
      let fields = {};
      switch (rrtype) {
        case "MX": {
          const [priority, value] = record.split(" ");
          fields = { priority: Number(priority), value: fqdn(value) };
          break;
        }
        case "SRV": {
          const [priority, weight, port, value] = record.split(" ");
          fields = {
            priority: Number(priority),
            weight: Number(weight),
            port: Number(port),
            value: fqdn(value),
          };
          break;
        }
        case "HTTPS": {
          const [priority, target, ...params] = record.split(" ");
          fields = {
            priority: Number(priority),
            value: [fqdn(target), ...params].join(" "),
          };
          break;
        }
        case "CAA": {
          const [, flags, tag, value] = record.match(/^(\d+) (\S+) "(.*)"$/)!;
          fields = { flags: Number(flags), tag, value };
          break;
        }
        case "CNAME":
        case "NS":
          fields = { value: fqdn(record) };
          break;
        default:
          fields = { value: record };
      }
      new bunnynet.dnsRecord.DnsRecord(this, `${rrtype}-${name}-${idx}`, {
        zone: this.zone.id,
        type: rrtype,
        name: name === "@" ? "" : name,
        ttl: options?.ttl ?? defaultTTL,
        value: "",
        ...fields,
        provider: this.provider,
      });
    });
    return this;
  }

  // Use a script to return the closest online server
  www_A_AAAA(name: string, group: ServerGroup, options?: RecordOptions) {
    const key = group.role;
    const servers = notdisabled(group.servers);
    if (servers.length <= 1) {
      return this.A_AAAA(name, servers, options);
    }
    const ttl = options?.ttl ?? defaultTTL;
    if (!(key in this.scripts)) {
      const serverList = servers.map((server) => ({
        ipv4: server.ipv4Address,
        ipv6: server.ipv6Address,
        ...server.geo,
      }));
      this.scripts[key] = new bunnynet.dnsScript.DnsScript(
        this,
        `script-${key}`,
        {
          name: `${this.name}-${key}`,
          content: `
const servers = ${JSON.stringify(serverList, null, 2)};
const families = { A: "ipv4", AAAA: "ipv6" };
const answers = {
  A: (ip, ttl = ${ttl}) => new ARecord(ip, ttl),
  AAAA: (ip, ttl = ${ttl}) => new AaaaRecord(ip, ttl),
};

export default function handleQuery(query) {
  const type = String(query.request.queryType).toUpperCase();
  const family = families[type];
  const available = servers.filter((s) => s[family]);
  if (available.length === 0) return [];
  try {
    // Routing and monitoring only work with IPv4 addresses: select servers
    // using their IPv4 address, then answer with the requested family.
    const byIpv4 = {};
    const online = [];
    const offline = [];
    for (const s of available) {
      if (!s.ipv4) continue;
      const server = new Server(s.ipv4, s.latitude, s.longitude, 100);
      byIpv4[s.ipv4] = s;
      if (Monitoring.getStatus(s.ipv4).isOnline) online.push(server);
      else offline.push(server);
    }
    const location = query.request.geoLocation;
    const selected = [];
    const pick = (list) => {
      let candidates = list;
      while (selected.length < 2 && candidates.length > 0) {
        const server = RoutingEngine.getClosestServer(
          candidates,
          location,
          false
        );
        selected.push(server);
        candidates = candidates.filter((s) => s.ip !== server.ip);
      }
    };
    // Prefer online candidates, but fallback to anything if not online.
    pick(online);
    pick(offline);
    // When the second server is far away (more than double _and_ more than 1000 miles
    // away), only return the closest one with a short TTL.
    if (selected.length === 2) {
      const [first, second] = selected.map((s) =>
        GeoDistance.calculate(s, location)
      );
      if (second > 2 * first && second - first > 1000) {
        return [answers[type](byIpv4[selected[0].ip][family], 300)];
      }
    }
    return selected.map((s) => answers[type](byIpv4[s.ip][family]));
  } catch (e) {
    // Return all servers if anything goes wrong
    return available.map((s) => answers[type](s[family]));
  }
}
`,
          provider: this.provider,
        }
      );
    }
    new bunnynet.dnsRecord.DnsRecord(this, `Script-${name}`, {
      zone: this.zone.id,
      type: "Script",
      name: name === "@" ? "" : name,
      ttl,
      value: Token.asString(this.scripts[key].id),
      provider: this.provider,
    });
    return this;
  }

  sign() {
    this.zone.dnssecEnabled = true;
    this.ksk = {
      publicKey: this.zone.dnssecPublicKey,
      algorithm: this.zone.dnssecAlgorithm,
      dsRecord: Fn.format("%d %d %d %s", [
        this.zone.dnssecKeytag,
        this.zone.dnssecAlgorithm,
        this.zone.dnssecDigestType,
        this.zone.dnssecDigest,
      ]),
    };
    return this;
  }

  get nameservers() {
    return [this.zone.nameserver1, this.zone.nameserver2];
  }
}

class DesecZone extends Zone {
  public readonly zone: desec.domain.Domain;
  constructor(
    scope: Construct,
    name: string,
    private readonly provider: DesecProvider
  ) {
    super(scope, `D-${name}`, name);
    this.zone = new desec.domain.Domain(this, "zone", {
      name,
      provider: this.provider,
    });
  }

  record(
    name: string,
    rrtype: RR,
    records: Records,
    options?: DesecRecordOptions
  ) {
    if (!Array.isArray(records)) records = [records];
    if (Token.isUnresolved(records))
      throw new Error(`${rrtype} ${name}: records cannot be a token list`);
    // TXT strings are quoted and cut into 255-byte chunks
    if (rrtype === "TXT")
      records = records.map((record) =>
        (record.match(/.{1,255}/g) ?? [""]).map((s) => `"${s}"`).join(" ")
      );
    // deSEC returns HTTPS parameters without quotes when they are not needed
    if (rrtype === "HTTPS")
      records = records.map((record) =>
        record.replace(/="([^"\s\\]*)"/g, "=$1")
      );
    new desec.rrset.Rrset(this, `${rrtype}-${name}`, {
      domain: this.zone.name,
      subname: name,
      type: rrtype,
      ttl: options?.ttl ?? defaultTTL,
      rdata: records,
      provider: this.provider,
    });
    return this;
  }

  // deSEC always signs zones
  sign() {
    const key = this.zone.keys.get(0);
    const dnskey = new DesecProviderFunctions("desec").parseDnskey(key.dnskey);
    this.ksk = {
      publicKey: Token.asString(Fn.lookup(dnskey, "public_key")),
      algorithm: Token.asNumber(Fn.lookup(dnskey, "algorithm")),
      dsRecord: Fn.element(key.ds, 0),
    };
    return this;
  }

  get nameservers() {
    return ["ns1.desec.io", "ns2.desec.org"];
  }
}

export class Resources extends Construct {
  /** Servers to deploy each website to. */
  public readonly sites: Record<string, string[]> = {};

  constructor(
    scope: Construct,
    servers: ServerArray,
    providers: {
      gandiRB: GandiProvider;
      gandiVB: GandiProvider;
      bunny: BunnynetProvider;
      desec: DesecProvider;
    }
  ) {
    super(scope, "luffy-dns");
    const byTag = (tag: string): ServerGroup => ({
      role: tag,
      servers: servers.filter((server) => server.tags.includes(tag)),
    });
    const standardServers = byTag("web-standard");
    const volumeServers = byTag("web-volume");

    // enxio.fr on deSEC, backup on Gandi. enx.io on Gandi.
    MultiZone(
      new GandiZone(this, "enxio.fr", providers.gandiVB)
        .sign()
        .registrarKey(providers.gandiVB),
      new DesecZone(this, "enxio.fr", providers.desec)
        .sign()
        .registrar(providers.gandiVB),
      new GandiZone(this, "enx.io", providers.gandiVB)
        .sign()
        .registrar(providers.gandiVB)
    )
      .www("@", standardServers)
      .www("www", standardServers)
      .www("media", standardServers)
      .fastmailMX();

    // le-val-insolite.fr (on Gandi)
    new GandiZone(this, "le-val-insolite.fr", providers.gandiVB)
      .sign()
      .registrar(providers.gandiVB)
      .www("@", standardServers)
      .www("www", standardServers)
      .MX("@", ["10 spool.mail.gandi.net.", "50 fb.mail.gandi.net."]);

    // une-oasis-une-ecole.fr (on Gandi)
    new GandiZone(this, "une-oasis-une-ecole.fr", providers.gandiRB)
      .sign()
      .registrar(providers.gandiRB)
      .www("@", standardServers)
      .www("www", standardServers)
      .www("media", standardServers)
      .MX("@", ["10 spool.mail.gandi.net.", "50 fb.mail.gandi.net."])
      .TXT("@", [
        "google-site-verification=_GFUTYZ19KcdCDA26QfZI_w3oWDJoQyD5GyZ6a-ieh8",
        "v=spf1 include:_mailcust.gandi.net include:spf.mailjet.com ?all",
      ])
      .TXT(
        "mailjet._domainkey",
        "k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDWsJlP6+qLJS/RLvoNrMPRPrfzcQAuvZ1vUIJkqGauJ23zowQ9ni44XqzYyiBPx00c0QCQhO7oBEhnTeVGMcIfzNASeofZDfiu2dk7iOARpBeKT+EPJtXKS8cW0nz6cusANW7Mxa1Or1sUeV5+J0jFSAmeqWjginJPHJri7ZDA6QIDAQAB"
      );

    // vincentbernat.com, on Bunny, backup on Gandi
    MultiZone(
      new GandiZone(this, "vincentbernat.com", providers.gandiVB).sign(),
      new BunnyZone(this, "vincentbernat.com", providers.bunny)
        .sign()
        .registrar(providers.gandiVB)
    )
      .www("@", standardServers)
      .www("www", standardServers)
      .fastmailMX();

    // bernat.im (not signed), on Bunny, backup on Gandi
    MultiZone(
      new GandiZone(this, "bernat.im", providers.gandiVB),
      new BunnyZone(this, "bernat.im", providers.bunny).registrar(
        providers.gandiVB,
        false
      )
    )
      .www("@", standardServers)
      .www("vincent", standardServers)
      .fastmailMX();

    // bernat.ch, on Bunny, backup on Gandi
    MultiZone(
      new GandiZone(this, "bernat.ch", providers.gandiVB).sign(),
      new BunnyZone(this, "bernat.ch", providers.bunny)
        .sign()
        .registrar(providers.gandiVB)
    )
      .www("@", standardServers)
      .www("vincent", standardServers)
      .www("media", standardServers)
      .CNAME("4unklrhyt7lw.vincent", "gv-qcgpdhlvhtgedt.dv.googlehosted.com.")
      .fastmailMX(["vincent"])
      .fastmailServices();

    // luffy.cx, on Gandi
    const dnsServers = servers.filter((server) => server.tags.includes("dns"));
    new GandiZone(this, "luffy.cx", providers.gandiVB)
      .sign()
      .registrar(providers.gandiVB)
      .fastmailMX()
      .www("@", standardServers)
      .www("www", standardServers)
      .www("haproxy", volumeServers)
      .www("*.pages", standardServers)
      .www("*.ssh", byTag("http-over-ssh"))
      .servers(servers)
      .CNAME("eizo", "eizo.y.luffy.cx.")
      .CNAME("nsupdate", `${dnsServers[0].name}.`)
      .www("comments", byTag("isso"))
      .www("goatcounter", byTag("goatcounter"))
      .NS(
        "y",
        dnsServers.map((server) => `${server.name}.`)
      )
      .NS(
        "acme",
        dnsServers.map((server) => `${server.name}.`)
      )
      .record("y", "DS", [
        "52941 13 2 3CBA38598E16FF9B4F7BA73D783C0F8250A0F4CABD64D8F467838732F8D8988E",
      ])
      .record("acme", "DS", [
        "55628 13 2 4946E7508F20E15F1B577A231104B029A1A82E04699A80CD46ADCE31227EE81F",
      ]);

    new TerraformOutput(this, "sites", {
      value: this.sites,
      staticId: true,
    });
  }
}
