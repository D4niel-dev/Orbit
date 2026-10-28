# Security Policy

## Supported Versions (v0.3.x >=)

Orbit is in beta. Security fixes are issued for the **latest release and the one
immediately prior**. Anything older is not maintained.

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Previous release | ✅ |
| Anything older | ❌ |

See [CHANGELOG.md](CHANGELOG.md) for the current version.

## Reporting a Vulnerability

If you discover a security vulnerability in Orbit, please report it privately.

**Do not** open a public GitHub issue. Instead, email **orbit.support.real@gmail.com**

Please include the version, platform, and steps to reproduce if you can. If you
would like to encrypt your report, use the PGP key in [`security/`](security/).

You can expect an acknowledgement within 48 hours and a detailed response within 5 business days.

## Release Verification

All official Orbit releases include:
- `SHA256SUMS.txt` — checksums of every release artifact
- `SHA256SUMS.txt.sig` — GPG signature of the checksums file

See [security/README.md](security/README.md) for full verification instructions.

## NAT Traversal: What the Relay Sees

Orbit's internet path uses a **signalling relay** to introduce two peers, then a direct
peer-to-peer WebRTC connection. The relay's role is deliberately narrow, and the security
properties follow from where the encryption sits.

**What the relay carries.** SDP and ICE candidates only — the information two peers need to
find each other. It is not a message path. Once the DataChannel is open, both sides stop
talking to it.

**What the relay can see.** Which two IP addresses are pairing, when, and how much
signalling traffic passes. That is unavoidable for anything that introduces two peers, and
it is why the relay URL is a setting rather than a hard-coded default: you decide who, if
anyone, gets to see that.

**What the relay cannot see.** Message content, attachments, contact names, or your identity
keys. End-to-end encryption sits **above** the transport, so every packet is already
ciphertext before the relay — or the DataChannel — sees it. This is also why the two
transports (LAN TCP and WAN WebRTC) carry byte-identical payloads.

**A stolen pairing code is a denial of service, not a disclosure.** A room holds two peers,
so somebody who learns your code can take the second seat and prevent the real connection.
They still cannot read a single message: they hold no keys. The worst case is an interrupted
connection, not a leak.

**Not yet configured in this build.** `iceServers` defaults to empty, so only host
candidates are used — Orbit connects over a LAN and over loopback, but **not yet between two
different networks**. Reaching that requires STUN (and TURN for symmetric NAT) plus a relay
you host yourself.
