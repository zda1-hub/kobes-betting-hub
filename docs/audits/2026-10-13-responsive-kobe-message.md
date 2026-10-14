# Responsive Kobe message and Discord posting permission

User request: finish Kobe Bot Send Messages permission for VIP expert list, then repair the oversized desktop message card while prioritizing mobile and preserving the approved website design.

Discord: added only the Kobe Bot role1539104364445048844 channel-specific allow2048 (Send Messages), deny0, in channel1550273195079114792. Existing everyone/VIP/Whop overrides were preserved. Saved via owner Discord UI and read back through authenticated bot API. Both managed list parts now exist:1551651953656864852 and1559754817851891788, current roster132. No admin/manage permissions granted.

Website: kobe-message.css adds desktop-only880px card cap, centered within the existing1160px homepage, bounded66ch prose and modest fluid heading/padding. Below900px existing mobile styling is preserved. No CSS zoom or transform changes; no whole-site typography/header/artwork redesign. index.html cache version updated.

Populated rendered verification:320px document width320, card272, button222;390px document width390/card342;1440px document width1440/card880/intro665/header top0;1920px document width1920/card880. Disclosure opened/closed. No horizontal page overflow. Screenshots in evidence/2026-10-13-kobe-updates/responsive-message-desktop.png and responsive-message-390.png. Local verified; publication receipt to follow.

Published: Cloudflare site versionf5ca9aab-da79-483b-a987-0c79b303bde1, GitHub main03ffa75. Live browser observed1920px document width1920/card880 with the refreshed stylesheet version; disclosure opened/closed. Capture: live-responsive-message-desktop.png. The requested1440 override had not yet applied on that live capture, so it is recorded as1920. Local1440 evidence above remains exact.
