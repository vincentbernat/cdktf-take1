import { synthesizeDns } from "./helpers";

// Compare the records of zones present on several providers. Gandi is the
// reference. Records are turned into the usual zone file syntax.

type RecordSet = { ttl: number; values: string[] };
type Zone = Record<string, RecordSet>; // key is "name type"

const resources = JSON.parse(synthesizeDns()).resource;
const records = (type: string): any[] => Object.values(resources[type] ?? {});
const zoneReference = (type: string, name: string, attribute: string) =>
  Object.entries<any>(resources[type] ?? {})
    .filter(([, zone]) => (zone.name ?? zone.domain) === name)
    .map(([id]) => `\${${type}.${id}.${attribute}}`)[0];

const add = (zone: Zone, key: string, ttl: number, values: string[]) => {
  const set = (zone[key] ??= { ttl, values: [] });
  if (set.ttl !== ttl) throw new Error(`${key}: different TTLs`);
  set.values = [...set.values, ...values].sort();
};

/** Gandi records. TXT values are wrapped in a formatlist() call. */
const gandi = (domain: string) => {
  const zone: Zone = {};
  for (const r of records("gandi_livedns_record")) {
    if (r.zone !== domain) continue;
    const values = Array.isArray(r.values)
      ? r.values
      : JSON.parse(r.values.match(/, (\[.*\])\)\}$/)[1]);
    add(zone, `${r.name} ${r.type}`, r.ttl, values);
  }
  return zone;
};

/** Bunny records. Names using a script are returned separately. */
const bunny = (domain: string) => {
  const zone: Zone = {};
  const scripted: Record<string, RecordSet> = {};
  const zoneId = zoneReference("bunnynet_dns_zone", domain, "id");
  const host = (value: string) => (value === "." ? "." : `${value}.`);
  for (const r of records("bunnynet_dns_record")) {
    if (r.zone !== zoneId) continue;
    const name = r.name === "" ? "@" : r.name;
    let value: string;
    switch (r.type) {
      case "Script":
        scripted[name] = { ttl: r.ttl, values: [r.value] };
        continue;
      case "MX":
        value = `${r.priority} ${host(r.value)}`;
        break;
      case "SRV":
        value = `${r.priority} ${r.weight} ${r.port} ${host(r.value)}`;
        break;
      case "HTTPS": {
        const [target, ...params] = r.value.split(" ");
        value = [r.priority, host(target), ...params].join(" ");
        break;
      }
      case "CAA":
        value = `${r.flags} ${r.tag} "${r.value}"`;
        break;
      case "CNAME":
      case "NS":
        value = host(r.value);
        break;
      case "PullZone": {
        // Gandi uses a CNAME to the b-cdn.net name
        const [, pullzone] = r.pullzone_id.match(/^\$\{(.*)\.id\}$/);
        add(zone, `${name} CNAME`, r.ttl, [
          `\${${pullzone}.name}.\${${pullzone}.cdn_domain}.`,
        ]);
        continue;
      }
      default:
        value = r.value;
    }
    add(zone, `${name} ${r.type}`, r.ttl, [value]);
  }
  return { zone, scripted };
};

/** Servers used by a Bunny script, from its content. */
const scriptServers = (id: string) => {
  const script = Object.entries<any>(resources.bunnynet_dns_script).find(
    ([name]) => id === `\${bunnynet_dns_script.${name}.id}`
  )![1];
  const servers: { ipv4: string; ipv6: string }[] = JSON.parse(
    script.content.match(/const servers = (\[[\s\S]*?\]);\n/)[1]
  );
  return {
    A: servers.map((s) => s.ipv4).sort(),
    AAAA: servers.map((s) => s.ipv6).sort(),
  };
};

const without = (zone: Zone, keys: string[]) =>
  Object.fromEntries(Object.entries(zone).filter(([k]) => !keys.includes(k)));

/** Gandi does not get HTTPS records. */
const withoutHttps = (zone: Zone) =>
  Object.fromEntries(
    Object.entries(zone).filter(([k]) => !k.endsWith(" HTTPS"))
  );

const domains = (type: string, attribute: string) =>
  records(type)
    .map((r) => r[attribute])
    .filter((d) => records("gandi_livedns_record").some((r) => r.zone === d));

describe.each(domains("bunnynet_dns_zone", "domain"))(
  "Bunny zone %s",
  (domain) => {
    const reference = gandi(domain);
    const { zone, scripted } = bunny(domain);
    const geoKeys = Object.keys(scripted).flatMap((name) => [
      `${name} A`,
      `${name} AAAA`,
    ]);

    it("has the same records as Gandi", () => {
      expect(withoutHttps(zone)).toEqual(without(reference, geoKeys));
    });

    it.each(Object.keys(scripted))(
      "has a script for %s matching Gandi",
      (name) => {
        const servers = scriptServers(scripted[name].values[0]);
        for (const type of ["A", "AAAA"] as const) {
          expect(scripted[name].ttl).toBe(reference[`${name} ${type}`].ttl);
          expect(servers[type]).toEqual(reference[`${name} ${type}`].values);
        }
      }
    );
  }
);

it("compares at least one zone of each provider", () => {
  expect(domains("bunnynet_dns_zone", "domain")).not.toHaveLength(0);
});
