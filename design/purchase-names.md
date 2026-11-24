# Item-specific purchase control names

The shipped browser creates one Buy 1, Buy 10 and Buy max button for every
producer. Its upgrade buttons show a price, unlock threshold or Installed.
Before this change, those button names did not identify the producer or upgrade.
The adjacent heading is not part of the button, and the existing readiness and
quote descriptions do not name the item. A player navigating individual controls
could encounter indistinguishable purchase choices without their row context.

Each producer button now has an accessible name consisting of its unchanged
visible action followed by the authored producer label. Upgrade names likewise
retain their complete current visible text, followed by the upgrade label, and
refresh during the existing render. A blocked initial save still gets an item
name while its purchase controls remain disabled. No extra live region is added.

This follows the accessible-name and visible-label relationship of WCAG 2.2
criteria 4.1.2 (Name, Role, Value) and 2.5.3 (Label in Name). It is a bounded
control-naming improvement, not a claim of whole-game WCAG conformance.
Existing readiness/preview descriptions, visible text, button behavior, prices,
save admission, supplier pins and engine rules are unchanged.

`npm run test:purchase-names-consumer` runs the actual source and native-built
browser modules with the existing DOM/storage adapter. It checks both shipped
worlds, initial locked and unaffordable choices, unlocks, purchases, Installed
state, timer refresh, import, world switching, cancelled and confirmed reset,
failed import, blocked saves and read recovery. The twelve cases fail on the
unmodified baseline because item-specific names are absent. They pass after the
change, and check that visible text and existing descriptions remain included.

These tests inspect authored DOM attributes and exercise native game transitions.
They do not compute a browser accessibility tree or establish screen-reader,
speech-input, real-device focus, visual rendering or human-player acceptance.
