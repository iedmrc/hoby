# ADR 0004: Publish under the MIT License

- Status: Accepted
- Date: 2026-08-24

## Context

Hoby is becoming a public project. Users and contributors need explicit permission to run, inspect, modify, and redistribute the code, while the project needs lightweight contribution and security processes appropriate for a small local-first extension.

## Decision

License Hoby under the MIT License. Treat submitted contributions as licensed under the same terms. Publish concise contribution, conduct, and security policies; structured issue and pull-request templates; and automated dependency update configuration.

State publicly that Hoby is independent from Toby. Keep the project's existing privacy and least-privilege constraints as contribution requirements.

## Alternatives challenged

- **No license: rejected.** Public source without a license does not grant meaningful reuse or contribution rights.
- **GPL-3.0: rejected for now.** Copyleft would preserve downstream openness but may discourage extension reuse and integration beyond the project's current goals.
- **Apache-2.0: rejected for now.** Its explicit patent terms are valuable for larger multi-party projects, but MIT is clearer and proportionate for the present scope.
- **A contributor license agreement: rejected.** It adds contributor friction without a current relicensing or commercial dual-license need.

## Consequences

- Anyone may use, modify, and redistribute Hoby with the copyright and license notice intact.
- The software is provided without warranty.
- Contributions use an inbound-equals-outbound model under MIT.
- The maintainer must keep security reporting available and review dependency updates.
- A future license change would require careful treatment of all contributed copyright.
