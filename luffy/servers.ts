import { Fn, TerraformOutput } from "cdktf";
import { Construct } from "constructs";
import { HcloudProvider } from "../.gen/providers/hcloud/provider";
import { VultrProvider } from "../.gen/providers/vultr/provider";
import * as hcloud from "../.gen/providers/hcloud";
import * as vultr from "../.gen/providers/vultr";

/* Abstraction for a server. */
interface Server {
  readonly name: string;
  readonly ipv4Address: string | null;
  readonly ipv6Address: string | null;
  readonly hardware: string;
}

class HetznerServer extends Construct implements Server {
  private server: hcloud.server.Server;
  public readonly ipv4Address: string;
  public readonly ipv6Address: string;
  public readonly hardware = "hetzner";

  constructor(
    scope: Construct,
    public readonly name: string,
    provider: HcloudProvider,
    config: Pick<
      hcloud.server.ServerConfig,
      "serverType" | "location" | "image"
    >
  ) {
    super(scope, name);
    this.server = new hcloud.server.Server(this, name, {
      name,
      rebuildProtection: true,
      deleteProtection: true,
      ...config,
      provider,
    });
    this.name = name;
    this.ipv4Address = this.server.ipv4Address;
    this.ipv6Address = this.server.ipv6Address;
    new hcloud.rdns.Rdns(this, `rdns4-${name}`, {
      serverId: Fn.tonumber(this.server.id),
      ipAddress: this.server.ipv4Address,
      dnsPtr: name,
      provider,
    });
    new hcloud.rdns.Rdns(this, `rdns6-${name}`, {
      serverId: Fn.tonumber(this.server.id),
      ipAddress: this.server.ipv6Address,
      dnsPtr: name,
      provider,
    });
  }
}

class VultrServer extends Construct implements Server {
  private server: vultr.instance.Instance;
  public readonly ipv4Address: string;
  public readonly ipv6Address: string;
  public readonly hardware = "vultr";

  constructor(
    scope: Construct,
    public readonly name: string,
    provider: VultrProvider,
    config: Pick<vultr.instance.InstanceConfig, "plan" | "region">
  ) {
    super(scope, name);
    this.server = new vultr.instance.Instance(this, name, {
      hostname: name,
      ddosProtection: false,
      ...config,
      provider,
    });
    this.ipv4Address = this.server.mainIp;
    this.ipv6Address = this.server.v6MainIp;
    new vultr.reverseIpv4.ReverseIpv4(this, `rdns4-${name}`, {
      instanceId: this.server.id,
      ip: this.server.mainIp,
      reverse: name,
    });
    new vultr.reverseIpv6.ReverseIpv6(this, `rdns6-${name}`, {
      instanceId: this.server.id,
      ip: this.server.v6MainIp,
      reverse: name,
    });
  }
}

export class Resources extends Construct {
  public readonly servers: Array<Server & { tags: string[] }>;
  constructor(
    scope: Construct,
    providers: { hcloud: HcloudProvider; vultr: VultrProvider }
  ) {
    super(scope, "luffy-servers");
    this.servers = (
      [
        {
          server: new HetznerServer(this, "web03.luffy.cx", providers.hcloud, {
            serverType: "cpx11",
            location: "hel1",
          }),
          tags: ["web", "isso", "continent:EU", "continent:AF"],
        },
        {
          server: new HetznerServer(this, "web04.luffy.cx", providers.hcloud, {
            serverType: "cpx11",
            location: "nbg1",
          }),
          tags: ["web", "continent:EU", "continent:AF"],
        },
        {
          server: new HetznerServer(this, "web05.luffy.cx", providers.hcloud, {
            serverType: "cpx11",
            location: "ash",
            image: "39644359",
          }),
          tags: ["web", "continent:NA", "continent:SA"],
        },
        {
          server: new VultrServer(this, "web06.luffy.cx", providers.vultr, {
            plan: "vc2-1c-1gb",
            region: "ord",
          }),
          tags: ["web", "continent:NA", "continent:SA"],
        },
      ] as Array<{ server: Server; tags: string[] }>
    ).map(({ server, ...rest }) => ({
      ...(({ name, ipv4Address, ipv6Address, hardware }) => ({
        name,
        ipv4Address,
        ipv6Address,
        hardware,
      }))(server),
      ...rest,
    }));
    new TerraformOutput(this, "servers", {
      value: this.servers,
      staticId: true,
    });
  }
}
