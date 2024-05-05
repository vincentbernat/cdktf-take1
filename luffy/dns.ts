import { Fn, TerraformOutput } from "cdktf";
import type { ServerArray } from "./servers";
import type { Resources as KMSResources } from "./kms";
import { Construct } from "constructs";
import { AwsProvider } from "../.gen/providers/aws/provider";
import { GandiProvider } from "../.gen/providers/gandi/provider";
import * as gandi from "../.gen/providers/gandi";
import * as aws from "../.gen/providers/aws";

const RRTypes = [
  "A",
  "AAAA",
  "CAA",
  "CNAME",
  "DS",
  "MX",
  "NS",
  "SRV",
  "TXT",
] as const;
const defaultTTL = 86400;

type RR = typeof RRTypes[number];

type Records = string[] | string;
type SigningKey = {
  publicKey: string;
  algorithm: number;
  dsRecord: string;
};
type CommonRecordOptions = {
  ttl: number;
};
type RecordOptions = GandiRecordOptions | Route53RecordOptions;
type GandiRecordOptions = Partial<CommonRecordOptions>;
type Route53RecordOptions = Partial<
  CommonRecordOptions &
    Pick<
      aws.route53Record.Route53RecordConfig,
      "setIdentifier" | "geolocationRoutingPolicy"
    >
