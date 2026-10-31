import "cdktn/lib/testing/adapters/jest";
import * as vm from "vm";
import { DnsRecord } from "../.gen/providers/bunnynet/dns-record";
import { DnsZone } from "../.gen/providers/bunnynet/dns-zone";
import { servers, synthesizeDns } from "./helpers";

const synthesized = synthesizeDns();

describe("Bunny zone", () => {
  it("is signed", () => {
    expect(synthesized).toHaveResourceWithProperties(DnsZone, {
      domain: "vincentbernat.com",
      dnssec_enabled: true,
    });
  });

  it("splits MX records and removes the trailing dot", () => {
    expect(synthesized).toHaveResourceWithProperties(DnsRecord, {
      type: "MX",
      name: "",
      priority: 10,
      value: "in1-smtp.messagingengine.com",
    });
  });

  it("splits CAA records", () => {
    expect(synthesized).toHaveResourceWithProperties(DnsRecord, {
      type: "CAA",
      name: "",
      flags: 0,
      tag: "issue",
      value: "letsencrypt.org",
    });
  });

  it("splits SRV records and removes the trailing dot", () => {
    expect(synthesized).toHaveResourceWithProperties(DnsRecord, {
      type: "SRV",
      name: "_imaps._tcp",
      priority: 0,
      weight: 1,
      port: 993,
      value: "imap.fastmail.com",
    });
  });

  it("keeps null SRV targets", () => {
    expect(synthesized).toHaveResourceWithProperties(DnsRecord, {
      type: "SRV",
      name: "_imap._tcp",
      value: ".",
    });
  });

  it.each(["", "vincent", "media"])("uses a script for %p", (name) => {
    expect(synthesized).toHaveResourceWithProperties(DnsRecord, {
      type: "Script",
      name,
    });
  });

  it.each(["", "vincent", "media"])("has an HTTPS record for %p", (name) => {
    expect(synthesized).toHaveResourceWithProperties(DnsRecord, {
      type: "HTTPS",
      name,
      priority: 1,
      value: '. alpn="h3,h2"',
    });
  });
});

describe("deSEC zone", () => {
  const records = Object.values<any>(
    JSON.parse(synthesized).resource.desec_records
  ).find((r) => r.domain.includes("D-enxio_zone"));
  const rdata = (subname: string, type: string) =>
    records.rrsets.find((r: any) => r.subname === subname && r.type === type)
      ?.rdata;

  it("removes records not declared", () => {
    expect(records.exclusive).toBe(true);
  });

  it("removes quotes from HTTPS parameters", () => {
    expect(rdata("@", "HTTPS")).toEqual(["1 . alpn=h3,h2"]);
  });

  it("quotes TXT records", () => {
    expect(rdata("_dmarc", "TXT")).toEqual(['"v=DMARC1; p=reject; sp=reject"']);
  });

  it.each([
    [
      "MX",
      "@",
      ["10 in1-smtp.messagingengine.com.", "20 in2-smtp.messagingengine.com."],
    ],
    ["CAA", "@", ['0 issue "letsencrypt.org"', '0 issuewild ";"']],
    ["CNAME", "_acme-challenge", ["enx.io.acme.luffy.cx."]],
  ])("keeps %s records as is", (type, subname, expected) => {
    expect(rdata(subname, type)).toEqual(expected);
  });
});

describe("Sites output", () => {
  const sites = JSON.parse(synthesized).output.sites.value;

  it.each(["bernat.ch", "media.bernat.ch", "*.pages.luffy.cx"])(
    "lists web servers for %p",
    (site) => {
      expect(sites[site]).toEqual(servers.map((server) => server.name));
    }
  );
});

