# 0003. Rodar self-hosted, acessível só por VPN

- Status: Aceito
- Data: 2026-11-07

## Contexto

Os dados financeiros e os objetivos de vida do usuário são altamente sensíveis. Hospedar em nuvem
pública coloca esses dados no disco de terceiros, e expor o app na internet amplia a superfície de ataque.

## Decisão

A instância roda na máquina do próprio usuário via Docker Compose. Nenhuma porta é publicada. O acesso
(desktop e celular) é feito por uma VPN mesh (Tailscale), com `tailscale serve` fornecendo HTTPS.
O app mantém autenticação própria mesmo assim. A sincronização é feita por polling, já que webhooks
exigiriam endpoint público.

## Consequências

- Com a máquina desligada, o app fica indisponível, mas nada se perde: a próxima sincronização cobre o intervalo.
- Quem clonar o projeto precisa de uma VPN ou de outra forma de acesso privado.