>;

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
    (subdomains ?? [])
      .concat(["@", "*"])
      .forEach((subdomain) =>
        this.MX(subdomain, [
          "10 in1-smtp.messagingengine.com.",
          "20 in2-smtp.messagingengine.com.",
        ])
      );
    this.TXT("@", "v=spf1 include:spf.messagingengine.com ~all");
    ["mesmtp", "fm1", "fm2", "fm3"].forEach((dk) =>
      this.CNAME(`${dk}._domainkey`, `${dk}.${this.name}.dkim.fmhosted.com.`)
    );
    this.TXT("_dmarc", "v=DMARC1; p=none; sp=none");
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
  www(name: string, servers: ServerArray, options?: RecordOptions) {
    // Only keep non-disabled web servers.
    servers = servers.filter(
      (server) => !server.disabled && server.tags.includes("web")
    );
    this.www_A_AAAA(name, servers, { ...options, ttl: 60 * 60 * 2 });
    if (name === "@") {
      this.record(name, "CAA", [
        '0 issue "letsencrypt.org"',
        '0 issuewild ";"',
      ]);
      this.CNAME("_acme-challenge", `${this.name}.acme.luffy.cx.`);
    } else if (name.startsWith("*.")) {
      name = name.slice(2);
      this.record(name, "CAA", [
        '0 issue "letsencrypt.org"',
        '0 issuewild "letsencrypt"',
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

  www_A_AAAA(name: string, servers: ServerArray, options?: RecordOptions) {
    return this.A_AAAA(name, servers, options);
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
    new gandi.nameservers.Nameservers(this, "NS", {
      domain: this.name,
      nameservers: this.nameservers,
      provider: provider,
    });
    if (dnssec) {
      if (!this.ksk) throw new Error(`${this.name} was not signed`);
      new gandi.dnssecKey.DnssecKey(this, "NSSEC", {
        domain: this.name,
        algorithm: this.ksk.algorithm,
        publicKey: this.ksk.publicKey,
        type: "ksk",
        provider: provider,
      });
    }
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
    let providerOptions = {
      ttl: defaultTTL,
      ...options,
      provider: this.provider,
    };
    if (!Array.isArray(records)) records = [records];
    if (rrtype === "TXT") records = Fn.formatlist('\\"%s\\"', [records]);
    new gandi.livednsRecord.LivednsRecord(this, `${rrtype}-${name}`, {
      zone: this.name,
      type: rrtype,
      name,
      values: records,
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

class Route53Zone extends Zone {
  public readonly zone: aws.route53Zone.Route53Zone;
  constructor(
    scope: Construct,
    name: string,
    private readonly provider: AwsProvider
  ) {
    super(scope, `R53-${name}`, name);
    this.zone = new aws.route53Zone.Route53Zone(this, "zone", {
      name: name,
      provider: this.provider,
    });
  }

  record(
    name: string,
    rrtype: RR,
    records: Records,
    options?: Route53RecordOptions
  ) {
    let providerOptions = {
      ttl: defaultTTL,
      ...options,
      provider: this.provider,
    };
    if (!Array.isArray(records)) records = [records];
    const rname = name === "@" ? this.name : `${name}.${this.name}`;
    new aws.route53Record.Route53Record(
      this,
      options?.setIdentifier
        ? `${rrtype}-${options.setIdentifier}-${name}`
        : `${rrtype}-${name}`,
      {
        zoneId: this.zone.zoneId,
        type: rrtype,
        name: rname,
        records,
        ...providerOptions,
      }
    );
    return this;
  }

  // Use geolocation tags
  www_A_AAAA(name: string, servers: ServerArray, options?: RecordOptions) {
    const geotags = ["continent", "country", "subdivision"] as const;
    const rrs = servers.reduce<Record<string, ServerArray>>(
      (acc, server) =>
        server.tags.reduce<Record<string, ServerArray>>((acc, tag) => {
          if (!geotags.some((g) => tag.startsWith(g))) return acc;
          if (!(tag in acc)) {
            return {
              ...acc,
              [tag]: [server],
            };
          }
          return {
            ...acc,
            [tag]: [...acc[tag], server],
          };
        }, acc),
      {
        "country:*": servers,
      }
    );
    for (const rr in rrs) {
      const [geotag, value] = rr.split(":");
      this.A_AAAA(name, rrs[rr], {
        ...options,
        setIdentifier: `geo-${geotag}-${value}`,
        geolocationRoutingPolicy: [
          {
            [geotag]: value,
          },
        ],
      });
    }
    return this;
  }

  sign(dnsCMK: aws.kmsAlias.KmsAlias) {
    const ksk = new aws.route53KeySigningKey.Route53KeySigningKey(this, `KSK`, {
      hostedZoneId: this.zone.zoneId,
      keyManagementServiceArn: dnsCMK.targetKeyArn,
      name: this.name.replace(/[^0-9a-zA-Z]/g, ""),
      status: "ACTIVE",
      provider: this.provider,
    });
    new aws.route53HostedZoneDnssec.Route53HostedZoneDnssec(this, `DNSSEC`, {
      hostedZoneId: this.zone.zoneId,
      signingStatus: "SIGNING",
      provider: this.provider,
      dependsOn: [ksk],
    });
    this.ksk = {
      publicKey: ksk.publicKey,
      algorithm: ksk.signingAlgorithmType,
      dsRecord: ksk.dsRecord,
    };
    return this;
  }

  get nameservers() {
    return this.zone.nameServers;
  }

  allowUser(username: string) {
    const user = new aws.iamUser.IamUser(this, `IAM-${username}`, {
      name: username,
      path: "/",
    });
    new aws.iamUserPolicy.IamUserPolicy(this, `IAM-${username}-policy`, {
      name: `AmazonRoute53-${this.name}-FullAccess`,
      policy: Fn.jsonencode({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "route53:GetChange",
              "route53:ChangeResourceRecordSets",
              "route53:ListResourceRecordSets",
            ],
            Resource: ["arn:aws:route53:::change/*", this.zone.arn],
          },
          {
            Effect: "Allow",
            Action: ["route53:ListHostedZones"],
            Resource: "*",
          },
        ],
      }),
      user: user.id,
    });
    return this;
  }
}

export class Resources extends Construct {
  constructor(
    scope: Construct,
    servers: ServerArray,
    providers: {
      aws: AwsProvider;
      gandiRB: GandiProvider;
      gandiVB: GandiProvider;
    },
    awsKMS: KMSResources
  ) {
    super(scope, "luffy-dns");

    /* Create an alias for DNS CMK. */
    const dnsCMK = new aws.kmsAlias.KmsAlias(this, "dns-cmk", {
      name: "alias/dns-cmk",
      targetKeyId: awsKMS.key.keyId,
      provider: providers.aws,
    });

    // enxio.fr/enx.io (on Gandi)
    MultiZone(
      new GandiZone(this, "enxio.fr", providers.gandiVB)
        .sign()
        .registrar(providers.gandiVB),
      new GandiZone(this, "enx.io", providers.gandiVB)
        .sign()
        .registrar(providers.gandiVB)
    )
      .www("@", servers)
      .www("www", servers)
      .www("media", servers)
      .fastmailMX();

    // une-oasis-une-ecole.fr (on Gandi)
    new GandiZone(this, "une-oasis-une-ecole.fr", providers.gandiRB)
      .sign()
      .registrar(providers.gandiRB)
      .www("@", servers)
      .www("www", servers)
      .www("media", servers)
      .MX("@", ["10 spool.mail.gandi.net.", "50 fb.mail.gandi.net."])
      .TXT("@", [
        "google-site-verification=_GFUTYZ19KcdCDA26QfZI_w3oWDJoQyD5GyZ6a-ieh8",
        "v=spf1 include:_mailcust.gandi.net include:spf.mailjet.com ?all",
      ])
      .TXT(
        "mailjet._domainkey",
        "k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDWsJlP6+qLJS/RLvoNrMPRPrfzcQAuvZ1vUIJkqGauJ23zowQ9ni44XqzYyiBPx00c0QCQhO7oBEhnTeVGMcIfzNASeofZDfiu2dk7iOARpBeKT+EPJtXKS8cW0nz6cusANW7Mxa1Or1sUeV5+J0jFSAmeqWjginJPHJri7ZDA6QIDAQAB"
      );

    // bernat.im (not signed), on Route53, backup on Gandi
    MultiZone(
      new Route53Zone(this, "bernat.im", providers.aws).registrar(
        providers.gandiVB,
        false
      ),
      new GandiZone(this, "bernat.im", providers.gandiVB)
    )
      .www("@", servers)
      .www("vincent", servers)
      .fastmailMX();

    // bernat.ch, on Route 53, backup on Gandi
    MultiZone(
      new Route53Zone(this, "bernat.ch", providers.aws)
        .sign(dnsCMK)
        .registrar(providers.gandiVB),
      new GandiZone(this, "bernat.ch", providers.gandiVB).sign()
    )
      .www("@", servers)
      .www("vincent", servers)
      .www("media", servers)
      .CNAME("4unklrhyt7lw.vincent", "gv-qcgpdhlvhtgedt.dv.googlehosted.com.")
      .fastmailMX(["vincent"])
      .fastmailServices();

    // y.luffy.cx (DDNS), on Route53
    let yLuffyCX = new Route53Zone(this, "y.luffy.cx", providers.aws)
      .sign(dnsCMK)
      .allowUser("DDNS");

    // acme.luffy.cx (ACME DNS-01 challenges), on Route53
    let acmeLuffyCX = new Route53Zone(this, "acme.luffy.cx", providers.aws)
      .sign(dnsCMK)
      .allowUser("ACME");

    // luffy.cx, on Gandi
    new GandiZone(this, "luffy.cx", providers.gandiVB)
      .sign()
      .registrar(providers.gandiVB)
      .fastmailMX()
      .www("@", servers)
      .www("media", servers)
      .www("www", servers)
      .www("haproxy", servers)
      .www("insolites-en-mene", servers)
      .www("*.pages", servers)
      .servers(servers)
      .CNAME("eizo", "eizo.y.luffy.cx.")
      .A_AAAA(
        "comments",
        servers.filter((server) => server.tags.includes("isso"), {
          ttl: 60 * 60 * 2,
        })
      )
      .NS("y", Fn.formatlist("%s.", [yLuffyCX.nameservers]))
      .record("y", "DS", [yLuffyCX.ksk!.dsRecord])
      .NS("acme", Fn.formatlist("%s.", [acmeLuffyCX.nameservers]))
      .record("acme", "DS", [acmeLuffyCX.ksk!.dsRecord]);

    new TerraformOutput(this, "acme-zone", {
      value: acmeLuffyCX.zone.zoneId,
      staticId: true,
    });
  }
}