describe("Bunny geo script", () => {
  const scripts = Object.values<{ content: string }>(
    JSON.parse(synthesized).resource.bunnynet_dns_script
  );
  const paris = { latitude: 48.8, longitude: 2.3 };
  const newYork = { latitude: 40.7, longitude: -74 };
  const frankfurt = { latitude: 50.1, longitude: 8.7 };
  let down: string[];
  let runtime: Record<string, any>;

  // Mock of the Scriptable DNS runtime. Like Bunny, monitoring and routing
  // do not accept IPv6 addresses.
  const ipv4Only = (ip: string) => {
    if (ip.includes(":")) throw new Error("Operation not supported");
  };
  beforeEach(() => {
    down = [];
    runtime = {
      Server: class {
        constructor(
          public ip: string,
          public latitude: number,
          public longitude: number
        ) {}
      },
      ARecord: class {
        type = "A";
        constructor(public ip: string, public ttl: number) {}
      },
      AaaaRecord: class {
        type = "AAAA";
        constructor(public ip: string, public ttl: number) {}
      },
      Monitoring: {
        getStatus: (ip: string) => {
          ipv4Only(ip);
          return { isOnline: !down.includes(ip), latency: 1 };
        },
      },
      GeoDistance: {
        calculate: (
          a: { latitude: number; longitude: number },
          b: { latitude: number; longitude: number }
        ) => {
          const rad = (deg: number) => (deg * Math.PI) / 180;
          const h =
            Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
            Math.cos(rad(a.latitude)) *
              Math.cos(rad(b.latitude)) *
              Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
          return 2 * 3958.8 * Math.asin(Math.sqrt(h));
        },
      },
      RoutingEngine: {
        getClosestServer: (
          list: { ip: string; latitude: number; longitude: number }[],
          location: { latitude: number; longitude: number }
        ) => {
          list.forEach((s) => ipv4Only(s.ip));
          const distance = (s: { latitude: number; longitude: number }) =>
            Math.hypot(
              s.latitude - location.latitude,
              s.longitude - location.longitude
            );
          return [...list].sort((a, b) => distance(a) - distance(b))[0];
        },
      },
    };
  });

  const run = (queryType: string, geoLocation = paris) => {
    const code = scripts[0].content.replace(
      "export default function",
      "function"
    );
    const handleQuery = vm.runInNewContext(`${code}\nhandleQuery;`, {
      ...runtime,
    });
    return handleQuery({ request: { queryType, geoLocation } });
  };
  const query = (queryType: string, geoLocation = paris) =>
    run(queryType, geoLocation).map(
      (answer: { type: string; ip: string }) => `${answer.type} ${answer.ip}`
    );

  it("returns the two closest servers", () => {
    expect(query("A")).toEqual(["A 192.0.2.2", "A 192.0.2.4"]);
    expect(query("AAAA", newYork)).toEqual([
      "AAAA 2001:db8::5",
      "AAAA 2001:db8::6",
    ]);
  });

  it("uses the TTL of web records", () => {
    expect(run("A").map((answer: { ttl: number }) => answer.ttl)).toEqual([
      3600, 3600,
    ]);
  });

  it("returns only the closest server when the second one is far", () => {
    down = ["192.0.2.3", "192.0.2.4"];
    expect(run("A")).toEqual([
      expect.objectContaining({ ip: "192.0.2.2", ttl: 120 }),
    ]);
  });

  it("returns two servers when location is unknown", () => {
    expect(query("A", {} as typeof paris)).toHaveLength(2);
  });

  it("accepts any case for the query type", () => {
    expect(query("aaaa")).toEqual(["AAAA 2001:db8::2", "AAAA 2001:db8::4"]);
  });

  it("does not answer other query types", () => {
    expect(query("MX")).toEqual([]);
    expect(query("TXT")).toEqual([]);
  });

  it("skips servers that are down", () => {
    down = ["192.0.2.4"];
    expect(query("AAAA", frankfurt)).toEqual([
      "AAAA 2001:db8::2",
      "AAAA 2001:db8::3",
    ]);
  });

  it("completes with the closest servers that are down", () => {
    down = ["192.0.2.3", "192.0.2.4", "192.0.2.5", "192.0.2.6"];
    expect(query("A")).toEqual(["A 192.0.2.2", "A 192.0.2.4"]);
    down = servers.map((s) => s.ipv4Address!);
    expect(query("A")).toEqual(["A 192.0.2.2", "A 192.0.2.4"]);
  });

  it("returns all servers when monitoring fails", () => {
    runtime.Monitoring.getStatus = () => {
      throw new Error("monitoring is broken");
    };
    expect(query("A")).toHaveLength(servers.length);
  });

  it("returns all servers when routing fails", () => {
    runtime.RoutingEngine.getClosestServer = () => null;
    expect(query("AAAA")).toHaveLength(servers.length);
  });
});
