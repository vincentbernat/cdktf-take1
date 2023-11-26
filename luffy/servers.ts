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

class GenericServer extends Construct implements Server {
  constructor(
    scope: Construct,
    public readonly name: string,
    public readonly ipv4Address: string,
    public readonly ipv6Address: string,
    public readonly hardware: string
  ) {
    super(scope, name);
    this.name = name;
    this.ipv4Address = ipv4Address;
    this.ipv6Address = ipv6Address;
    this.hardware = hardware;
  }
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
    this.ipv6Address = Fn.cidrhost(
      Fn.format("%s/128", [this.server.v6MainIp]),
      0
    );
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

export type ServerArray = Array<
  Server & { tags: string[]; disabled?: boolean }
>;

export class Resources extends Construct {
  public readonly servers: ServerArray;
  constructor(
    scope: Construct,
    providers: { hcloud: HcloudProvider; vultr: VultrProvider }
  ) {
    super(scope, "luffy-servers");
    this.servers = [
      {
        server: new GenericServer(
          this,
          "web02.luffy.cx",
          "45.90.160.60",
          "2a0c:8881::948e:48ff:fe0d:d535",
          "sapinet"
        ),
        tags: [
          "web",
          "continent:EU",
          "continent:AF",
          "gateway4:45.90.160.33",
          "gateway6:fe80::200:ff:fe00:1",
        ],
      },
      {
        server: new HetznerServer(this, "web03.luffy.cx", providers.hcloud, {
          serverType: "cpx11",
          location: "hel1",
        }),
        tags: ["web", "isso", "continent:EU"],
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
    ].map(({ server, ...rest }) => ({
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
