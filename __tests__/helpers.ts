import { Testing } from "cdktn";
import { GandiProvider } from "../.gen/providers/gandi/provider";
import { BunnynetProvider } from "../.gen/providers/bunnynet/provider";
import * as dns from "../luffy/dns";
import type { ServerArray } from "../luffy/servers";

const server = (
  id: number,
  latitude: number,
  longitude: number,
  tags: string[] = []
): ServerArray[number] => ({
  name: `web0${id}.luffy.cx`,
  ipv4Address: `192.0.2.${id}`,
  ipv6Address: `2001:db8::${id}`,
  hardware: "test",
  tags: ["web-standard", "web-volume", ...tags],
  geo: { latitude, longitude },
});

export const servers: ServerArray = [
  server(2, 48.85, 2.35), // Paris
  server(3, 60.17, 24.94), // Helsinki
  server(4, 49.45, 11.08, ["dns"]), // Nuremberg
  server(5, 39.04, -77.49), // Ashburn
  server(6, 41.88, -87.63), // Chicago
];

/** Synthesize the DNS resources with the test servers. */
export const synthesizeDns = () =>
  Testing.synthScope((scope) => {
    const gandi = new GandiProvider(scope, "gandi", { key: "test" });
    const bunny = new BunnynetProvider(scope, "bunny", { apiKey: "test" });
    new dns.Resources(scope, servers, {
      gandiVB: gandi,
      gandiRB: gandi,
      bunny,
    });
  });
