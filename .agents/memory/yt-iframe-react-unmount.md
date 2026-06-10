---
name: YouTube IFrame API + React unmount crash
description: Why mounting a YT.Player on a React-rendered node crashes on unmount, and the imperative-child fix.
---

# YouTube IFrame API + React conditional unmount → removeChild crash

When you call `new YT.Player(targetId, ...)`, the YouTube IFrame API **replaces**
the target DOM node with an `<iframe>`. If that target node was rendered by React
(e.g. `<div id="yt-player" />`), React still holds a fiber pointing at the
original node. When the subtree later unmounts — switching to a results screen via
a conditional `return`, or navigating away — React tries to `removeChild` the node
it remembers, but the DOM now has the YT iframe instead. This throws
`Node.removeChild: The node to be removed is not a child of this node`, and in dev
React often surfaces a misleading secondary `Invalid hook call` error from the
same commit-phase throw.

**Fix:** Never let React render the exact node YT will replace. Render an empty
wrapper with a ref (`<div ref={containerRef} />`), and in the init callback create
the player target imperatively (`document.createElement`, append into the
wrapper), then point YT at it. React only ever reconciles the wrapper, so unmount
removes the whole subtree (including the YT iframe) natively. Also call
`player.destroy()` in the effect cleanup (wrapped in try/catch).

**Why:** React reconciliation assumes it owns every node it rendered; third-party
libs that replace/move DOM nodes (YT, some chart/map libs) break that assumption.

**How to apply:** Any time a 3rd-party lib takes over a DOM node by id/element,
hand it an imperatively-created child of a React-managed wrapper, not a
React-rendered node directly.
