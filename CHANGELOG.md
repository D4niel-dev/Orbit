# Orbit Changelog

## v1.0.0 — **Stable Release**

> **Note:** Orbit is 1.0. The release that makes it work the way a messenger is supposed to: **a friend outside your network is reachable**, a person you have been warned about is **shown to you rather than blocked for you**, and content you have asked not to see **stays hidden**. Everything underneath is still local-first — the LAN path has no server in it at all, and the internet path only borrows one to introduce two people. Alongside that: the release is now **tested in CI**, the empty states explain what Orbit is, and a set of silent failures that could have cost a message were found and closed.

### Features

- **Part 1 — Friends Outside Your Network** — The app was LAN-only: two machines on the same Wi-Fi or nothing. It now has a **hybrid transport**: the LAN path is still plain TCP with no server anywhere, and when that has no route the same packet goes over a **WebRTC DataChannel** instead. ⚠ The packet is byte-identical on both paths — end-to-end encryption sits **above** the transport, so switching transports cannot change what a message looks like.
- **Connect Over the Internet, With a Code You Share** — Friend menu → **Connect over the internet…** → a pairing code → Connect. ⚠ The code is a shared secret, not decoration: the room name derives from it, and anyone who knows the room can take the second seat. It is generated and exchanged out of band rather than being the two user ids, which everyone who has ever messaged you already knows.
- **A Signalling Relay** — `relay/server.js`, small enough to read in one sitting. It carries **SDP and ICE candidates only** — no message, no attachment, no name. It does see which two addresses pair and when, which is why the relay URL is a setting rather than a hard-coded default.
- **Part 2 — A Web of Trust** — Report a peer, and the report is **signed** with your identity key and sent to the contacts who have exchanged keys with you. Reports **expire**, are limited to **one hop**, and are **rate-limited** per peer so a flood cannot be mistaken for a consensus. ⚠ **Nothing is ever auto-blocked.** A verified report shows a quiet banner — *"Ava Chen reported this person for harassment 3 days ago"* — naming the reporter, because "somebody reported them" with no attribution is an accusation nobody can weigh.
- **The Warning Banner, on Both Platforms** — Under the chat header, above the pinned bar, in the same floating-card shape as everything else. Dismissible per chat; groups and bots get nothing, because a report is about a person, not a room.
- **Content Filtering by Hash** — Report an image from the viewer and its **SHA-256** goes on a local list; the same bytes are hidden wherever they appear. ⚠ Exact copies only — re-encode a file and the hash changes completely. It is a filter, not a detector, and the app says so. There is always a **Show anyway**, and using it does not unflag anything.
- **Notifications Expire** — Every notification now has a lifetime: messages and mentions 30 minutes, calls an hour, updates and results ten. ⚠ **Except the replyable one**, which is a queue record rather than a reminder — a reply typed with Orbit closed is waiting in it, and expiring it would drop your reply silently.
- **NAT Is a Setting, Behind a Consent Gate** — Turning it on asks you to accept the Terms and Privacy Policy first, and reverting it on dismissal rather than after: a checkbox that turns on and then asks has already recorded consent nobody gave.
- **The Phone Draws the Desktop's Presence Shapes** — Four silhouettes instead of a tinted dot, so presence reads the same on both screens.

### Improved

- **The Release Is Tested in CI** — ⚠ The unit tests **were not in the repository at all**: `/tests/` was in `.gitignore`, so all 17 files existed on one machine while `package.json` ran every one of them. A fresh clone failed on the first file. They are committed now, and a `test-unit` job runs them on every pull request — E2EE key handling and interop, the web of trust, rate limiting, the transfer state machine, WebRTC signalling, the content filter, QR pairing and account transfer.
- **The Empty States Explain Orbit** — "No friends yet" now says how Orbit actually connects — same Wi-Fi straight away, a relay across the internet — and offers an **Add a friend** button. A local-first messenger cannot behave like WhatsApp on first launch; saying so costs one sentence and saves the first impression.
- **Test Relay** — Settings → Network can open a real socket to the relay and report whether it answers. The most common "it doesn't work" is an unreachable relay, which until now was indistinguishable from a friend who is simply offline. It says *reachable*, not *working*.
- **The Update Modal Says Which Channel and How Big** — A stable build and a beta are different promises, and the download size is the difference between "yes" and "later".
- **The Welcome Sequence Waits for the Tour** — It could run while the tour was still open, so a first-run user was being taught twice at once.

### Fixed

- **A WAN Send Could Report Success and Drop the Packet** — The IPC is synchronous and a DataChannel send is not, so a channel that closed in between lost the message with no retry. There is a TCP-only retry path now, which cannot loop back into WAN. A message that vanishes after a tick is the fastest way to lose trust in a messenger.
- **`setLocalDescription` Was Called Twice** — Once by the adapter and once by the signalling state machine, so the answer threw *"Called in wrong state: stable"*. 36 unit checks were green because they only tested one side of that contract.
- **An Offer Could Be Made Into an Empty Room** — The relay rejected it, and the state machine was left in `local-offer`, so when the real peer arrived no offer was ever made. Both sides sat at "not connected" with no error anywhere.
- **The Signalling Client Addressed Itself** — Every offer was delivered back to its sender, which ignored it as glare, and the answerer never saw anything.
- **A Report From a Peer Whose Key You Do Not Have Is Refused** — It has to be: an unverifiable report is hearsay and must not be able to mark anybody.
- **The CSP Blocked the Relay Socket** — `connect-src` allows `ws://127.0.0.1` and `ws://localhost` deliberately, not a blanket `wss:`. Which origins the app may connect to is a security decision, and a production relay has to be added on purpose.

### Notes

- ⚠ **Internet connections are a desktop feature in this release.** The Android plugin compiles and has never opened a DataChannel on a device, so nothing in the phone app calls it — it cannot be reached by accident. The phone still reaches friends over the LAN.
- ⚠ **Reaching two different networks needs infrastructure you host**: a relay, plus STUN (and TURN for symmetric NAT). This build defaults to no ICE servers, so it connects on a LAN and over loopback, not yet between two homes.
- ⚠ **A stolen pairing code is a denial of service, not a disclosure.** A room holds two peers, so someone who learns your code can take the second seat and interrupt the connection — and still cannot read a single message, because they hold no keys. This is the strongest argument for the design: the transport does not have to be trusted.
- **Version: Bumped to v1.0.0.** ⚠ Written as `1.0.0`, not `1.0.0-stable` — a `-stable` suffix sorts **below** `1.0.0` in semver, so the updater would treat plain `1.0.0` as newer and could offer it forever.

## v0.9.0-beta — **Stable Release**

> **Note:** The first **Stable** release since v0.8.0, and the largest change to the desktop since Orbit started. **A new look**, shipped as a beta you switch on rather than one you are given — every surface rebuilt: settings, the Activity Center, the gallery, the call screen, the profile sidebar, the boot skeleton. The composer becomes Orbit's own, with an emoji picker that hangs off the message box and a dataset that travels with the app. Plus the phone's **Classic Bubbles** on the desktop, an "Add a Friend" dialog that also tells you how to be found, and a long run of silent failures that only appeared when something was measured.

### Features

- **A New Look for the Desktop, as a Beta You Choose** — Settings → Advanced → Experimental Features → **"New look" · BETA**. It confirms before applying and restarts, because it swaps the stylesheet the whole window is painted from. ⚠ **The original UI is still what the app opens on.** The redesign keeps shipping alongside it past v1.0.0, so the stable look has to be the one nobody has to ask for.
- **The Settings Modal and the Activity Center** — ⚠ Both were built entirely from inline styles, so the layer could not reach a single declaration in either. They are the same shell as the rest of the app now.
- **The Profile Sidebar** — It had never been touched by a stylesheet and no spec drove it, which is how it shipped a banner that rendered as a **319×0 box**. Fixing it surfaced the same shape three times over: the default banner was **three copies in three files**, one of them a hardcoded purple that was a second brand colour.
- **The Gallery** — It had its own copies of two things the layer had already unified: a fourth hand-built segmented control whose selected segment was *darker* than the track it sat on, and filter chips drawn as fully saturated accent pills with white text — a primary-button treatment on a filter.
- **The Call Screen** — The largest untouched surface on either platform. It was `rgba(0,0,0,0.85)` with text on it and no surface of its own, so 15% of whatever chat was open showed through and the caller's name sat on top of the messages behind it. A call is a mode, not a dialog over the app — and the caller's name is escaped now.
- **The Boot Skeleton** — Its CSS lives in the component sheet, which the layer never touched, so every launch drew a 32px titlebar, 28px rail icons and a 36px square search box, then replaced all of it with a 34px titlebar, 40px rail icons and a 34px pill. A visible jump on every single start, before you had done anything.
- **Settings Nav: Icons, and a Rail That Collapses** — Eight bare words in a 240px rail is a list you have to read; an icon column is one you can scan. `chevrons-left` collapses the rail to 64px and the state persists. ⚠ The icons are **redesign-only** — in the original UI the nav stays text, as it always was.
- **The Group Modal** — Rebuilt on the same shell as the rest of the app, from one array rather than markup with a condition spliced into the middle.
- **Presence Is a Shape, Not Just a Colour** — Four distinct silhouettes instead of a filled dot tinted green / orange / red / grey at thirteen call sites. Two pairs shared a hue on purpose, so red already meant two different things.
- **The Emoji Picker Is Orbit's Own** — It was a library element inside a **shadow root**, unreachable from any stylesheet of ours, floating at a fixed offset against the *window* rather than the message box that opened it. It is a panel that is a **child of the composer** now — exactly as wide as it, sitting directly on top of it — with search, nine categories, a frequently-used tab and skin tones, and an emoji lands **at the caret** instead of being appended.
- **The Emoji Dataset Ships With the App** — It used to come from a CDN, so a fresh install with no network had **no emoji at all**. Bundled now (1,923 records) and served by Orbit itself. Measured on a clean profile with the CDN blocked: **171 emoji, zero requests**.
- **Add a Friend Tells You How to Be Found** — It shows **your own address** — masked until you ask, with copy doing the work — and takes **`host:port`**, which the app has always supported underneath and the dialog always threw away.
- **Classic Bubbles, From the Phone** — In Appearance → Chat: your own messages fill with the accent instead of being tinted. ⚠ It restores the **shape** as well as the colour — 16px with a square tail and wider padding — because changing only the fill produced a hybrid that matched neither look.
- **A Restart Warns You When a Call Is Live** — A restart ends the call, and the dialog is the only place that can say so; after the click there is no warning left to give.
- **Main-Process Logs Print Only When Asked For** — The terminal used to carry a MediaInfo block, `[OVP-IPC]` dumps and a discovery beacon every few seconds.

### Improved

- **One Corner Radius and One Shadow** — Panel corners had drifted to four different values across nine surfaces, and the shadow token was missing from half the themes, which silently dropped every shadow drawn from it.
- **No Fractional Type Sizes** — Sizes were landing between pixels on some displays.
- **The Welcome Tour Shows What It Describes** — The file-sharing step opens a conversation first, because on a fresh install nothing is open and the composer it talks about was not on screen. The privacy step rings the **whole setting card**, not the one-line row inside it, so the explanation is inside the highlight.
- **The Voice Recorder Bar Is Themed** — It already floated above the composer as a pill; what was wrong was the literals: a `#ef4444` dot carrying a **red glow**, a hardcoded shadow, a 20px radius.
- **Reactions** — Every declaration was inline on each pill, including a hardcoded `color: white`, so the layer could not touch a control inside the conversation it had just redesigned.
- **Lighter Boot** — Prism and the emoji picker are off the startup path, so the app is interactive sooner.
- **The Welcome Aurora No Longer Stutters the Sidebar** — Measured, not guessed: the animation was keeping a blurred layer alive that the toggle then had to re-composite.

### Fixed

- **The Emoji Button Did Nothing** — ⚠ In *both* UIs. The click starts on the icon inside the button, and opening the picker **swapped that icon**, so by the time the click arrived its target had been detached, every `closest()` said "outside", and the picker closed in the same tick it opened. It worked under a synthetic `.click()` and not under a real one.
- **The Rail Toggle Repainted the Whole App** — Collapsing a rail was being written as a settings change, and the settings handler repaints the window: a document-wide transition, a wallpaper re-apply, an offline poller restart.
- **The Emoji Picker Was Light-Scheme on Eight of Ten Themes** — The library only understands `light` and `dark`, so the six custom themes got its default light panel in a dark window.
- **A Side Panel Covered the Chat's Own Controls** — The header's ⋮, its own toggle and Send all sat under two overlays that are `position: absolute; right: 0`. The controls were fine; something was on top of them.
- **The Settings Nav Lost Every Icon on Any Re-render** — Including when toggling an experimental feature.
- **The Context Menu Closed Itself After 1.5 Seconds** — And it is restyled with the rest of the app.
- **The Search Field Drew a Box Inside Its Own Pill** — A universal focus rule outranked the field and painted a halo inside the ring the pill already drew. ⚠ The same shape came back on the emoji picker's search later in the release, and the second time it was two rings on one field.
- **The Default Avatar** — One call site was the app's only avatar that was not an accent disc, and the redesign had restyled a second one to a 14% tint that was invisible against both surfaces it straddled.
- **The Away Glyph Was a Blob** — It shipped as a sliver that read as a blob at 15px, which is why the test now rasterises each glyph and compares its filled fraction.
- **The Redesign's Presence Badge Was 22px** — Where the rest are 15px.
- **The Classic Group Info Modal Had Two Unstyled Elements** — The text read as "too basic" because nothing was styling it.
- **The Gap Between a Message's Text and Its Attachments Was Zero** — They touched.
- **Messages Rendered Through a Stale Sanitiser Fork** — The desktop kept its own copy of the shared sanitiser and the two had drifted: its `@mention` pass was unanchored, so an `@handle` inside a URL matched and the replacement landed **inside the href**.
- **A Group's Custom Avatar Was Lost on Restart** — `INSERT OR REPLACE` with a column list that omitted `avatarDataUrl`, so the column was never written and any existing value was reset to NULL on the next save.
- **The Global Gallery Was Unstyled in the Original UI** — Its header, search, chips and view switcher had been given redesign values in the shared sheet, so classic rendered the redesign look.
- **Mobile: The Group Info Avatar's Bottom Corners Were Square** — `overflow: hidden` clips the absolutely-positioned edit bar in a desktop browser; on the phone the bar carries a `backdrop-filter`, which puts it in its own compositing layer where the clip does not apply.
- **Mobile: The ⋮ on a Direct Message Did Nothing** — Groups worked, contacts did not.
- **Mobile: A Backup the Restore Could Not Find** — Is now found.

## v0.8.7-beta

> **Note:** A release about the composer, and about asking. The "+" finally has one door instead of five, Orbit asks for the permissions it needs **once** — and only for the ones that are actually missing — and four bugs that each broke something you do every day are gone: a dismissed link preview that stayed dismissed all session, a contact menu that opened empty, a contacts grid wider than the screen, and a staged attachment that vanished on the desktop.

### Features

- **The Composer's "+" Is One Door Now** — It used to drop a five-item list, and the first two entries were **"Upload Images"** and **"Upload Videos"** — the same intent split by file type, decided before you had seen anything. It opens a sheet now: a media panel and a pill row along the bottom, **Photos · Poll · Commands · Files**. The picker decides between an image and a video, so the split is gone. **Camera** goes straight to the camera and **Gallery** takes images and videos in one go. Commands is the door to the slash-command reference, which until now you could only reach by knowing to type a `/`.
- **Orbit Asks for Permissions Once, at Startup** — Permissions were requested from three unrelated places and **none of them could read the current state**, so a permission you had already granted was asked for again on every single launch. One of them **opened the camera on every start** — `getUserMedia({video:true})` and then stopping the tracks — purely to provoke the OS dialog, so the camera indicator lit up whether or not you were about to scan anything. There is one pass now, it reads what is actually granted first, and it asks only for what is missing, once per version. **If everything is already granted it does nothing at all** — no sheet, no dialog, no camera. The sheet says what each one is for *before* the system dialog appears, which is the difference between answering a question and being interrupted by one. It also asks for the two things that are not permissions and so cannot be a dialog: keeping Orbit awake in the background, and letting it open the installer for its own updates — which until now was asked for **after** the update had already downloaded, throwing you into Settings with the download wasted.

### Improved

- **The Vault's Restore-From-File Row Moved Above the Buttons** — It sat below Export and Restore, which put it after the actions it has nothing to do with and made it read as a footnote to them. It is not an action on *this* vault; it is the recovery path for a vault that is already gone, and the only one that survives deleting the app. Every other row on that screen is a setting, so it belongs with the rows.

### Fixed

- **A Dismissed Link Preview Stayed Dismissed for the Whole Session** — ⚠ Reported as *"pasted links are not recognised, and links ending in `/` are not recognised."* **Neither was happening.** All four combinations were measured first — typed and pasted, with and without the trailing slash — and the detection was already correct in every one. The real cause was the **dismissal**: it was keyed by URL for the whole session, so once the bar for a link had been dismissed, putting that **same** link back into the composer showed nothing at all. That is the one moment a preview is genuinely wanted, because you are looking at the link you are about to send. One cause, two symptoms, and the report pointed at neither.
- **The Three-Dots Menu on a Contact Opened an Empty Sheet** — It drew the sheet and nothing but the Cancel pill. The menu only ever pushed **group** items and folder items, so for a direct message with the experimental folder feature off — the default — the list came out **empty**. A contact's actions are *user* actions, and there is already a sheet for exactly that, so a direct message now opens it: View Profile, Message, Mute, Close DM, Block.
- **The Contacts Grid Was Wider Than the Screen** — ⚠ Reported as *"it feels kinda too spaced out"*, which was not what was wrong. `1fr 1fr` means `minmax(auto, 1fr)`, and an `auto` minimum is the content's **min-content** width — so one long unbreakable name pushed its column wider than its share. On a 390px phone the two columns measured **188px + 229px = 426px** and the right-hand cards were **cut off**. That is also why the ellipsis on a long name never appeared: the column had simply made room. A layout complaint is a measurement, not an opinion.
- **A Re-render Made Staged Attachments Vanish on the Desktop** — ⚠ Found by a test that had been written off as flaky. `renderChat` rebuilds the whole composer, including the staged-attachment strip — which the template emits **empty and hidden** — and **nothing put the staged files back into it**. So any re-render while files were staged made the strip disappear while the files were still staged: they would still be sent, and you could no longer see or remove them. Not a rare path — the local-echo chat posts its greeting a few seconds after boot, so it happened on a plain cold start. The measured sequence was **3 tiles at t+0.5s, then 0 tiles with 3 still staged at t+4.5s.** The spec passed about half the time, and the only difference was whether the assertion ran before or after that greeting.

## v0.8.6-beta

> **Note:** Four bugs that each broke something you do every day — an emoji you could not send, a link preview that arrived too late to be useful, a profile card that opened on top of the camera, and a backup file this app could read but never offered you. Plus the Contacts screen getting filters and a display style, and a rebuilt attachment preview.

### Features

- **Restore From a Backup File** — The Local Vault could restore its own *directory* backups and nothing else, while the desktop writes a whole account as a single `.orzip`/`.zip`. That file is now found and restored. It looks in **two** places — the app's own folder and `vault/` — because deleting and reinstalling an app removes its data directory but **not a file you saved**, so a fresh install should find its own old backups rather than making you go hunting for one. It shows each file with its size, its date and which folder it is in, says how many messages it holds before you commit, and adds the account **alongside** what is already on the phone rather than over it. ⚠ `.orzip` is not a zip — the desktop writes it with gzip and a house extension — so the format is decided by the file's first two bytes, never by its name.
- **Link Previews While You Type** — The preview bar appeared only *after* the message had gone, which is the one moment a preview is useless: you have already decided to send the link. A preview answers "what does this lead to?", and that question belongs to the moment the link is in the box. ⚠ The **card inside a sent message** was worse — it showed a link glyph where the thumbnail goes, the domain as the title, and then the full URL underneath, so both lines said the same thing. It now uses the page's own title and image, from the same fetch the bar uses, so the two cannot describe one link differently.
- **Filter Chips and a Display Style for Contacts** — All / Online / Offline / Groups, each with a live count, and a choice between a dense list and a two-column grid of large avatars for people who recognise a face faster than they read a name. ⚠ The chip filter is deliberately **momentary** — it survives switching tabs and is gone after a restart, because which slice you are looking at is not a preference. The display style is the opposite: how you like to read **is**, so it is remembered.
- **Every Contact Row Has Its Actions** — A row had one button, so everything else a person can do with a contact was reachable only by long-pressing — which is not discoverable and does not exist on a desktop. There is a second button now, opening the same sheet the long-press opens. **Groups had no actions at all** before this; a group was a row you could only tap.
- **The Attachment Preview, Rebuilt** — Three things were wrong with the strip above the composer, and the first one was measured before anything was written: a staged image was a bare `<img>` in a 56px tile, so a full-resolution photo was an **empty box with nothing happening in it**. There is a spinner now, with the image held back until it is actually ready. Each tile carries an **×** that takes that one image out of the send while the rest go normally, and **tapping a tile looks at it** — full screen, not a send. The tiles also lift off the composer with a shadow, because a staged attachment is the one thing on screen that is not part of the app yet.
- **Only the Active Tab Is Labelled** — Four labelled tabs is four words competing for a 62px bar, and three of them are always the wrong word: you are looking at one panel. The label now belongs to the tab you are on, and it moves between them.
- **The Desktop Got the Same Staged-Attachment Strip** — ⚠ This shipped in v0.8.6 but was never written down, so it is recorded here rather than left out of the history. The phone had it and the desktop did not, and **two of the three faults were the same shape** — which is the lesson, because the mobile was fixed first and nobody asked whether the desktop shared them. A staged image was a bare `<img>` in a 64px tile with no loading state, and the **remove button was never rendered at all**: the document-level handler for `.btn-remove-file` had existed the whole time, so the handler matched nothing and a staged file could not be taken back. Fixing it also exposed a real bug underneath — staging pre-decodes each image to read its dimensions and then called `URL.revokeObjectURL(img.src)`, but `img.src` **is** the entry's own blob URL, so **every staged image's URL was dead the moment it was measured**. The strip looked right because the tile had already decoded and cached; everything that touched that URL afterwards failed, and it was invisible until something asked for it a second time.

### Fixed

- **An Emoji Picked From the Picker Could Not Be Sent** — ⚠ This was **not** the empty-check, which was fine: an emoji passes it, and typing one worked. The picker's handler assigned the input's value directly, and **assigning `.value` fires no `input` event** — so nothing that watches the composer ever learned the box had content. `updateSendButton()` never ran, the send button never appeared, and the composer sat there showing the **mic**. An emoji-only message was unsendable not because it was rejected but because there was no button to press.
- **Tapping "Pair a Desktop" Re-Opened the Profile Card** — ⚠ A race. The account switcher closes back to wherever it was opened from, so arriving from the profile card made it re-open the card — on the same 220ms timer that opens the scanner, so the card landed on top of the camera. Tapping Pair is *leaving for a destination*, not dismissing the sheet, so it no longer takes the "go back where I came from" path.
- **The Restore Button's Corner Radius Was Resolving to Nothing** — The whole restore block was written against `--r-sm`, and this app defines no such token. An undefined `var()` makes the declaration invalid and the browser drops it silently — five dead references, all measuring 0px. It is a real radius now, and a deliberately tighter one than the settings buttons use, because a full-width 42px button at 12px reads as a pill.
- **The Restore Confirmation Was a Desktop Dialog** — A centred card floating over a bottom sheet was two surfaces doing one job. It is the sheet's second step now, and it has **one** way out: the sheet already pins a Cancel pill, so an in-content Cancel meant two Cancel buttons on screen — the same duplication the × removal fixed in v0.8.3.

## v0.8.5-beta

> **Note:** The phone catches up with the desktop. Orbit now appears in the Android share sheet, a notification can be answered without opening the app, and the app can be locked behind a PIN — plus link previews, a real image viewer, and a network map that shows faces instead of letters.

### Features

- **Orbit Is in the Android Share Sheet** — Sharing a photo used to mean opening Orbit, finding the chat, and hunting for the picture. Android's own flow — share, then pick a person — is the one your thumb already knows, and Orbit is in it now. Share a photo, a video, a PDF or a link and it asks **which chat** rather than guessing: sharing to the wrong person is worse than one extra tap, and "send to the last chat" is exactly the helpfulness that sends a photo to the wrong person. The text lands in the composer rather than being sent blind, so you can still say something about it.
- **Reply to a Message From the Notification** — A direct message notification carries a Reply box, so you can answer without opening Orbit. This is the interaction people actually use a messenger for: you get a message, you answer it, you put the phone down. ⚠ **Replies typed while Orbit is closed are queued, not sent on the spot** — sending them immediately would mean running the whole P2P stack from a broadcast receiver, so they go when the app is next opened and the notification **stays until then** rather than pretending. DMs only: a group notification cannot say who you are replying to, and a box that cannot say where it is going is worse than no box.
- **App Lock** — A PIN in front of the app, ported from the desktop's lock screen. Six digits on a keypad rather than a text field, because a PIN on a phone is digits and a thumb and a keyboard covering half the screen is the wrong instrument. The PIN is stored as a **PBKDF2-SHA256 hash** with a per-install salt, not as the PIN. Five wrong attempts starts a 30-second cooldown, and that cooldown lives outside settings — **a cooldown you can clear by restarting the app is not a cooldown**. Locks on launch always; locks on return only if you ask, because switching apps to copy something is not the same as handing the phone to someone.
- **Link Previews** — The old card showed the domain, which tells you nothing you could not read off the URL. It fetches the page and reads its Open Graph tags now, so it shows what the link actually leads to: the page's own title and image, above the composer. It follows the **most recent** link rather than every link, because a preview answers "what is this?" and the thing you are looking at is the thing just sent.
- **The Image Viewer Grew Up** — It had a close button and nothing else. It now steps through the images of the message you tapped in, with previous/next, zoom (buttons and pinch), and a download button. At the ends the buttons **go dead but stay put** — moving them would shift the layout under a thumb that is mid-tap. Zooming out past the picture's own size springs back after a moment, so the gesture always answers and you cannot get stuck looking at a thumbnail.
- **The Network Map Shows Faces, Not Letters** — Nodes were a coloured circle with an initial. A friend with a picture shows it now. The map is a canvas, so the avatar has to be decoded before the draw loop paints, and a URL that fails is remembered as failed rather than retried every second forever.
- **Undo Send** — A short window to take a message back after sending. It is a **real retraction, not a local hide**: it sends the same `MESSAGE_DELETE` the desktop already broadcasts, so the message disappears for the other side too. A "delete" that only deletes it for you is worse than none, because you believe it is gone. **Off by default**, in Settings → Chat — the hold menu already deletes, so this is for people who send fast and regret fast. When it is on, the affordance sits on the message itself rather than in a toast: send five messages quickly and five toasts would cover the chat you are trying to read.

### Improved

- **The Update Download Is a Sheet, With States That Change** — It was a centred modal built entirely from inline styles, so it could not use the app's tokens, and it had exactly **one** state: the title said "Downloading Orbit…" while the installer was running. It is a bottom sheet now — a download is a wait, not a question, so it should not black out the app and sit mid-screen pretending to be a decision. Downloading, Downloaded and Installing each get their own icon, title and colour, and the percentage is the thing you actually read while waiting.
- **The Local Vault's Stray Line** — "A single JSON file in the app data folder (vault/)" was a separate block **below** the status card, which is exactly why it read as out of place: it repeated what the card already said, it had no icon where the card has one, and it was left-aligned while the card is a row. It is the card's third line now.

### Fixed

- **The What's New Button Did Nothing** — A docs edit had broken both hardcoded blocks behind it. Found by tapping it rather than by reading it.
- **The Image Viewer's Prev/Next Were Never Styled At All** — The markup was `class="viewer-nav viewer-prev"` and every rule was written against `.viewer-btn`, so **not one matched** and the buttons fell back to the browser default: square, transparent, sitting in the flow side by side. CSS fails silently on a selector that matches nothing. They match the desktop's now — 50% black discs at both edges, no blur.
- **The Viewer's Backdrop Was 92% Opaque** — The chat behind showed through as blocks, so a picture in the feed read as a dark rectangle beside the one you were viewing. Opaque now.

## v0.8.4-beta

> **Note:** One tap on Send was sending a voice message. Android fires a set of synthetic mouse events after every touch, aimed at whatever is under your finger *by then* — and sending swapped the composer to the mic before they arrived.

### Fixed

- **One Tap on Send No Longer Fires the Mic** — Send fired on `touchend`, which swapped the composer from the send button to the mic. Android then fires a synthetic `mousedown` aimed at whatever is under the finger *at that moment* — which was now the mic — so a recording started, and the `mouseup` stopped and sent it. One tap, a voice note nobody asked for, and it repeated, because each one reset the composer and put the mic back under your thumb. The send icon "not lighting up" was the same stuck state: the swap had already run. Any mouse event within 700ms of a real touch is ignored now, which is longer than Android's ~300ms synthetic delay and shorter than a deliberate second tap. Both controls were also double-firing on a real tap — the mic started on `touchstart` **and** the synthetic `mousedown`, and send ran on `touchend` **and** `mouseup`.

- **A Group of Images of Different Sizes No Longer Goes Ragged** — every cell took its own image’s height, so a 1:1 beside a 16:9 beside a 9:16 gave three heights in one row: the tallest set the row and the others floated inside it. The grid now follows Discord: **one** image keeps its own proportions, **two** are a pair of squares, **three** are one large square with two stacked beside it, **four** are a 2×2, and **anything past four** shows four tiles with a **+N** on the last. Tiles touch, and the grid clips so only the outer corners are rounded — which is what makes a group read as one object rather than several adjacent cards.

- **Images in a Desktop Grid Were Rendering at Half Height** — the grid’s own rules were written without the `.message-row .msg-attachments` prefix, so they lost a **specificity tie** against an earlier rule that carried it. Both were `!important`, so the more specific one won and its `height: auto` and `object-fit: contain` applied: a wide image rendered at its natural height inside a square cell, so **half the tile was empty**. The grid rules carry the prefix now, and a desktop spec measures the **image** against its cell rather than the cell alone — a grid row stretches its cells to a common size whatever the CSS says, so a cell-only assertion passes either way.

## v0.8.3-beta

> **Note:** The conversation screen, reworked. A message is no longer one box with everything crammed inside it — text, images, files, video and audio each get the treatment their content actually wants, and your own messages stop being a different colour from everyone else's.

### Features

- **The Conversation Screen, Reworked** — Everything a message carried lived inside **one** bubble — text, images, files, video, audio — so a photo had a bubble around it (a frame around a frame) and a file was whatever was left over. Attachments now sit beside the bubble, and each kind gets what it actually wants: **text** keeps its bubble, **images** get none at all and keep their natural aspect instead of being forced into a square and cropped, **files** get a surface of their own, and **video and audio** float on the feed behind a shadow. Your own messages are no longer a solid block of accent — same surface as everyone else's, with the corner radius saying which side you are on. A **Classic Bubbles** toggle in Chat settings brings the accent back.
- **The Desktop Got the Same Conversation Rework** — The phone had it and the desktop did not, so the two laid messages out differently: the desktop still wrapped every photo in a bubble and drew a generic glyph for every file. Ported: attachments beside the bubble, images with no box and their natural aspect, files on their own surface, video and audio behind a shadow, and reactions straddling the bubble's bottom edge. Deliberately identical in behaviour to the mobile so the two cannot drift apart.
- **Every File Draws Its Own Icon** — A .zip, a .json and a .pdf were a column of identical generic glyphs. The mapper moved to `shared/ui/file-icons.js`, which both platforms read, and it knows archives, code, spreadsheets, slides, audio, video, PDFs and plain text.
- **The Bubble Colours Were Hardcoded** — `#1A1D24` for incoming and a fixed blue gradient for outgoing, neither of which followed the theme. In a **light** theme the incoming bubble stayed dark while `color: var(--text-primary)` went dark with the rest of the app — so the message text vanished into its own bubble. That was Dan's "fix this" screenshot, and it was invisible in the dark theme, which is why it survived. Tokens now, and the text is **17.3:1** on its bubble in dark and **17.8:1** in light.
- **The × Is Gone From the Attachment Pills** — Staged files carried a close button on every pill, and the composer already has a Cancel that clears them. Two controls for one job, and the × was the smaller, harder one to hit on a phone. Removed on both platforms.
- **The × Is Gone From the Bottom Sheets Too** — Same duplication, one level up: every sheet had a × in its top-right *and* a Cancel pill across the bottom. The × is removed. Backdrop tap and drag-down still dismiss, so nothing is trapped. Two sheets keep theirs — the frame picker and What's New have no other way out.
- **The Local Vault Fits the Rest of the App Now** — Its status was a centred block with centred sub-text, in a settings list where every other row is left-aligned, which is what made it read as bolted on. It is a card now, like the rows around it. And its two actions were **both** primary, which made the eye choose between things that are not equal: exporting is routine, restoring replaces everything you have. Export keeps the accent; Restore steps back. While in there: a stored backup time that could not be parsed rendered the literal words *"Invalid Date"* into the UI — it falls back to "No backup yet" now.

## v0.8.2-beta

> **Note:** A maintenance release. Nothing new to look at on purpose — this is the mobile restyle's own regressions, closed out. The redesign shipped in v0.8.1 and then a run of things it had quietly broken surfaced: a contacts list that flipped between two renderers, a tab strip that was hidden unless you had already created a folder, and custom profile banners that had stopped rendering without anything looking wrong. Diagnostics was rebuilt while I was in there. If you were on v0.8.1 and something felt off, it was probably one of these.

### Features

- **The Phone Offers All 55 Profile Frames** — The desktop enumerated **1–55** and the phone's picker stopped at **42**, so twelve frames were simply not there. Nothing errored and nothing looked wrong: a picker missing its last entries is indistinguishable from a picker that ends there. Both platforms now read one list, `shared/ui/profile-frames.js`, and a test fails if the list and the shipped PNGs ever disagree — in either direction, so a frame file nobody can choose is caught too.

- **Diagnostics, Rebuilt** — It was a section title repeating the screen header, one card, six bare rows floating on the background with nothing under them, and the top third of a screen filled. It opens with a **verdict now** — "Everything checks out" or "Something needs a look", with a count of how many checks passed — the checks sit in one grouped card instead of loose on the background, and the **report is shown** in a monospace block rather than only described. "Copy these values to paste into a bug report" was a promise about content you could not see; the same promise kept is the actual text. The Copy button and the preview come from **one builder**, because they were two separate loops over the same rows and would have drifted the first time either changed.

### Bug Fixes

- **The Contacts List Kept Changing Its Mind** — Two renderers wrote to the same `#friends-list`: a grouped one (Online / Offline / Groups, with a Message button) and an older flat one (a chevron, and a cat at the end). Whichever ran last won, and the flat one is called from **a dozen places** — a friend added, a presence change, a profile saved, a search — so the list flipped to flat on almost any update. Dan saw it as "correct, then incorrect" and the trigger he hit was the search box. There is one renderer now, and the test drives that exact path.
- **The Friends / Groups Tabs Were Hidden Unless You Already Had a Folder** — The markup was there and the folder machinery was there. One rule — `#home-tabs:not(.has-folders) { display: none !important }` — meant the strip only appeared to someone who had already created a folder, so **the folder feature was gated behind itself** and the Friends/Groups control was unreachable for everyone else. It came from the restyle, on the reasoning that groups already render inline in the list. That reasoning cost the only way to scope the list to one kind. The strip is back, and it now sits **above** the "Active now" row rather than below it — it scopes everything under it, and "Active now" is a list of online *friends*, so it has no business sitting above the Groups tab.
- **Tab Transitions Only Went One Way** — The direction came from the **caller**, and the only caller passed `tabId === 'chats' ? 'reverse' : 'enter'` — so the direction was really *"is the destination Chats?"*, and every move that did not involve Chats went the same way. Going Chats → Contacts → Activity → Contacts, the last step slid left when it should have slid right. It is **derived from the panel order** now, so it always slides the way you are moving.
- **The Content Slide Had No Direction, and the Panel's Fade Came Back With It** — The transition animates each panel's **content**, not the panel, because the tab bar lives inside every panel and animating the panel drags the bar with it — the bar had been measured still at 276 samples across a switch. But the content keyframes were not directional: entering always came from +16px, so "back" looked identical to "forward" even once the direction was correct. And removing the rule that keeps the panel animation off brought the panel's own keyframes back into play, **fade included** — `panelEnter`/`panelExit` carry `opacity`, which is why the slide started dissolving instead of sliding. The content now has a `Reverse` pair, the panel animation stays off, and there is **no `opacity` anywhere** in the transition. All three are pinned by a test that asserts the animation that actually lands, the panel staying still, and the bar holding one position.
- **The Profile Avatar Sat Inside the Banner Instead of Across It** — With the hero's own 44px padding an 88px avatar ended at 132px, entirely within a 150px band — so nothing crossed the edge and the whole header read as crammed against the top with dead space beneath it. The band is 108px now and the avatar starts at 64px, so 44px of it sits below the edge.
- **Cropping a Banner Did Nothing to the Hero** — Three separate places painted the banner with `heroEl.style.backgroundImage = 'url(...)'`, and `.profile-hero { background: transparent !important }` resets `background-image` — a stylesheet `!important` beats a non-important inline style, so all three were no-ops. You cropped a banner, the modal closed, the URL field filled in, and the hero did not move. The save path also gated the banner on `avatar`, so saving with no avatar set *cleared* the banner you had just chosen. All three go through one `setHeroBanner()` that writes the `<img>` layer now.
- **The Gap Under the Profile Name Was a Hole** — Between the tag and "Edit Profile" there was about **79px of nothing**: 30px of hero bottom padding, 6px of hero margin, 16px on the form's wrapper and 10px on the section, all stacking. The wrapper was a bare `<div style="padding: 16px">` with no class, so nothing could target it. It is 18px now, and the header sits about 45px higher.
- **The Avatar Had No Ring Over a Photo** — The restyle sets `border: none !important` on the avatar, which is right on a plain card and wrong over a banner: it merged into the image and read as a square rather than a circle. The 3px surface ring is restored **only** when there is a banner to separate it from.
- **Custom Profile Banners Were Invisible on Mobile** — The banner was applied as an inline `background-image` on `.profile-hero`, and the restyle sets `background: transparent !important` on that element. The shorthand resets `background-image`, and a stylesheet `!important` beats a non-important inline style — so every custom banner silently stopped rendering, and it read as deliberate because the blurred accent was still sitting there behind it. All **three** profile heroes had it (your profile tab, your profile sheet, and a friend's). The banner is an `<img>` layer now, which no background rule can reach. The desktop was never affected — it puts the banner on a dedicated `#profile-banner` element with no CSS rule on it.

### Technical

- **The Restyle Layer Has Three Shapes That Keep Catching Things** — Every bug it has caused is one of them: a **bare `img` or `*` child selector** (it caught the profile-frame overlay), a **`:not(...)` on a state class** (it hid the tab strip unless you already had a folder), and a **`background` shorthand with `!important`** (it reset an inline `background-image`, so custom banners were invisible). All three read as deliberate once they land, which is why none of them were noticed. When writing in that file, prefer the narrowest selector that does the job and never set `position` when all you need is `z-index` — a blanket child selector that sets `position` takes it away from the children that are deliberately `absolute`, which is how the profile sheet's two buttons ended up stacked down the left edge.
- **Test Suites** — `npm run test:unit` is now **11 suites**; `npm run test:mobile` is now **160 checks** across twelve probes, plus desktop parity; the desktop Playwright suite remains 37 tests across two shards. The new probes cover the Contacts list, the home tabs and Diagnostics.

## v0.8.1-beta

> **Note:** The phone release. Your account can now travel from the desktop to a phone over your own network, encrypted, and land as a second account rather than overwriting the one already there. Around it, the mobile UI redesign that had been landing piece by piece is finished — the conversation screen, the composer, the gallery, the profile card and search all now belong to the same app. And the search itself was not working: message search could only ever find messages in the conversation you already had open.

### Features

- **Your Account, From the Desktop to Your Phone** — The desktop has been able to back itself up for a while, and the phone has never been able to receive any of it. Now it can: open **Link a phone** on the desktop, scan the code with **Settings → Pair a desktop**, and the account comes across your own network. It arrives as a **new account on the phone** — your existing one is untouched, and you choose when to switch — because the alternative, quietly overwriting the account already in your hand, is the one outcome nobody could undo.

  What authorises the transfer is the **link token**: 128 random bits, minted when you ask to link a phone, shown only as a code on the desktop's own screen and never sent in the clear. The phone proves it holds the token by deriving the same encryption key from it. The desktop does not build or send anything until you confirm, and the confirmation says what is about to leave and how much of it — account, message count, contacts, size. The token is **burned the moment a transfer starts**, succeed or fail, and a refusal burns it too: a replay of the same request cannot pull a second copy.

  Everything travels under **PBKDF2-SHA256 (100,000 rounds) → AES-GCM-256**, the same scheme as the Local Vault, so a tampered bundle fails to decrypt rather than importing garbage.

- **The Mobile UI, Finished** — The redesign had been arriving in pieces since v0.8.0. This release is the rest of it, and the parts that were still wearing the old language now match:
  - **The tab bar** shows the **filled** form of the selected tab's icon. Two of the four icons had to change to make that possible — filling an outline only says something if the glyph has internal shape, and `activity` (a polyline) filled into a lump while `history` filled into a **ball** at 24px. Activity is a bell now, which is also what that panel is.
  - **The conversation screen** — day separators, so a thread with only times in it is not a puzzle; outgoing bubbles are a shallow gradient rather than the accent at full strength, which across a long conversation is a wall of saturated blue; incoming bubbles get a hairline so they read as a surface.
  - **The composer** had four controls in a 48px pill. The emoji picker now lives *inside* the field, where composing happens, and the trailing button **swaps between mic and send** — mic when there is nothing to send, send when there is.
  - **The Gallery** gets a header that names the conversation and counts what is in it, filters on the shared pill scale, a 3-up/2-up layout toggle, and empty states that distinguish "none of that kind" from "nothing at all".
  - **The profile card** opens from the header avatar, and the account switcher moved one tap in behind a button on its top-left. The hero had been carrying a magenta gradient from the previous palette — the last off-accent colour on a live path in the app.
  - **Settings sections** are full-bleed again. Wrapping a dozen rows in one card made the whole section read as a single enclosed block, and the side margins were eating width the rows had no use for.

- **Search That Actually Searches** — Message search **found nothing outside the open chat**. It read the store's message map directly, but that map is lazy-loaded — only the conversation you are looking at is in memory — so every other chat resolved to an empty array. Searching a word that appears in three conversations returned zero results. It returns three now, and the index is built through the store's own loader, cached for the duration of a search rather than rebuilt on every keystroke.

  With that working, search grew **filters**: All / Chats / People / Messages on the global search, each with a count of what the query *found* — a pill stays visible at 0, so "no messages match" is something you can see rather than a category that silently is not there. People are matched by **tag** as well as name, because #7714 is the half of a handle you would actually search for. Searching inside a conversation gets its own filters — **All / Media / Links / Voice** — which work with an empty query too, so tapping Media browses that chat's media rather than matching nothing.

- **A Test Suite for the Mobile** — The mobile had none, and every regression that actually shipped was found by driving the real UI in a browser. Those checks used to be throwaway scripts that got deleted each time; they live in `mobile/tests/` now, **66 checks** across seven probes, run with `npm run test:mobile`. They use the Edge already on the machine, so there is no browser download.

### Bug Fixes

- **The Stable Badges Had Drifted, and 0.2.7 Was Missing Entirely** — Dan spotted that 0.5.0 and 0.8.0 are stable releases with no Stable tag. Extending that into a check found four more: **0.6.0** and **0.0.5** were also untagged, **0.2.7** was absent from both What's New lists completely — a stable release a user scrolling back would simply never see — and **0.4.2** was wearing a Stable badge it had not earned, on a feature release about experimental Chat Folders. The one-way check ("every stable release is tagged") passes happily while something unstable is also tagged; the guard tests both directions, against the CHANGELOG as the source of truth.
- **The Mobile's What's New Had Stopped Three Releases Ago** — The list on the phone is hand-maintained and had not been touched since **0.7.5-beta**, so anyone who updated opened Settings → About → What's New and found nothing newer than 0.7.5. Nothing errored; there was simply no check that the newest entry is the version being shipped. **0.7.6, 0.8.0 and 0.8.1 are in it now**, and `npm run test:mobile` fails if the newest block is not the version in `package.json` — on **both** platforms, because they are two separate hand-maintained files with two different function names (`vBlock` on mobile, `versionBlock` on desktop), and a grep for one finds nothing in the other.
- **Profile Frames Had a Solid Square Behind Them** — Two `!important` rules of **equal specificity**: `components.css` sets the frame's background transparent, and the restyle layer sets `background` on `.profile-avatar-wrapper img`, which also matches the frame. Equal weight means `!important` does not break the tie — load order does, and the restyle layer loads last. The frame rule is now heavier than any `img` rule that could catch it, so it cannot be beaten on order again.
- **The Settings Search Never Hid Anything** — Typing in it marked nine of ten rows as hidden and left **every one of them on screen**, because the restyle layer pinned `display: flex !important` on the row and that beats a `.hidden` rule. The feature had been broken since the restyle shipped, and it hid well: a search that does nothing looks exactly like a search with no results.
- **Two More Show/Hide Breaks, Same Cause** — The composer's mic/send swap and hiding the "Active now" row during a search both failed for the identical reason. All three were the same mistake in the same file: an `!important` on a property something else needs to toggle.
- **The Activity Title Sat 20px Left of Centre** — It used `position:absolute; left:50%; translateX(-50%)`, the textbook centring idiom, which does not work here: an absolutely positioned block with no width shrink-wraps to the *available* space, not to its text, so it measured 326px wide and the translate moved it by half of that.
- **The Navbar Moved When You Changed Tabs** — The tab bar is injected into *every* panel, so animating the panel slid the bar with it. The bar is the one thing that should look like it never moved; the panels are sequential, so animating their contents instead keeps it perfectly still. Verified by sampling the bar's position every 16ms across a switch: 276 samples, one position.
- **Switching Accounts Could Take the Wrong Data With It** — Two of the three were pre-existing: settings that belong to one account were being read by the next, and a profile frame could follow you across a switch.
- **`save()` Does Not Persist Messages, and the Importer Assumed It Did** — Messages are written one chat at a time; there is no `set('messages')` in `save()`. The account importer put the whole history in memory where it looked completely correct and would have been gone on the next boot. Caught by asserting after the reload rather than before.
- **The Last Row of Every Settings Section Was Clipped** — A flex item shrinks by default and the card set `overflow: hidden`, so the final row was cut off with no way to scroll to it.
- **The Settings Toggle Knob Was Off-Centre** and overhung its track; a group label lined up with nothing; and section titles sat 4px off their own icon — the same 4px, three separate places.
- **A Video With No Poster Was a Nearly Invisible Square**, and an audio attachment sat in a single grid cell as a square tile with a filename crammed inside it.
- **The Images Tab Was Showing Video and Audio** — And their thumbnails cannot load, so both appeared as broken images.

### Technical

- **The Transfer's Threat Model Is the Design** — The desktop listens on the LAN, so anything on that network can open a socket to it. The **entropy of the link token** is what the security rests on, not the KDF — do not shrink it because "there are 100,000 iterations". The receive side never trusts the sender: every field is bounded and typed, the iteration count is clamped into a sane range so a peer cannot talk you into a one-round KDF, and the assembled length is checked against what the offer promised so a **truncated transfer cannot look complete**.
- **`desktop/src/js/network/protocol.js` Is Hand-Maintained, Not Generated** — A packet type added only to `shared/` does not exist on the desktop, and a receive branch for it can never match. This is what made `SETTINGS_SYNC` look unwired for two releases. All five transfer types went into both copies. (`mobile/src/shared/` *is* generated — `npm run shared:sync`.)
- **An `!important` on a Property Something Else Toggles Is a Trap** — It beats an inline style *and* a more specific rule, which is how three separate show/hide features broke silently. Swept all 24 `display: !important` declarations in the restyle layer; the remaining 21 are deliberate permanent hides, which is what the flag is for.
- **`tests/` Is Gitignored, So Its Ten Unit Suites Live on One Machine** — The new `mobile/tests/` is tracked. Worth deciding whether the root one should be too.
- **`npm run mobile:sync` Needs `NODE_OPTIONS` Cleared in this environment** — `cap sync` legitimately deletes the old `assets/public/` before copying, and the host's safe-delete shim kills it with a state-lock timeout. Same cause as the desktop-suite trap. The failure is misleading: `shared:sync` and `version:sync` both succeed first, so it looks like a partial failure.
- **A Dead Duplicate Chat-List Renderer** — `app.js` carries a ~250-line `renderChatList` that never runs, shadowed by the one in `home-screen.js`. It is what made a violet "premium badge" rule look live when the real badge has always been the app accent. Left in place, but it is a trap for whoever edits the wrong copy.
- **Two Bugs That Were in the Tests, Not the App** — Twice while writing the new suite I chased a failure that turned out to be a bad assertion: faking an `active` class does not survive the nav's own re-render, and the document holds three tab bars (one per panel), so three active tabs is correct. Both were fixed by driving the real code path and asserting per bar.
- **Test Suites** — `npm run test:unit` is now **11 suites**; `npm run test:mobile` is new at **66 checks**; the desktop Playwright suite remains 37 tests across two shards.

## v0.8.0-beta — **Stable Release**

### Features

- **Your Theme Now Follows You to Your Phone** — The pieces for this had been sitting in the codebase since v0.7.3: a whitelist of what may travel, validation on receive, last-write-wins by timestamp. What was missing was the wire. Changing your theme on the desktop now sends it to **your own devices** — a peer with your userId is you on another machine, and a peer without it is someone else — and the phone applies it. **A custom theme's colours travel too**, which is the half that matters: the colours *are* the theme, and until now the name went and the colours stayed behind.
- **Search That Uses the Database** — Message search was pulling every message into JavaScript and running `includes` over it. It now goes through **SQLite's FTS5**, so `project AND deadline` is answered by the engine in milliseconds regardless of how much history you have. Prefix matching (`deadl*`) works, results are ranked by relevance rather than recency, and search can be scoped to one chat. The old scan remains as a fallback for builds without FTS5.
- **A Search Icon in the Shared Media Bar** — Inside the field, where it belongs.

### Bug Fixes

- **The Update Progress Bar Never Moved** — It sat at 0% for the whole download while the label counted megabytes. The total came only from `Content-Length`, and the mobile's Response is patched to buffer the whole body, so that header is often absent — which left the bar with nothing to divide by. The release asset's declared size was already being read further down to *verify* the download; it works just as well as the denominator.
- **A Custom Theme's Colours Never Reached the Phone** — The module has always whitelisted them and the mobile has always applied them. The colour editor writes to the store **directly** rather than through the settings funnel, so the broadcast never fired for it. Theme changes went through the funnel and synced; colour changes did not. The apply handler also skips a re-render for the same reason, now fixed with it.
- **The Images Tab Was Showing Video and Audio** — And their thumbnails **cannot** load: a video has no still to show and an audio file has none at all, so both appeared as broken images. Images means images; video and audio go to Files where they get a proper type icon, and the Type filter only offers kinds the current tab can contain.
- **Changing the Display Refreshed the Whole Window** — The grid/list toggle wrote its preference through `store.setState`, which notifies **every** subscriber — the chat panel, both sidebars, the gallery. Flipping the view now causes **zero** chat renders.
- **Two Galleries at Once** — The Shared Media panel is an overlay anchored to the chat and the gallery takes the full width. Opening the gallery closes the panel.
- **No Way Out of Select Mode** — The bulk bar only appeared once something was picked, so entering the mode with nothing selected showed no bar and no way back. It is visible whenever the mode is on, with the action button disabled until something is chosen.
- **Long Filenames Spilled Out of Their Cards** — A grid item refuses to shrink below its content without `min-width:0`, so a long name pushed the card over its neighbour. The ellipsis was already on the name; it had nothing to work with.
- **The Send Button Could Strand You** — The composer is rebuilt when a chat re-renders, and anything typed into the old input goes with it. With the button carrying `disabled`, a rebuild left a visible composer with an inert button and nothing to explain why. It still shows when it can send — the fill and the accent colour — but it no longer carries an attribute that can leave you with no way forward.
- **A Toast Could Swallow the Send Button** — The toast stack sits at the bottom-right, which is exactly where the send button is, and its close button takes pointer events. A toast arriving as you went to send ate the click. The stack now clears the composer. This one predates the composer work; the button used to sit differently, which is why nobody had hit it.

### Technical

- **Two `protocol.js` Files, and the One That Matters** — The desktop has its own copy and loads that one, not `shared/`. It never received `SETTINGS_SYNC` — the shared twin has had it since v0.7.3 — so the packet type did not exist on that platform and the receive branch could never match. Found by probing the constant: it was `undefined`. **When adding a packet type, check both files.**
- **FTS5 Is a Compile-Time Option** — The migration that builds the index catches the failure and returns rather than letting the app fail to boot, and `searchMessages` returns `[]` instead of throwing — including for a malformed query, which throws inside SQLite. A missing search index must never stop the app starting.
- **FTS5's Operators Are Uppercase** — The query is lowercased for the scoring, so `project and cancelled` reached SQLite with a lowercase `and`, which FTS5 reads as a search **term** rather than an operator. The engine's syntax and the app's normalisation are two different concerns; they are handled separately now.
- **`var` Is Function-Scoped, Which Bit Me** — A local named `hits` inside the search function **shadowed** the results array of the same name, so raw database rows were pushed into the results and the render read `.msg` off a row that has no such property.
- **Cache Stamps Moved** — For `app.js`, `store.js` and `version.js`. `store.js` had not been stamped since August.

## v0.7.6-beta

### Features

- **The Shared Media Panel Grew Up** — It was a list of pictures and files with no way to find anything in it. It now has a **search box**, a **filter** by sender, kind and age, a **grid/list toggle**, a **jump to message** on every item, **multi-select with download-all**, and it renders **sixty items at a time** with a *"Showing 60 of 412"* count instead of building the whole list on every keystroke. The filter is three rows of chips in its own popover rather than a menu, because a flat action list cannot express "pick one sender, one kind, one age"; clicking the active chip clears that row, and the button carries a dot while anything is filtered so a filtered panel is never mistaken for an empty one.
- **Storage Stats, Because Orbit Keeps Your Files** — Orbit is local-first: every attachment is on *your* disk, and until now there was no way to see how much there was or where it went. The gallery header reads **"3 items · 4.9 MB"** and clicking it opens a per-chat breakdown, **biggest first**, with a bar each. A total does not answer the question a local-first app raises — the ranking does.
- **Select and Delete Media** — With the stats in place, the obvious next question is "so let me reclaim some". Select mode in the gallery picks items and deletes them, and the confirm says plainly that **the message goes for both people**, because "delete" in a gallery could reasonably mean three different things and the wrong guess destroys history.
- **A Month Scrubber** — The gallery is a flat list, so finding *that photo from March* meant scrolling and hoping. A rail down the right lists the months that actually have media and jumps to the first item of each.
- **The Composer Says What It Can Do** — The attach button is a plain plus that rotates into an **×** while its menu is open (a `+` turned 45° *is* an ×, so the open state needs no second icon). The send button is **dimmed and inert** with an empty box and **lit with a filled arrow** when there is something to send — including when the only thing staged is a file, because an image with no caption is a perfectly good message. It used to be always pressable with a handler that silently did nothing, which is worse than a button that tells you.
- **A Reason to Hover a Button You Cannot Press** — Hovering a disabled send shows a random icon from the 1,958 in lucide. Only while it is disabled: when it can be pressed, the filled arrow is the thing that says so, and hiding that behind a joke would make it a worse button.
- **The Slides Have Some Pop** — The first-run carousel and the tutorial card now rise in, then animate their parts on a 60ms stagger with a slight overshoot. Everything arriving at once reads as a swap; the same content arriving in sequence reads as something happening.

### Bug Fixes

- **The Images Tab Was Not Showing Images** — Video and audio counted as "media" and landed in the Images tab, where their thumbnails **cannot** load: a video has no still to show and an audio file has none at all. Both rendered as broken images. Images now means images, video and audio go to Files where they get a proper type icon, and the Type filter only offers kinds the current tab can contain.
- **Changing the Display Refreshed the Whole Window** — The grid/list toggle wrote its preference through `store.setState`, which notifies **every** subscriber — the chat panel, both sidebars, the gallery — so flipping the view re-rendered the entire app. The setting only needs persisting; it no longer touches the store. Flipping it now causes **zero** chat renders.
- **Two Galleries at Once** — The Shared Media panel is an overlay anchored to the chat and the gallery takes the full width, so opening the gallery with the panel open showed both. The gallery now closes it.
- **No Way Out of Select Mode** — The bulk bar only appeared once something was picked, so entering select mode with nothing selected showed no bar and no way back. It is now visible whenever the mode is on and its action button is disabled until something is chosen.
- **The Filter Emptied the Panel Instead of Saying So** — The search filter ran *after* the empty-state check, so it emptied the list and the render carried on with nothing, leaving a blank panel rather than *"Nothing here matches"*.
- **"NaN" Was Not a Date** — The panel's day groups were labelled `NaN`. `new Date("1785589248803.0")` is an Invalid Date — the timestamps come back from storage as strings with a trailing `.0` — and this is the third place that bug has appeared, so it now uses one shared parse.
- **Long Filenames Spilled Out of Their Cards** — A grid item defaults to `min-width:auto` and **refuses to shrink below its content**, so a long name pushed the card wider than its column. The ellipsis was already on the name; it just had nothing to work with.
- **The Filled Emoji Was a Blue Disc** — Filling lucide's `smile` fills its outer circle, so the icon became a solid blob with no face in it. The lit state is the accent colour alone now.

### Technical

- **`setState` Is for State the App Reacts To** — The display-toggle bug above is the general shape: a preference that only one view reads does not belong in the store, because every subscriber pays for it. It belongs in `Storage.set`.
- **The Scroll Had to Go Through the Render** — Jumping to a message scrolled the feed by hand, and the scroll was undone every time, because closing a side panel sets off a re-render and that render scrolls to the bottom. It now sets `_pendingActivityScrollMsgId` and asks for a render, so the scroll happens *inside* the render where it survives. The mechanism already existed — it is how the activity centre jumps.
- **Icons Built Synchronously** — The send and emoji icons are built with `lucide.createElement` rather than a `createIcons` pass. That pass is timing-sensitive in this app — the transfer strip keeps inline SVG for exactly this reason — and `createElement` has no timing to lose.
- **The Cache Stamps** — Moved for every file this release touches, per the note in v0.7.5 about a released fix sitting behind a stale file.

## v0.7.5-beta

### Features

- **55 Profile Frames** — Up from 43. The picker had stopped one short of the art it already had, so the last frame could not be reached at all, and it drew its options from a range rather than from the files: a missing asset would have shown as a broken tile. It now lists the numbers that actually exist, and every tile was checked against the frame it shows rather than the count being trusted.
- **Jump to Latest, and a Word When You Are Reading Old Messages** — Mobile had no way back to the bottom of a conversation, which the desktop has had all along. A chip now floats over the foot of the messages when you are scrolled up, and it is worded by what you are actually looking at: *"Jump to latest"* over recent messages, *"Reading old messages"* past a week, and *"Messages from months ago"* past two. Being 400 messages behind is a scroll; reading last month while the conversation moved on is a user who does not know they are lost, and those are not the same problem.
- **Nineteen Slash Commands You Could Only Find by Guessing** — The only door to the command reference was knowing to type a `/`. There is now a **Commands** entry in the `+` menu.
- **Copy Your User ID** — On both platforms. It is a monospace string whose entire purpose is to be handed to someone else, and there was no way to get it out of the app. The desktop's profile has a copy button beside it; the mobile's profile pill has one beside the gear.
- **Swipe the Pinned Bar** — With several pins the bar showed only the first, and "Show all" was the only way to reach the rest — fine for reordering, wrong for glancing. Swiping moves through them, with a dot per pin, and the tap jumps to the pin **being shown**.
- **A Quieter Chat Header** — The members button is folded into the `⋮` menu beside it, which already offers Group Info. Four icons on a 390px header was one too many, and that was the least-used.
- **The Search ✕ Behaves Like One** — It used to clear the query *and* close the search in a single tap. Now it clears when there is text and closes when there is not.
- **Show Group Created Date** — A setting, on by default, for whether a group's info says when it was created. A group with no recorded date no longer prints **"Created Unknown"**; the row is simply absent, which is what it should always have done.

### Bug Fixes

- **`/help` Opened and Closed Inside One Tap on Mobile** — Pressing send on `/help` in a group cleared the input and then showed nothing at all, and the command came back if you left the chat and returned. Both halves were the same bug: the send button binds **touchstart** to dodge the 300ms click delay, so the sheet opened *during* the gesture — and the same gesture's `click` then landed on the backdrop, whose handler is `hide()`. It opened and closed inside a single tap. The input was cleared because the sheet genuinely had opened; the text came back because nothing had been sent and the draft was still there. The shared sheet now ignores a backdrop tap within 400ms of becoming active, which is the same shape as the `_touchTap` guard the input area already carries, and it fixes every sheet rather than just this one.
- **A Sheet That Opened Off-Screen Reported Success** — The caller decided whether the command list had opened by reading the overlay's class, and the class said `active` while the sheet sat parked below the bottom of the screen. It now checks the class for the immediate decision — the sheet is mid-animation at that instant — and confirms 700ms later that it is actually on screen, saying so if it is not. A silent failure that eats what you typed is the worst possible outcome, and this one had already survived a round of instrumentation.


### Technical

- **The Cache Stamps, and a Fix That Might Not Have Reached Anyone** — Chasing the `/help` bug turned up something worse than the bug: `bottom-sheet.js` had changed for that fix and **its cache stamp was never moved**, so a device holding a cached copy would still have had the fault. That is exactly the version-skew case AGENTS.md warns about, and it means a released fix can be sitting behind a stale file. Stamps are now moved for every file that changed, and the helper that does it takes the stamp as an argument so a run is reproducible.

## v0.7.4-beta

### Features

- **The Update Download Shows a Progress Bar and the Time Remaining** — On both platforms. The download is tens of megabytes, and the only sign anything was happening was a percentage on the button — which then disappeared entirely once the label read "Opening installer…". There is now a bar and a line under it reading the bytes, the percentage and an estimate of the time left, from the rate actually observed. The estimate is withheld for the first second and a half on purpose: the first chunk measures the round trip rather than the throughput, and an estimate that opens at "2m left" and settles on "20s left" is worse than no estimate at all.
- **File Transfers Show Progress on Mobile** — Sending or receiving a file gave no feedback at all, so a large transfer looked like nothing happening. A row now appears above the composer with the direction, the file name, a bar and a percentage — the same shape as the desktop's, with the same tokens, so the two platforms read the same. The counters were already there; nothing had ever surfaced them.

- **Pinned Messages, on Both Platforms** — A chat can hold up to **three** pinned messages in a direct message and **five** in a group. A rounded card sits at the top of the conversation with the top pin, the count and a way into the list; tapping it jumps to that message. Right-click (desktop) or long-press (mobile) the card for a floating panel listing them all, where they can be reordered. The order is the user's, and changing it is announced in the chat: *"Dan has changed the pinned message order."* A deleted message leaves the pinned list at the moment it is deleted, and a message holding a file is named by its file name — pinning a photo no longer produces a pin labelled "(attachment)". On mobile this also means DMs can be pinned at all, which they could not before.

### Bug Fixes

- **The In-App Update Never Worked on Android** — Every attempt failed, and this is why: the downloaded APK was written **one byte too long**. The trailing chunk was padded out to a base64 group boundary with zero bytes that were never in the file — a 200,000-byte download landed as 200,001. Android checks an APK's zip against its signature, so a file one or two bytes long is refused with "There's a problem with the app file", which is the exact error the size check in that function was written to prevent, arriving by another route. It only triggers when the byte count is not a multiple of three, which is most of the time. The size check passed throughout because it compared against the bytes *read from the network*, never the bytes *written to the file* — the number being verified was not the number that mattered.
- **"Update failed: total is not defined"** — A variable was declared inside the response callback and read in the verification step further down the chain, which is a different scope. The ReferenceError fired before the size check could run, so every Android update attempt died there. Introduced while fixing the previous error in the same function, which is worth saying plainly.
- **The Update Modal Closed as Soon as You Pressed Download** — The progress bar lives inside the modal, so closing it on the same click that started the download destroyed the bar before a single byte arrived. The download ran with no indication at all — precisely the complaint the progress bar was added to fix. The modal now stays open until the download ends, or until you dismiss it.
- **`/help` Failed Silently and Deleted What You Typed** — In a group, typing `/help` and sending closed the keyboard, cleared the input and then showed nothing at all, while every other command worked. Something threw between dismissing the keyboard and activating the sheet, and the failure was invisible — the input was cleared regardless. It now reports the failure and **keeps your text**, so a failure is something you can see and tell us about rather than a command that appears dead.
- **`/help` Offered Nothing in a Direct Message** — The slash-command picker is suppressed outside group chats, because the commands really are group utilities. `/help` is a reference rather than a utility, so typing it in a DM showed nothing at all — and a fresh install's only chat is a DM, which made the command look broken on every version. Help is now offered wherever it is typed; the actual group-only commands stay hidden in DMs.

### Technical

- **The Pinned Rules Live in One Place** — The limits, the pruning, the reordering and the wording of the change note are in `shared/utils/pinned.js`, used by both platforms. They were written twice and both copies were wrong in the same ways: a label that said "(attachment)" for any file, no limit at all, and — on desktop — a pinned list that was never saved, so every restart lost it. 28 unit tests.
- **The Desktop Updater's Host and Filename Rules Are Tested** — Which hosts the updater will download from, and what filename it writes, were closures inside the IPC handler and therefore unreachable from any test — the same property that let three defects reach the Android updater untouched. Extracted to `desktop/lib/update-assets.js` with the logic unchanged and covered with 12 tests, including the redirect host (`objects.githubusercontent.com`, without which every real download fails at the redirect) and the suffix trick (`github.com.evil.example`, which a missing dot in the comparison would let through).

## v0.7.3-beta

> **Note:** Follow-ups to v0.7.2-beta, plus a pass over Custom Colors — which turned out to be incomplete in a way that was invisible from the UI.

### Features

- **The Desktop Emoji Picker Wears the App's Theme** — It had no styling at all, so it rendered the library's raw defaults: a `#444` hairline around the panel, a white box on whichever emoji held focus, and an unthemed search field. It now uses the same variable set mobile does, mapped onto the app's tokens, with the panel's own edge, the app's corner radius, and a short entrance animation that respects `prefers-reduced-motion`. The skin tone is remembered between sessions too, with the same validation mobile needed — a tone is a non-ASCII grapheme, so a poisoned value from the old bug is rejected and cleared rather than painted into the search row.

- **Custom Colors Covers the Whole Theme** — The editor offered 13 of the 21 tokens the themes define, and the two lists were written out separately in two places, which is how they drifted. `--text-inverse` was the one that hurt: it is the text colour *on* an accent background, so a light custom accent left unreadable text on it. `--accent-danger`, `--accent-success` and `--accent-warning` were unreachable too. There is one list now, it covers **all 17 colour tokens**, and the editor uses it for both the defaults and the fields.
- **Real Colour Pickers, and Values That Are Actually Colours** — Each row has a native colour input beside its hex field, so the two drive each other. The hex field is validated with the browser itself: a typo is refused and the field is marked instead of applied, because an invalid custom property is invalid at computed-value time and the whole token is lost until it is corrected. Values in `rgb()`/`hsl()`/named form are accepted and normalised into the picker.
- **A Way Back to Your Custom Colours** — Applying in the editor sets the theme to `custom`, but nothing in the theme list offered that value, so choosing any other theme dropped you out with no route back except reopening the editor and pressing Apply again. A row now appears whenever custom colours are saved, showing which one you are on and returning to it in one click.
- **Custom Colors Works on Android Too** — Mobile had no custom-theme handling at all: `theme = 'custom'` set `data-theme="custom"`, no stylesheet matched, and the saved colours were ignored — so a theme built on the desktop silently became the base theme on a phone. Mobile now layers the saved colours over the dark base exactly as the desktop does, and clears them when another theme is chosen. There is still no editor on mobile; the colours themselves travel.

### Bug Fixes

- **Drafts Came Back After You Sent the Message** — A draft is supposed to keep an unsent message in its chat and then be *ended* by sending. On Android it came back: four separate copies of the draft logic had drifted apart, and between them they produced every symptom. The debounced save captured the text at input time and wrote it 300ms later, so a message sent inside that window had its draft written back afterwards; it wrote against whichever chat was active when the timer fired rather than the one the text was typed in, so a draft could land in the wrong conversation; switching away only *saved* when the box had text and never removed the key, so an emptied composer left a stale draft behind; and restoring only set the value when a draft existed, never clearing the box — which left the previous chat's text sitting there. There is one save helper and one read helper now, the debounce reads the box when it fires and remembers the chat it was typed in, and sending cancels any pending save as well as clearing the key. Drafts were already correct on desktop and still are; both platforms are covered by the same eight checks.

- **The Desktop Emoji Picker's Last Column Was Half-Hidden Behind Its Scrollbar** — The picker sizes its grid to the full width of the element and then scrolls it. Where a scrollbar overlays the content that costs nothing, but on Windows it takes real space, so the grid is drawn underneath it and the rightmost column sits behind the bar. The element now measures the platform's scrollbar and widens itself by exactly that much, which also means the fix does nothing on a platform with overlay scrollbars and stays correct at any app zoom — a hardcoded width would be wrong at every zoom but 100%.

- **The Owner Had No Way to Delete a Group From Its Info Panel** — The panel offered a Danger Zone only to non-owners; an owner's only route to deleting their own group was the sidebar's right-click menu, which is not where anyone looks. Both roles now get a Danger Zone with the action that applies to them, and the owner's version says why there is no Leave option — you own it, so you delete it or hand ownership over first. The delete flow itself (confirm, tell the members, remove it locally) existed in two shapes and now lives in one place, so the panel and the context menu cannot drift.
- **The Member List Did Not Say How Many Were Online** — The count was already computed for the header and then thrown away. It reads `Members (4 · 4 online)` now.
- **Group Info Did Not Say When the Group Was Created** — It does, in the Profile section, from the group's own `createdAt`.

- **The Empty-Chat Placeholder Sat at the Top of the Conversation** — It should sit in the middle of the chat box. The desktop version used to, because the original markup carried `height: 100%` to centre itself, and that was dropped when it was replaced by the shared empty-state component. The component gained a `fill` variant (`flex: 1` for the mobile feed, `min-height: 100%` for the desktop one, so a single rule covers both), used at all four chat-feed call sites. Measured rather than eyeballed: the placeholder's centre is now 0px from the feed's centre on both platforms, with equal gaps above and below. Lists and sheets keep the non-filling variant.

- **A Sheet Could Open Entirely Below the Fold** — The v0.7.2 screen check corrected a viewport that was too *small*, but took one that was too *large* at face value. Because a sheet is anchored to the bottom of its overlay, a viewport larger than the screen pushes a short sheet — a two-item chooser, `/help` with a few rows — completely off the bottom, which is indistinguishable from the sheet never opening. The check now clamps both directions, for every sheet.
- **A Sheet Could Inherit the Previous Sheet's Sizing** — The decision between the layout and visual viewport is made by looking for a text field inside the sheet, and that check ran *before* the new content was injected — so it read the previous sheet's content. a chooser opened after the `/poll` builder was sized as though it had an input of its own, inheriting the keyboard-avoiding height instead of the layout one. Measurement now happens after the content is in place.

### Technical

- **The Foundation for Settings Sync** — A custom theme cannot travel between your own devices today: the protocol has no settings packet at all, so a theme built on the desktop never reaches a phone even when both are signed into the same account. This adds the packet type (`SETTINGS_SYNC`) and `shared/network/settings-sync.js`, which decides what may travel and whether an incoming payload may be applied: an explicit whitelist (`theme` and `customThemeColors` — not "all of settings", which would ship unrelated preferences and anything added later without anyone deciding it should), a versioned envelope, validation on receive that drops unknown keys, wrong types, non-colour values, invalid property names and oversized colour maps, and last-write-wins by timestamp. Only a peer whose `userId` matches your own may sync to you. **The transport is not wired up yet** — nothing sends or receives a packet, so the feature does not work end to end; this is the tested core, with 16 unit tests covering the whitelist, the validation and the staleness rules. The platform wiring is the next step.

- **Group End-to-End Tests** — `desktop/tests/e2e/groups.spec.js` covers what `group-picker.spec.js` never did: creating a group and then *living* in it — the header and the empty state, sending a message, the state disappearing once there is something to show, the group and its messages surviving a restart, and what the group info panel shows the owner. That last one pins down a deliberate asymmetry worth protecting: `Leave Group` is rendered only for non-owners, because an owner leaves by deleting the group or transferring ownership. The suite is 37 tests now, from 35.

## v0.7.2-beta

> **Note:** Follow-ups to the v0.7.1-beta patch. The `/help` sheet could still open as a short strip when *both* viewport APIs reported a stale keyboard-shrunken height, and the in-app updater had no way to tell a good APK from a broken one — which is why a failed update surfaced only as Android's generic "There's a problem with the app file".

### Bug Fixes

- **`/help` Could Still Open as a Short Strip** — The v0.7.1 fix sized input-less sheets from the layout viewport (`innerHeight`), on the assumption that it recovers when the keyboard hides. On a device where it does not, the sheet was still a short strip with its Cancel footer off-screen. The measurement is now sanity-checked against the physical screen: `screen.height` does not move when the keyboard does, so a viewport reporting under three quarters of the screen is not describing a keyboard, it is describing a stale number, and the sheet falls back to 92% of the screen. Input-bearing sheets still honour the keyboard they have to sit above. Consequence, and it is the intended one: an input-less sheet now opens tall on the first frame instead of waiting for the keyboard to finish hiding.
- **A Slash Command Outside a Group Looked Like It Did Nothing** — Slash commands are group-only, and using one in a direct message showed a brief toast, cleared the input and did nothing else — so the command simply vanished. Reported from an Android emulator, where the only chat is Orbit Echo (a DM): it reads as a broken command rather than a restriction. The reference sheet opens as well now, which carries the group-only note, so the response explains itself instead of looking like nothing happened.
- **The Tour Promised a Security Feature That Does Not Exist** — The second welcome slide said *"if someone's key ever changes, Orbit says so out loud instead of quietly accepting it."* Orbit does not do that: keys are pinned when you pair, but nothing warns you if a peer's key later changes, and there is no fingerprint to compare out of band — the README says so in as many words. Found while writing the website's security section, which forced the claims to be checked against the code. For a privacy product that is the worst kind of wrong copy: the users who care most are the ones who check. The line now says something true, and the gap is stated plainly on the site instead.
- **The Light-Mode "Next" Button Vanished on Hover** — `.ows-btn:hover` sets a `--bg-hover` background, and it won the cascade: it has the same specificity as `.ows-btn-primary:hover`, which only declared a filter, so the primary button turned pale while keeping its white label. On a dark background `--bg-hover` is dark and it merely looked odd; in light mode the label disappeared entirely and the button read as a blank white box. The primary hover now states its own background, verified at a 4.4:1 contrast ratio rather than by eye.
- **The Feature Tour Started Wherever You Left It** — The slide index was persisted and resumed, so the carousel opened mid-tour for anyone who had been through it before. It now starts at the first slide on every launch — but the first attempt at that was worse than the bug it fixed: with no state at all, the chat panel's re-render on any store change (a message arriving, a peer coming online) snapped the tour back to slide 1 while it was being read. The position is per-run state now, so it starts at the beginning on launch and holds still while you read it.
- **"Done" Did Not Stay Done** — Dismissing the tour lasted only until the next panel re-render, which brought it straight back. It is remembered for the run now.
- **The In-App Update Could Hand Android a Broken File** — The downloader wrote the APK and launched the installer with no verification beyond "the response was not empty", so a truncated transfer reached Android as a corrupt file and the user saw only the installer's generic error. It now checks what it downloaded against the release's declared asset size (and Content-Length) and refuses to install anything short, deleting the partial file and saying how much arrived. It also refuses to install when a release carries no Android artifact at all: the update check falls back to the *release page* URL in that case, and downloading an HTML page and handing it to the installer is another way to produce that same error.

### Features

- **`/help` Now Covers the Message Input** — The sheet was anchored above the composer instead of over it, because the overlay was shrunk to the measured viewport height: the sheet sat at the bottom of *that*, leaving the message input visible underneath. A sheet with no text field is not avoiding anything, so it now anchors to the bottom of the screen and covers the composer, the way a modal should; the overlay keeps its natural full height and only the sheet's cap uses the measured number. Sheets that *do* carry a field still shrink, because those genuinely need to stay above the keyboard. Dismissal is unchanged — tap outside, the X, Escape, or drag it down.
- **The Desktop Welcome Slides Have Atmosphere** — The empty state is the first thing anyone sees and it was a flat panel with a card on it. There is now a slow aurora behind the card — four blurred accent fields drifting past each other over a masked grid — with the card as frosted glass so the colour reads through it. Each slide change replays a staggered entrance (icon pops, then title, then body), and the active dot stretches into a pill so you can see where you are without counting seven dots. The whole thing is decoration and behaves like it: `prefers-reduced-motion` switches every animation off, and the aurora is toned down on light themes, where the same alpha that glows on near-black would stain near-white.

- **Every Empty State Uses One Treatment, on Both Platforms** — The app had eight "nothing here yet" surfaces and they had drifted apart: a bare icon and a grey line in the chat panel, a plain sentence in the sidebar, a bolded query in search. They are the same idea, so they are one component now (`shared/ui/empty-state.js`), used by desktop *and* mobile: a glass icon tile with a soft bloom, a title, an optional hint, an optional action — with a compact scale for lists and sheets, and a muted tone for passive states, because "waiting for peers" is not something to act on and should not wear the accent. Mobile keeps the same visual language at phone scale (a 52px tile against desktop's 56px). The chat panel's state names the friend you are about to message, search keeps your query in the hint, and the friends list now says how to add one.
- **The Component Converts Its Own Icon** — Every call site renders this markup into a larger template and runs no lucide pass over the result — all eight of them, so the icon stayed an empty `<i>` and rendered as nothing. The component schedules its own conversion now, coalesced to one pass per frame, rather than depending on each caller remembering. (It surfaced only on mobile, where the affected lists live in a panel that no global icon pass reached.)

### Technical

- **The Sidebar's "No Friends Online" State Is Dormant** — The friends list is empty only when there are *no friends at all*: it iterates `state.friends` (offline ones included), and Orbit Echo is always one of them. So that state cannot appear in practice. Left in place as the fallback it is, but it is worth knowing before anyone spends time on its wording.
- **The desktop's own view scripts carry no `?v=` stamps** — only the stylesheets and some shared includes do (`js/views/chat-panel.js`, `js/views/sidebar-middle.js` are loaded bare). Harmless for an app reading local files, but it is an inconsistency with the mobile cache-busting rule, and worth aligning one day.

- **`versionCode` comes from `GITHUB_RUN_NUMBER`, and is `1` anywhere else** (`mobile/android/app/build.gradle`). That is fine for CI-built APKs, but a locally built APK therefore has `versionCode 1` and can never install over one built by CI — Android refuses the downgrade. Worth deriving from the version instead (e.g. `0.7.2` → `702`) so every build path produces a monotonic number.
- The Android release APK is signed with the committed `debug.keystore` (release builds point at `signingConfigs.debug`). That keeps signatures stable across CI builds, but it also means an APK built from a *different* keystore — an older local build, or a fork — cannot be installed over it. Android's message for that is the same generic "problem with the app file", so the two causes are worth telling apart before debugging the file itself.

## v0.7.1-beta

> **Note:** Three fixes following v0.7.0-beta, all found on a real device within hours of the release — and none of them visible to the browser harness the first time round: the `/help` sheet was still sized from a keyboard-shrunken viewport, the emoji picker was painting a persisted `"undefined"` across its search row, and a drag could take over the first swipe of a long list.

### Bug Fixes

- **The Emoji Picker Drew a Giant "undefined"** — Its skin-tone button renders whatever value it is handed, and a `skin-tone-change` event with no detail stored the literal string `"undefined"` into `localStorage`. On the next launch the picker painted that string across its search row. Both sides are validated now — a real tone is a non-ASCII grapheme, `"undefined"` is ASCII, so nothing needs enumerating — and a poisoned value is *deleted on read*, so a device that already carries one heals itself instead of needing its storage cleared.
- **`/help` Was Still Capped to the Keyboard Height** — The earlier fix re-measured the viewport instead of trusting one sample, but on Android `visualViewport.height` can remain at the keyboard-shrunken value indefinitely, so every re-measure read the same wrong number: the sheet opened at about a third of the screen with its Cancel footer pushed off the bottom, which is why it still would not scroll or close. A sheet with no text field has no reason to avoid the keyboard at all, so input-less sheets now size against the layout viewport (`innerHeight`), which is stable and recovers; sheets that *do* carry a field — the `/poll` builder, rename prompts — still track the visual viewport. Re-syncing now also listens to a plain `window` resize, not just `visualViewport`: the two are not interchangeable on Android, and the settle timers only covered the first 1.5s after opening — a keyboard that hid later left the sheet short until it was reopened. Verified against a stubbed keyboard-sized visual viewport (380px on an 844px screen): `/help` opens 776px tall with Cancel back on screen, while a sheet with an input still stays above the keyboard. With a late recovery driven explicitly — a 400px `innerHeight`, then restored after every settle timer had fired — the sheet grows back to its full height instead of staying small.
- **A Drag Could Fight the Scroller** — The body-drag is allowed while the list sits at the top, and that was decided at `touchstart`, before the direction was known — so the first upward swipe of every long list started a drag and the sheet moved with the finger while the list tried to scroll under it. The direction is checked at the first move now: an upward gesture over scrollable content is a scroll, and the drag stands down.

## v0.7.0-beta

> **Note:** The directory-and-details release. Two long-standing traps are gone: "Close DM" used to delete the conversation it was closing, and a DM you closed could never be reopened — Orbit Echo worst of all, since it is not a peer you can re-add. Alongside those: the `/help` sheet was silently sized to the keyboard, notifications finally say who wrote, and the app opens on its feature tour instead of your last chat.

### Bug Fixes

- **The `/help` Sheet Was Sized to the Keyboard, and Never Re-measured** — The sheet's `max-height` is derived from `visualViewport`, and a slash-command sheet opens while the soft keyboard is still up: `_dismissKeyboard()` only *asks* it to close, and Android takes a few hundred ms to animate it away. The single measurement taken at open time therefore recorded the keyboard-up height and the sheet stayed capped to 0.7 × that for its whole life, because the `visualViewport` resize event that should correct it does not reliably arrive when the keyboard hides. On a 2400px screen that is a 996px sheet — 19 commands reduced to the three that fit, with the rest below a fold that never moved. The screenshot gave the arithmetic away: 996 = 0.7 × 1423, and 1423 is exactly what a 2400px screen measures with the keyboard open. The sheet now re-measures on a short settle schedule (0/180/450/900/1500 ms) instead of trusting one sample, and every pass re-reads the current height, so a sheet that legitimately wants keyboard avoidance — the `/poll` builder — still shrinks when its own field raises the keyboard. Verified by reproducing the device state: the sheet recovers to the full 70% cap and the stale variable is corrected, with no resize event involved.
- **`/help` Spent a Third of Every Row Repeating Itself** — Ten of the nineteen commands are invoked bare (`/help`, `/shrug`, `/flip`, `/lenny` …), and each of those rows printed a usage line identical to the command name. Those lines are gone, and row padding tightened, which took the list from 1415px to 1199px and the average row from ~150px to 57px — more of the list on screen before you scroll.
- **"Close DM" Destroyed the Conversation It Was Closing** — `closeDM` deleted `messages[userId]` and `pinnedMessages[userId]` out of state, and state is persisted — so closing a DM threw away its entire history and every pin it held. Closing now hides only the sidebar entry: the messages and pins are left exactly where they were, verified in the database and across a relaunch.
- **A Closed DM Was Unreachable Forever** — a closed DM is filtered out of the Friends tab, and the only way back was a context menu *on that row* — which was no longer there. Orbit Echo was the worst case, because it is not a peer you can re-add: closing its DM removed it permanently, which is exactly what happened. Two fixes: Echo can no longer be closed (see below), and the friends directory lists closed DMs so anything else can be brought back.
- **Background Notifications Had No Sender Avatar** — The avatar was only ever attached by the JS notification path. But the notification that actually matters — the one posted while the app is in the background — comes from the NATIVE message handler, because that path exists precisely for when the WebView is frozen. It only has the packet, and a MESSAGE packet carries no image: adding a thumbnail to every message would be absurd. The JS post does replace the native one when the WebView is still awake (same notification id, same chat), which is why the avatar appeared sometimes and not others. The renderer now pushes its friends' avatars to the native layer — on the way *to* the background, the last moment the WebView is guaranteed to be running, and once after boot — and `OrbitNotifications.setPeerAvatars` holds them for the native path to look up. Only data URLs are pushed, and the native side re-checks: a path or blob URL is rejected on both sides rather than half-working.
- **The Feature-Slide Carousel Was Showing on Mobile** — The seven-slide first-run tour renders in the *desktop* chat panel's empty state, where the panel is otherwise a bare icon. On mobile the same component was mounted in the conversation list's empty state — the first thing you see on a cold start — so a seven-slide tour sat between the user and the thing they opened the app for. Mobile shows its plain "No conversations yet" state again, and `welcome-slides.js` is no longer loaded there at all.
- **A Long Sheet Now Shows That It Continues** — Android WebView paints overlay scrollbars that appear only once you are already scrolling, and styled `::-webkit-scrollbar` rules do not change that, so a clipped list gave no hint at all. The sheet now carries a real scroll thumb, sized in proportion to the content and moved to track the scroll position, which is what "a slider to see the other commands" needs.

### Features

- **Orbit Echo Cannot Be Closed** — It is the app's own bot and the one DM that is always available, so its "Close DM" menu entry is now a locked item that explains why instead of doing it, and `closeDM` refuses outright — a UI guard alone would not survive a mis-click through another path.
- **The Friends Directory** — An **All friends** button in the Friends header (and a second click on the already-active Friends tab) opens a modal with every friend, not just the ones who are online: Echo first, then online, then offline, with closed DMs marked "Closed — click to reopen" and a click reopening them — which is the only way back to a closed DM, since it is filtered out of the tab. It carries a search box (name, tag or ID), filters (All / Online / Offline / Closed), and a list ⇄ grid display toggle; it closes on the X, on a click outside, or on Escape, and it opens the DM you pick. The header button is there in the empty state too — "no friends online" is exactly when you need the directory, to reach someone offline or reopen a closed DM. This replaced the All Friends tab: a directory is something you consult occasionally, and it should not cost a third of the tab strip for the rest of the time. It is deliberately NOT on every Friends click: switching Groups → Friends would otherwise pop a modal you have to dismiss before reaching the list you asked for. It respects the per-account chat filter, so one account's friends cannot leak into another's sidebar.
- **Orbit Opens on the Welcome Slides** — The app used to restore the last conversation it had open, which meant the chat panel's empty state — where the feature tour lives — was only ever seen once. A cold start (and an account switch) now opens with no chat selected, so the slides are the first thing you see.
- **`/help` Opens Nearly Full-Screen** — The sheet's 70% cap is sized for choosers — a context menu, the poll builder — where leaving the chat visible matters. A 19-command reference is read rather than chosen from, so it gets a tall variant at 92%: ten commands visible at once instead of three (or seven at the old cap). Chooser sheets are unaffected, and the class is cleared on every open so a tall sheet can never make the next one tall.
- **Android Notifications Carry the Sender's Face** — The small icon is the Orbit mark, so the status bar says which app it came from; the notification's large icon is the sender's avatar, so the shade says who. Profile frames are deliberately not included: a frame is a separate overlay image positioned over the avatar in the UI, never composited into it, and a notification carries one image. That is the pairing Discord uses, and it costs nothing when the sender has no avatar — the lookup returns null and the large icon is simply left off. The native decode is defensive: anything that is not a decodable image data URL is dropped rather than throwing inside the notification path.
- **One Icon for Every Notification** — Every notification now uses the Orbit mark instead of eight per-kind glyphs (a chat bubble, a phone, a tick, a sync arrow…), because the icon is how you tell which app a notification came from — the same reason Discord uses its logo for everything. On Android the mark is generated from the app banner's alpha channel at all five densities, so the system tints it correctly; the nine hand-made vector icons it replaces are deleted. The desktop notification also stops substituting the sender's avatar for the app icon. Channels are untouched, so per-kind muting and importance behave exactly as before.

### Changed

- **The People Icons Use Their Rounded Variants** — Lucide has no "rounded theme" (unlike Material Symbols): every icon already draws with round caps and joins. What it does have is a handful of `-round` **shape variants** for specific glyphs, and Orbit was using four of them un-rounded. `user`, `users`, `user-plus` and `user-x` now use their `-round` forms — rounded shoulders instead of squared-off ones — across both platforms, plus `flask-round` on the Experimental card. `key-round` was already the rounded one. Everything else in the 100-icon set has no round counterpart. Verified by rendering each pair side by side before swapping, and afterwards by scanning the live DOM for un-converted icon placeholders on both platforms — a wrong icon name leaves exactly that: an empty box.

### Technical

- **The E2E Helper Waited for a Composer That Is No Longer There** — `launchApp()` waited for `#chat-input`, which the app no longer shows at boot, so every spec timed out the moment the app started on the welcome slides. It now waits for the app shell and then opens Orbit Echo for the specs that expect a chat to be open, with `{ keepBootState: true }` to observe the real cold start — which is what the new DM/sidebar spec does. The tab spec also had to stop matching tabs by label: `hasText: 'Friends'` began matching "All Friends" too, so it locates them by `data-view`.

## v0.6.5-beta

> **Note:** The panels-and-playback release. Leaving a chat while audio was playing could strand the player outside its own bubble, in whatever chat you opened next — and once stranded it could never find its way home. The `/help` sheet and the emoji picker both had working machinery underneath but no visible way in or out. All three are addressed here.

### Bug Fixes

- **Windows Checksum Verification Could Never Have Matched** — The published manifest keeps CI's filename with spaces (`Orbit Setup 0.6.4-beta.exe`) while GitHub rewrites the uploaded asset to dots (`Orbit.Setup.0.6.4-beta.exe`), so a name-based lookup missed every time and the Windows installer would always have reported "no checksum published". Names are compared normalized (whitespace → dots) as well as exactly.
- **The Update Notice Offered the Wrong Installer on macOS and Linux** — GitHub returns release assets in **alphabetical** order, not the order CI uploaded them, so "first asset that matches the platform" was never a preference — it was luck, and against real releases it picked wrong twice. `arm64.dmg` sorts before `x64.dmg`, so an **Intel Mac was handed the Apple-silicon build**, which will not launch; and `amd64.deb` sorts before `x86_64.AppImage`, so Linux users were **never offered the AppImage** the code intended, only a `.deb` that needs dpkg and the matching distro. Selection is explicit now — architecture plus preferred format, then architecture, then preferred format, then anything that matches — with `process.arch` exposed through the preload. With no arch to go on, macOS falls back to **x64**, because Rosetta 2 runs an Intel build on Apple Silicon while an arm64 build will not run on Intel at all. The unit suite missed both bugs because its fixture listed the wanted file first, an order GitHub never returns; the fixture now mirrors the real alphabetical order and carries regression checks for each case.
- **A Playing Player Could Escape Its Bubble — and Never Get Back** — Switching chats mid-playback detached the playing audio player and then re-attached it by appending it straight into whatever feed was open. When the new chat did not contain that message there was nothing to attach to, so it was dumped into the feed as a bare full-width block outside any bubble, while the real message row re-rendered a fresh paused placeholder at 0:00. Worse, the next save read the row from that stray wrapper, got `null`, and wrote `null` over the remembered message id — so the player could never locate its row again, in any chat, for the rest of its life. Fixed in two parts: the message id is only re-read while the wrapper is actually inside a `.message-row` (a parked player keeps the id it had), and a player with no row to attach to is parked in a hidden but still-connected container rather than the feed — detaching it would pause playback, and it re-attaches by itself the next time its own chat is rendered. Same fix applied to the video player, which had the identical code path. Reproduced against the real app before and after: the pre-fix build fails 3 of 9 checks (stray player in the feed, not parked, never returns to its row); after the fix, 9/9, with playback position preserved across both switches.

### Features

- **Desktop Downloads the Update For You** — The update notice used to hand the installer to your browser and leave you to it. It now fetches the file itself into `Downloads/Orbit Updates`, shows progress with a cancel button, and verifies what landed against the release's published `SHA256SUMS.txt` before offering **Open installer** / **Show in folder**. A mismatch deletes the file rather than leaving something wrong on disk to be run by hand; a release with no manifest says "no checksum published" instead of failing. Nothing is installed automatically — the builds are unsigned, so you still run the installer yourself — and only a file this app downloaded may be opened or revealed, so the new IPC cannot be used as a general "run anything" primitive. Verified against the live release: a real 53.7 MB APK downloaded and matched the published checksum, a deliberately mismatched file was rejected and deleted, cancelling mid-download left no partial file, and a non-GitHub URL was refused.
- **The `/help` Sheet Finally Has a Way Out and a Draggable Body** — The sheet's content was already a scroller and the handle already dragged, but nothing said so: Android WebView paints no scrollbar until you are already scrolling, the drag only started on a 4px handle, and the only close control was a Cancel pill pinned *below* the fold — 19 commands down, invisible on open. Now: a close (X) button sits at the top-right where it is always on screen; the sheet body itself is draggable when the list is at the top (there the gesture cannot scroll, so a downward drag closes the sheet) and scrolls normally once you have scrolled; a thin persistent scrollbar plus a fade on the last visible line make the overflow obvious, and the fade clears at the bottom. Verified in the real app: 9 sheet checks pass, including that a body drag closes at the top and does *not* close while scrolled.
- **The Emoji Picker Grew a Header** — Same treatment as the sheets: a grab handle across the top and swipe-down to dismiss, wired through the same `enableDragClose` helper so both panels gesture alike. Tapping outside remains the primary way out — a close button was added first and then removed on Dan's call, because two ways out of the same panel is one too many. With the button gone the handle is the only in-panel affordance, so its touch target is 20px tall while the visible bar stays 4px (`background-clip: content-box`). The height is capped against the *visible* area (`min(320px, 42% of visualViewport)`) instead of a flat 320px, which on a short screen left no room for the composer once the picker's own search field raised the keyboard.
- **The Emoji Picker Remembers Your Skin Tone** — `emoji-picker-element` keeps the chosen tone only for the session, so every launch silently reset it. The picker now persists it in `localStorage` and restores it on init. Verified across a real page reload.
- **The Emoji Picker Is Actually Themed Now** — The stylesheet had been setting `--emoji-picker-background`, `--emoji-picker-border` and friends, and `emoji-picker-element` reads none of them: it uses unprefixed names (`--background`, `--border-size`, `--input-border-color`, `--indicator-color`, `--outline-color`, …). Every one of those declarations was a no-op, so the picker had been rendering the library's own defaults the whole time — a `#444` hairline around the panel and a 2px white box on whichever emoji held focus, which is the stray outline that read as "still the default from the library". Mapped onto the app theme with the real names; the library's border is switched off (`--border-size: 0`), the category indicator uses the accent colour, and the focus ring is removed outright because the library draws it on `:focus` rather than `:focus-visible`, so it fired on touch as well. Verified against the shadow DOM with the grid fully rendered: 181 emoji cells, zero elements carrying an outline.

### Technical

- **`ELECTRON_RUN_AS_NODE` Is the Second Half of the Local E2E Trap** — The desktop suite failing with a bare `Process failed to launch!` and no stderr is not the app: the host shell sets `ELECTRON_RUN_AS_NODE=1`, which makes the Electron binary start as plain Node, so no app code ever runs. It sits alongside the already-documented `NODE_OPTIONS` trap (which produces the more specific `bad option: --remote-debugging-port=0`). Both must be cleared: `env -u NODE_OPTIONS -u ELECTRON_RUN_AS_NODE npx playwright test --shard=1/2`. Recorded in AGENTS.md with the two symptoms distinguished, since the unhelpful one costs an hour.

## v0.6.4-beta

> **Note:** The audio polish release. The visualiser was drawing frequency bars on a timer but had no sense of the track itself: Visualiser → Off showed nothing, the other modes showed a flat decorative row, and neither renderer was passing the file name to the player even though both knew it. The ⋮ menu had two items. The third panel of the app was a bare icon and a placeholder line. All five are addressed here.

### Features

- **A Real Waveform in the Audio Player** — Visualiser → Off used to show nothing; the other modes showed a flat decorative row even on an unplayed bubble. All three modes now draw the track's actual decoded waveform, fetched and decoded once per file and cached by URL so re-renders never re-decode. The decode is bounded hard at 12 MB (a typical track peaks around 30–60 MB of transient PCM, freed the moment the peaks are computed); oversized files and failed decodes fall back to the flat resting row, which is geometry rather than data and never pretends to be the track's shape. The fetch runs off the playback path exactly like the cover art.
- **The Audio Player's File Name, Above the Timer** — Both renderers were passing the name, but neither renderer was passing the name *to the player*. They now do, on both platforms; the timer and the name sit in a `.oap-meta` block that took over the `margin-left:auto` from the old `.oap-time`, so the pair still rests at the right of the row, the wrapper is what shrinks, and a long name ellipsises instead of shoving the volume button off the row. When there is no name (older history, nameless attachments) the element is dropped and the row collapses to exactly what it showed before.
- **More Settings in the ⋮ Menu** — Loop and Playback Speed were the whole menu. It now also carries **Visualiser** (Bars / Wave / Off — Off is now the real decoded waveform), **Time** (Elapsed / Remaining → `0:12 / -2:32`), and **Copy file name**, which routes through `orbitAPI.writeClipboard` on desktop because `file://` is not a secure context there. Five items total, each surfaced because the underlying capability already existed rather than invented.
- **The Volume Icon Shows the Level** — The speaker icon at the right end of the progress bar had two states: muted, or loud. It now mirrors the slider position — muted or 0% shows the crossed-out speaker, 1–50% shows one wave, 51–100% two — so the icon reads as a level meter before the popover is even opened. It also follows every path that can change audibility, not just the slider: the `m` key, pressing play after an `m`-key mute (which unmutes — the icon no longer lags that), and dragging away from zero while muted. The mobile autoplay-policy mute applied before first play is deliberately not reflected in the icon, because `doPlay()` unmutes before any sound and a crossed-out icon at rest would read as "broken". Verified in the real app at every threshold — 51/50/49/1/0, both mute paths, play-after-mute, and the popover open/dismiss regression (14/14).
- **First-Run Feature Slides in the Chat Panel** — The third panel was a bare icon and "Select a friend to start chatting". It now carries a 7-slide carousel describing what Orbit actually does — peer-to-peer with no server, end-to-end encryption with key-change warnings, file / photo / video sharing, calls and voice notes, groups, local-first storage and backup, and theming. Dots + Back/Next, arrow-key navigation, and the slide position is remembered in `localStorage` so a re-render — which happens on every store change — does not snap the user back to slide one. "Done" on the last slide collapses to the plain empty state rather than pretending the carousel is a gate; the panel is still just waiting for a chat. Desktop renders it into `#chat-container`; mobile into the conversation list's empty state. Content is written to be true of the shipped build, not aspirational: if a feature is not in the build, it is not in a slide.

### Bug Fixes

- **An Unplayed Audio Bubble Was a Large Blank Rectangle** — The visualiser's draw loop only drew while playing, so an unplayed bubble showed a 400×200px box with nothing in it. The box now shows the resting bar row in the Bars / Wave modes and the real waveform in the Off mode. The two idle states are deliberately the visualiser's own shapes rather than invented waveforms, so neither ever pretends to be the track's audio data.
- **The Audio Draw Loop Spun Forever** — `draw()` re-requested a frame even when paused, so every player that had ever been played held a 60fps `requestAnimationFrame` callback alive for the rest of its life. In a feed of audio messages that is a lot of wasted frames, and on battery it is real. The loop now stops the moment `playing` becomes false (pause, stop, end of track) and is restarted by `doPlay()`. Verified with a harness driving the centre overlay button — the rAF counter goes from 1 to 132 while playing, then freezes at 134 across 900ms of pause instead of climbing forever.
- **SHA256SUMS Filename Mismatch (macOS / Linux)** — The macOS and Linux checksum entries were generated with `shasum -a 256 "$f"` where `$f` is a path like `dist/Orbit-0.6.4-beta-x64.dmg`, so the entry in `SHA256SUMS.txt` read `<hash>  dist/Orbit-0.6.4-beta-x64.dmg`. A user downloads the bare filename (`Orbit-0.6.4-beta-x64.dmg`) and runs `sha256sum --check SHA256SUMS.txt --ignore-missing`; the entry does not match the local filename, so `--ignore-missing` silently skips it and verification passes without ever checking the file. Windows and Android already used the bare filename. All three generation steps (macOS, Linux, and the fallback consolidation path) now extract the hash and pair it with `basename`, matching the Windows format. Reproduced locally: buggy entry → "no file was verified"; fixed entry → `Orbit-0.6.4-beta-x64.dmg: OK`.
- **The Volume Slider Wasn't Full at 100%** — The popover slider kept its 6px horizontal padding, and Chrome paints the native `accent-color` fill only up to the content-box edge while the track itself bleeds into the padding — so at 100% a ~5px gray tail stayed visible after the knob (measured: fill ended at 75 of an 80px track). The track is now custom-painted: a gradient driven by a `--oap-fill` variable that the player sets from JS on creation and on every input, so the fill is flush at 100% and proportionally exact at every value, with a styled thumb matching the native accent circle. Firefox paints `::-moz-range-progress` natively, so no variable is needed there. Verified by pixel-measuring element screenshots in the real app: flush at 100%, thumb position within 1px of the expected travel at 30% and 80%, thumb-only blue at 0%.

### Technical

- **The Audio Player's Play Button Is the Centre Overlay** — The centre overlay (play / stop / ±10s) is and has always been the play control — it appears on hover or tap over the waveform, on both platforms. A row-level play button was appended at the leading edge briefly during this work and then demoted back to dead code on Dan's request; the centre overlay is the one users see in screenshots, and the row button was redundant. `playBtn` is still created and its icon is still maintained in state changes (harmless on a detached element), but it is no longer appended to the DOM.
- **Mobile `renderChatList()` Delegates** — `renderChatList()` in `mobile/src/js/app.js` delegates to `OrbitHome.renderChatList` in `mobile/src/js/components/home-screen.js` and returns. The empty-state branch in `app.js` is only a fallback that runs when the module-level function is unavailable; the live empty state lives in `home-screen.js`. Editing the fallback first produced no carousel at all. Worth remembering: a module-level wrapper that just calls into a real implementation is not itself the render entry.
- **Settings Persistence Was Verified, Not Assumed** — `updateSettings()` writes electron-store, while boot reads the SQLite table via `dbGetAllStartupData()`. That looked like a settings-reset-on-restart bug from reading the code. A harness launched the desktop app twice against the same user-data-dir and toggled a setting through the Settings modal — the setting survived the relaunch. The SQLite row lags until quit, so a *crash* between a toggle and shutdown could still lose that setting; closing it cleanly means calling `_persistSettings()` from `updateSettings()`, which is a one-line follow-up rather than an outstanding bug.
- **`@keyframes msg-slide-in` was removed in v0.6.3** — the duplicate had already been cleaned up; no further work needed.
- **Version:** Bumped to v0.6.4-beta across all three `package.json` files and the lockfiles; `mobile/src/js/version.js` regenerated.
- **Mobile Quick-Add Dead Wire Removed** — `home-screen.js` had a DOMContentLoaded listener that looked up `#btn-add-quick`, an id that does not exist in the DOM. The real quick-add button is `.btn-add-quick-online` in the online-friends row, wired via the delegated click listener on `#online-friends-row`. The dead wire resolved to `null` harmlessly, but a future edit "fixing" it by renaming the id or adding the missing element would have opened the quick sheet twice. Removed with a comment pointing at the real wiring.
- **Mobile "New Chat" Dead Wire Removed** — `app.js` looked up `#btn-new-chat`, an id that never existed in the HTML or any dynamic injection. The handler would have shown a toast and navigated to the Friends tab, but no element ever triggered it. Same class of dead wire as `#btn-add-quick` above — harmless now, a trap later. Removed with an explanatory comment.

## v0.6.3-beta

> **Note:** The file-transfer release. Sending a file was broken on **both** platforms, for a different reason on each: desktop threw before the first chunk was ever sent, and mobile's transfer start could be overtaken by its own chunks. Attachments now show what they actually are — the album art embedded in an audio file, the opening frame of a video — the tray menu became something worth right-clicking, and text finally sits in the same place on both platforms.

### Features

- **Audio Attachments Show Their Embedded Album Art** — An audio file often carries a cover image, and Orbit was ignoring it entirely. The player now reads it out of the file and shows it beside the controls, falling back to a music note when there is none. It handles the three containers that carry artwork in practice: ID3v2 `APIC` (and the older v2.2 `PIC`) for MP3, the `covr` atom for MP4/M4A, and the `PICTURE` block for FLAC. The parse is pure, synchronous and never throws, because a malformed tag must not be able to break playback. Reads are bounded to a 2MB slice at the head plus a 2MB slice at the tail, so a 100MB track costs 4MB of reading rather than being pulled into memory whole, and the read is deferred off the playback path entirely. Ogg/Opus artwork (`METADATA_BLOCK_PICTURE`) is deliberately not handled — it is base64 buried inside a comment header, awkward to bound-check, and rare; those files get the music note.
- **Video Attachments Show Their First Frame** — An unplayed video was a black rectangle with a play button on it. It now shows the opening frame, captured from the video itself once the first frame is decoded, or taken from a poster the renderer already knows about when there is one. It hides the moment you press play, comes back if you press Stop (which rewinds to the start), and deliberately does **not** come back on `ended` — there the last frame is the truth. Desktop was also not passing a known poster down to the player at all, so it now does, matching mobile.
- **A Tray Menu Worth Opening** — The tray menu had two items: open, and quit. It now carries the things you would actually reach for without wanting to restore the window: **Copy My Orbit ID** (your `name#tag`, straight to the clipboard), a **My Status** submenu (Online / Away / Busy / Invisible) that also broadcasts the change to connected peers immediately rather than waiting for the next beacon, a **Mute Notifications** toggle, **Check for Updates**, and **Lock Orbit** — which only appears when a PIN is actually set. Open Orbit also restores and focuses the window now, instead of just showing it. The menu is rebuilt whenever state changes, because Electron fires no "about to open" event for a tray; and the renderer stays the single writer for presence and mute, reporting the result back so the radio and checkbox items reflect what actually happened rather than what the main process assumed would happen.

### Bug Fixes

- **Desktop: Every File Send Threw Before the First Chunk Went Out** — `CHUNK_SIZE` was declared as a local `var` inside `sendMessage()` but used in `_sendFileChunks()`, a separate class method. Out of scope, so the very first chunk send threw a `ReferenceError`, no file ever transferred, and nothing appeared in the chat at all. The comment already sitting above `_sendFileChunks` shows someone knew the chunk path needed the same helpers and carried over `sendToAll` — but missed the constant. Hoisted to module scope so both methods share one value.
- **Desktop: Attaching a File Produced No Message Whatsoever** — Both staging sites read `file.path || file.name`. Electron 32 **removed `File.path`**, so that silently fell through to a bare filename with no directory — which the transfer cannot open, so the send produced nothing. The `||` fallback is what hid it: it looked defensive and never threw, it just quietly produced a value that could not work. Now uses `webUtils.getPathForFile` through the preload, at both the file-input and the drag-and-drop site — the identical bug, found by grepping for the pattern rather than assuming there was one place.
- **Mobile: Chunks Could Overtake the Start That Gives Them Context** — `FILE_TRANSFER_START` had been routed through the offline outbox so an attachment to a briefly-unreachable peer would wait instead of failing. But the outbox enqueues and flushes **asynchronously**, while the chunk driver starts **synchronously** right after — so chunks could reach the receiver before the START that explains them. Ordering is a hard requirement here: a receiver cannot interpret a chunk without it. Reverted to a direct synchronous send.
- **Desktop: Reading an Attachment's Own Bytes Was Blocked by the CSP** — The renderer's `connect-src` listed neither `blob:`, `orbit-db:` nor `orbit-file:`, even though `img-src` and `media-src` both do. The browser refused the read outright ("Refused to connect… because it violates the following Content Security Policy directive"), so album art silently never appeared on desktop while working perfectly on mobile. `orbit-db:` and `orbit-file:` matter as much as `blob:` — those are the URLs used for attachments restored from the database after a restart, so without them artwork would appear on a fresh receive and then vanish on relaunch. Worth remembering as a class: on desktop, any `fetch` or XHR of attachment bytes is CSP-gated, and a URL that `<img>` or `<video>` can render is not automatically one you can read.
- **Playing Media Stopped Whenever the Feed Re-rendered** — Both shared players looked the message feed up as `#chat-message-feed`, which is desktop's id; **mobile's feed is `#message-feed`**. On mobile the lookup returned `null`, so `restorePlaying()` could never re-attach a player it had just detached, and the feed rebuild produced a fresh paused one. The symptom was specific and annoying: you are listening to a voice message, a new message arrives, and your audio stops. Both players now resolve the feed through a helper that accepts either id, and look the message row up document-wide rather than through the feed — so the main path no longer depends on the feed's id at all. Removing a media element from the document pauses it, so a re-attached player is also nudged back into `play()`; without that the wrapper would return but stay silent.
- **Text and File Were Arranged Differently on Each Platform** — Mobile composed a bubble as text-then-attachment; desktop composed it as attachment-then-text. A desktop send puts the text and the file into one message, so its bubble showed the file with the text underneath, while mobile sends them as two messages and its text bubble came first. The same message therefore read one way on desktop and the other way on mobile. Desktop now matches mobile — which is also the only order that can be consistent everywhere, because on the receiver the text arrives as its own message and the file completes later, so the text bubble is necessarily above the file.

### Technical

- **The Transfer State Machine Now Has Tests** — The desktop chunk/ACK/RESUME engine (`desktop/src/js/network/transfer.js`) had no automated coverage at all. It is a CommonJS module, so it turned out to be directly testable in Node with a fake socket manager — no Electron and no browser needed. Thirteen cases now cover the invariants that matter, above all that **a chunk gap triggers a resume and writes nothing** (verified by reading the partial file back), which is exactly the invariant the mobile ordering bug violated. Also pinned: duplicate chunks are ignored rather than double-written, a repeated START does not reset progress, an END from a peer that does not own the transfer is refused, and a hash mismatch on a *fresh* transfer saves anyway — that last one is deliberate, since Android WebView and desktop hash differently and losing the user's file would be worse.
- **`@keyframes msg-slide-in` Was Declared Twice** — The earlier copy animated `bottom: 24px` on a `position: relative` row and never applied, because a later `@keyframes` with the same name wins outright. Dead code, but a trap for anyone editing the animation. Removed, with a comment pointing at the surviving definition.
- **Cache-bust stamps moved to a distinct value** for the mobile files re-touched after the previous release, so a device holding the earlier stamp does not serve stale JavaScript.
- **Version:** Bumped to v0.6.3-beta across all three `package.json` files and the lockfiles; `version.js` regenerated.

## v0.6.2-beta

> **Note:** A fix release. Notifications were arriving in the shade with nothing beside the clock, and the in-app update check could not reach GitHub at all.

### Bug Fixes

- **Notification Icons Were Invalid, Not Just Missing** — The generated VectorDrawables set their paint attributes on a `<group>`, which only accepts transform attributes. An invalid drawable fails to inflate, so `setSmallIcon` was handed something broken: the notification appeared in the shade while the status bar stayed empty. Paint attributes now sit on the `<path>`, where they are valid, and the nine icons were re-rendered at 24px and 72px to confirm each still reads — tick-in-circle, @, speech bubble, wifi arcs, refresh arrows, cloud-download, camera, handset, warning triangle.
- **The In-App Update Check Could Not Fetch** — The mobile transport looks for `Capacitor.Plugins.CapacitorHttp`, but the plugin was not installed and `CapacitorHttp` was not enabled in `capacitor.config.json`, so it fell through to `window.fetch` and hit WebView CORS from the `https://localhost` origin. Enabling `CapacitorHttp` routes fetch through native code.
- **…And That Fix Broke the Download** — CapacitorHttp buffers response bodies, so `body.getReader()` is unavailable and the APK download threw "Streaming download is not supported in this WebView" — the change that fixed the update *check* broke the update *download*. It now streams when it can and falls back to a buffered write when it cannot.
- **The Download No Longer Requires `content-length`** — A Response without headers turned a working download into "Cannot read properties of undefined". The length only drives the progress readout, so it is now optional.
- **Builds Under Gradle 9** — `getDefaultProguardFile('proguard-android.txt')` was removed in Gradle 9 and failed at configuration time. Switched to `proguard-android-optimize.txt` as Gradle's own error directs; `minifyEnabled` is false, so the line is inert either way.

### Technical

- **`CapacitorHttp` Is Not a Local Change** — Enabling it patches `window.fetch` and `XMLHttpRequest` for the entire app. Every `fetch(` in mobile was audited: one streamed consumer (the updater), one `arrayBuffer()`, the rest `.json()`, and no XHR at all — and both bugs it introduced were in the same function.
- **Version:** Bumped to v0.6.2-beta across all three `package.json` files.

## v0.6.1-beta

> **Note:** Bug fixes for v0.6.0. The headline is that notifications never actually appeared — the permission Android requires in order to post them was never declared, so the system silently dropped every one. Large file transfers no longer exhaust the phone's memory, and a message no longer announces a video it has not received yet.

### Bug Fixes

- **Notifications Never Appeared — Android Was Dropping Every One** — `POST_NOTIFICATIONS` was **never declared in the manifest**. On Android 13+ that permission therefore cannot be granted, so the security check always failed, the exception was swallowed with a comment asserting the user had declined, and the system discarded every notification before it reached the status bar. The permission is now declared, and — because declaring it is not enough — requested at runtime on API 33+, so the prompt appears on first launch. This also explains why the three notification bugs fixed in v0.6.0 (a channel that was never created, an icon that never existed, a foreground listener from a plugin that is not installed) never produced a visible result: notifications were being rejected at the door regardless.
- **Large Transfers Exhausted the Phone's Memory** — The receiving side held the whole file in memory, three times over. Each chunk arrived as a base64 string, so a 133 MB video occupied roughly 356 MB of the heap as UTF-16 characters; at the end every chunk was decoded into a second full copy, and then merged into a third. Peak was around 620 MB, which OOMs an Android WebView — the renderer died, the socket reset, and the sender saw `ECONNRESET` and retried forever, restarting the transfer each time. Chunks are now decoded on arrival and held as bytes, which removes the UTF-16 overhead, turns the periodic checkpoint into a reference copy instead of duplicating the file, and eliminates the decode-and-merge step. Peak for the same file is now roughly 266 MB.
- **The Receive Cap Was Set As If Memory Were Free** — The existing 5000-chunk cap allowed a 320 MB file, sized as though the receiver needed only one copy of it. It needs about two. A 133 MB video passed the cap and then OOMed. Lowered to 2400 chunks (~150 MB), and an oversized transfer is now refused with a clear message instead of being accepted and hanging forever.
- **A Message No Longer Claims To Be A File It Has Not Received** — Sending a large file put a marker on the text message so the receiver could merge the two into one bubble, which meant the bubble appeared immediately captioned "Receiving Video..." — announcing a video that had not arrived, and would not for some time. Text and file are now separate messages: the text arrives as its own bubble, and the file as its own when the transfer completes. Small inline attachments still ride with the text, unchanged.
- **The Gallery Reset the Sidebar to DMs** — Changing the gallery's display style called `setState`, which re-rendered the sidebar — and the sidebar built its buttons from a single signal, `activeView === 'folders'`, marking DMs active whenever you were anywhere else. The gallery is tracked by `activeTab`, not `activeView`, so it was never considered, and the gallery button had no active logic of its own. Both now derive from state.

### Technical

- **Chunk storage changed shape, so every consumer had to change with it.** Storing `ArrayBuffer`s instead of base64 strings would have broken three other sites that assumed strings: the resume path (which rebuilt the entire received prefix to hash it — on every retry, at exactly the moment the transfer was already struggling), the merge loop, and a partial-size readout whose `.length` is `undefined` on an `ArrayBuffer`. A `_chunkToBytes()` helper accepts either shape, because partials written by older builds still hold strings and resume would otherwise break for anyone mid-transfer during the upgrade.
- **`MAX_RECEIVE_CHUNKS` is deliberately a named, tunable constant** with the memory reasoning in the comment. Removing the need for a cap at all means streaming chunks straight to storage rather than merging them, which remains outstanding.
- **Version:** Bumped to v0.6.1-beta across all three `package.json` files and `package-lock.json`; `version.js` and the Android bundle regenerated.

## v0.6.0-beta — **Stable Release**

> **Note:** The reliability release. Notifications had never actually appeared in the background — for three separate reasons, all now fixed. A message to someone who is offline now waits instead of vanishing. The Local Vault can back up a full account, and for the first time the backup can leave the device. Android updates install from inside the app. And the avatar frames, which had drifted into six different geometries, are one.

### Features

- **Android Notifications** — Orbit now posts real system notifications for incoming messages, @mentions, incoming calls, available updates, and background work, each on its own channel with its own icon. Six channels (messages, mentions, calls, updates, background, service) let the OS treat them differently — a call can be urgent while a backup stays silent. The nine icons are generated from the Lucide set the app already vendors, so they match the icon language everywhere else rather than being invented shapes. Messages group by chat, so a burst from one person collapses into a single entry instead of stacking.
- **Messages to an Offline Peer Now Wait** — Orbit had no send queue at all: every send was fire-and-forget, so a message to a peer who was not currently connected was simply gone. On a LAN that is constant — a laptop lid closes, a phone leaves Wi-Fi range — and it was silently dropping messages. A failed send is now queued by the transport itself and re-sent the moment the peer reconnects. Note the honest limit: that queue lives in memory, so it covers a peer who is briefly away, not a message sent and then left over an app restart. Queued bubbles show a quiet hourglass so a message never looks delivered when it is not. Typing, presence, reactions and call signalling are deliberately **not** queued — a typing indicator five minutes late is worse than none, and a stale call offer is actively harmful.
- **Local Vault v2: it can back up a real account** — v1 assembled the entire backup as one in-memory object, stringified it and wrote it in a single call. Against 500 MB+ that cannot fit an Android WebView heap, which is why it needed a byte budget and could only ever produce a partial backup. v2 writes a directory instead: a small manifest plus one file per 8 MB chunk, so peak memory is a single chunk rather than the whole account. Each chunk is sealed independently (its own IV, prefixed to the sealed bytes) which is what makes per-chunk streaming possible at all — v1 encrypted the whole payload as one ciphertext. The manifest is written **last**, so an interrupted export can never be mistaken for a complete one. v1 `.json` backups still restore, and the picker labels which is which.
- **The Backup Can Finally Leave the Device** — The vault lives in app-private storage, so a backup could never actually be retrieved — which rather defeats the point. After an export Orbit now offers to save a copy to **Downloads** (via MediaStore, the only way to write somewhere a file manager can see on Android 10+ without a storage permission), falling back to the system share sheet. The vault is zipped natively first, so the platform's DEFLATE does the work and the result is a single artifact you can hand to Drive, Files, or another device.
- **In-App Android Updates** — Orbit is sideloaded, so an update has to go through the system installer. The update dialog now does the whole thing: streams the APK with a progress readout, hands it to the installer, and then offers to close the app so the new version can start. Android requires the user to have allowed "install unknown apps"; if they have not, Orbit sends them to the right settings screen and says so plainly instead of failing silently.
- **Diagnostics Screen** — A LAN app fails for reasons that are invisible from inside the app: wireless isolation on the router, a host firewall, two devices on different subnets, a port already taken. From the user's side they all look identical — nobody shows up — and each needs a different fix. Settings → Diagnostics (**mobile**; desktop keeps its own P2P Diagnostics panel, which is a technical state dump rather than this) reports what Orbit can actually observe (networking available, discovery running, listening port, how many contacts are reachable, open connections, how many messages are waiting) and names the likely cause for whatever is wrong. It also copies out as a plain-text report for a bug report.
- **Attachments to an Offline Peer Now Queue Too** — The offline send queue covered messages, but a file transfer's START packet still went out fire-and-forget, so the message arrived with metadata for a file the receiver never got. START is metadata-only, so it now goes through the same outbox and the transfer begins as soon as the peer is reachable. **Limitation worth knowing:** the file bytes live in memory, so a queued START does not survive an app restart — it covers a peer who is briefly away, not a transfer resumed the next day.
- **Key-Change Warnings** — Keys are pinned on first use, but pinning without ever checking again is only half the job: if a peer’s key changed later, Orbit accepted the new one silently. That is the classic man-in-the-middle gap, and for an app whose whole pitch is that your conversations stay yours, accepting a swapped key without a word undermines the claim. Orbit now fingerprints each peer key (SHA-256 truncated to a readable eight bytes) and, when it changes, says so loudly, marks the contact, and raises a notification. A key legitimately changes when someone reinstalls, so this does not block the chat — it tells you, which is the part that was missing. Detection is wired into all four places a peer key is learned: QR pairing, the connection handshake, and both discovery paths.
- **Avatar Frames, Finally Consistent** — Frames were positioned with six different sets of magic numbers across roughly fifteen surfaces — `-16%`/`125%`, `-13%`/`120%`, `-15%`, `-1px`, and fixed pixel overrides including an `object-fit: fill` that stretched the art. The same frame therefore composed differently in the friends tab, the chat header and the profile panel. One rule now governs every surface.
- **Delete a Stored Backup** — Nothing ever pruned old backups, so every export left a full copy in app storage. Each backup in the restore list now has a delete action, with a confirmation that names the file. There is deliberately no automatic cleanup: silently deleting someone's backups is a worse failure than using disk.

### Bug Fixes

- **Background Notifications Had Never Worked — Three Independent Causes** — Each of these alone was enough to lose every notification, which is why the feature appeared to simply not exist:
  1. The native path posted to a channel called `orbit_messages` that **nothing ever created**. On Android 8+ a notification posted to an unknown channel is silently dropped.
  2. The JavaScript path referenced `smallIcon: 'ic_stat_icon'`, **a drawable that has never existed in the project**.
  3. The app's foreground/background listener came from `@capacitor/app`, which **is not installed** — so the listener never registered, `_appIsBackgrounded` stayed `false` forever, and the native side was never told the app had backgrounded. Its notification path is gated on exactly that, so it never ran. The plugin now tracks the activity lifecycle itself and emits the event, which is both dependency-free and more reliable: the whole point is to work while the WebView is paused.
  Separately, every notification used `android.R.drawable.ic_dialog_info` — Android's built-in info icon, which is the generic "i" that had been showing for everything.
- **Auto-Backup Silently Wrote Unencrypted Backups** — Auto-backup fires on app-background with no UI, so the passphrase field is empty. The old code warned that it was "exporting unencrypted" and then did exactly that. Anyone who had deliberately enabled encryption was getting plaintext backups written on a timer — precisely the case encryption exists to prevent. It now cancels instead of downgrading.
- **Vault Chunk Filenames Could Collide (Silent Data Corruption)** — Chunk files were named from the *sanitised* key plus the chunk index. Two different keys can sanitise to the same string — `a@b` and `a#b` both become `ab` — so they wrote to the same path, the second overwriting the first, and **both manifest entries would then restore from the survivor**. An attachment could come back as a different attachment. Names are now derived from the entry and chunk indices, which are unique by construction.
- **The Vault Reported 0.0 MB on a Full Account** — The export summary counted only the IndexedDB blob store. Messages and small attachments live in localStorage as inline `data:` URLs, so an account full of images reported "0 attachments · 0.0 MB" while the backup was perfectly complete. The summary now totals both and shows the split, which makes it obvious where the weight actually is.
- **Avatar Frames Were Off-Centre** — A 125%-wide overlay needs `top/left: -12.5%` to stay centred; nine sites used `-16%`, shifting the art by about 3.5% of the avatar. The scale itself was right — the art is a wreath authored to wrap around the circle, which was confirmed by compositing real frames over a plain circle at several scales and comparing.
- **The Vault Picker Showed "invalid date"** — Chunked backups are directories, and a directory listing returns a name with no timestamp. The date is now read from the folder name.
- **Old Backups Accumulated Forever** — Nothing removed an old backup, so app storage grew by a full copy per export. Now deletable from the restore list (see Features).
- **Desktop Avatar Frames Were Wrong Too** — Desktop drew frames at 100% of the avatar, so the wreath art hugged the edge instead of wrapping around it. Same correction as mobile: 125%, centred. Both platforms now agree.
- **Restoring a Vault Held Every Attachment in Memory at Once** — Blobs are restored in small batches rather than one `Promise.all` over the whole set.
- **A Duplicated Lifecycle Listener** — The native foreground listener had been registered twice, so foreground recovery and the notification flush both ran twice on every foreground.

### Technical

- **`OrbitNotifications`** — One class owns every channel id, the `Kind` enum mapping each notification type to its channel, icon and priority, and the posting logic. Channels are created up front so a channel can never be missing when something posts to it. Note that channel settings are immutable once created — changing an importance later requires a new id.
- **Notification Icons Are Generated** — `mobile/scripts/gen-notification-icons.cjs` derives nine vector drawables from the Lucide bundle already in the repo (ISC-licensed), converting Lucide's node format to Android path data, including `circle`/`rect`/`line` to arcs since VectorDrawable has no such primitives. Kept in the tree so they can be regenerated rather than hand-edited.
- **`BlobStoreDB.eachKey()`** — Walks a store one record per transaction, awaiting the handler between records. Deliberately **not** a cursor: an IndexedDB transaction auto-commits as soon as the microtask queue drains with no pending request, so awaiting a slow handler before `cursor.continue()` throws "The transaction is not active". Reading the key list first and fetching each value in its own short transaction keeps memory bounded while still allowing async work.
- **The Vault Is a Directory Because of One API Detail** — Capacitor's Filesystem plugin can `appendFile` but `readFile` has no offset or length, so it always returns the whole file. A single-file vault could therefore be *written* incrementally but never *restored* without loading all of it. One file per chunk bounds memory in both directions.
- **Version:** Bumped to v0.6.0-beta across all three `package.json` files; `version.js` and the Android bundle regenerated.

## v0.5.3-beta

> **Note:** Calling release — Android gains the voice and video calling it never had, both platforms get a real ringtone and a call log in the chat, and the Local Vault's encrypted export is fixed after never having worked at all. Plus the bottom-sheet close/scroll fixes and a vault budget that tunes itself to the device.

### Features

- **Voice & Video Calling on Android** — Android had the protocol (`CALL_OFFER` / `CALL_ANSWER` / `CALL_ICE_CANDIDATE` / `CALL_END` / `CALL_DECLINE` have been in `shared/network/protocol.js` since v0.1.1) but no implementation behind it: the five packet types were simply ignored on arrival. New `mobile/src/js/components/call-manager.js` adds the whole stack — outgoing calls, incoming ring with Accept/Decline, mute/speaker/camera toggles, a duration timer, picture-in-picture self-view, and full teardown that stops every track so the microphone indicator does not stay lit. Signalling rides the existing P2P transport, so it is encrypted in transit like any other packet, and no protocol change was needed. Capacitor's `BridgeWebChromeClient` already maps the WebView's audio/video capture request onto the runtime `RECORD_AUDIO`/`CAMERA` grant and the manifest already declared them, so `getUserMedia` works without touching `MainActivity` — which has no permission handling of its own. Verified against a real two-peer harness (two renderers, real `RTCPeerConnection`, synthetic camera and microphone): voice and video both connect in both directions, and decline, busy and hang-up all tear down cleanly.
- **Real Ringtone on Both Platforms** — `shared/sounds/Call-ring-1.mp3` now rings while a call is ringing, looping for **1m30** before it stops. Capacitor sets `setMediaPlaybackRequiresUserGesture(false)` on the Android WebView, so the ring plays on an incoming call with no user gesture; desktop's CSP already allowed local media via `media-src 'self'`. Desktop calls were previously **completely silent** — there was no ringtone at all. The ring window doubles as the no-answer timeout, and a callee whose ring expires is dismissed as a missed call rather than being left on a stuck ring screen. The generated two-tone beep survives as a fallback so a missing asset cannot mean a silent incoming call.
- **Call Log Entries in the Chat** — A finished call now leaves a message in the conversation showing the kind of call, how long it lasted, and a **Call again** button that redials the same kind. It is stored as an ordinary message with a `call` object instead of `text`, so it inherits timeline ordering, a timestamp, unread counts and deletion with no new packet type — the same shape polls already use. Outcomes cover `ended` (with the duration, formatted `m:ss` or `h:mm:ss`), `missed`, `declined`, `no-answer`, `busy` and `failed`, with the non-answered ones rendered muted so they read differently at a glance. Each side records its own entry when the call tears down, which keeps history intact even if a `CALL_END` is lost. On mobile the entry also creates the chat if it does not exist, because a call can arrive from someone you have never messaged.
- **Call Button Reachable From the Chat (Mobile)** — The chat "more" sheet offers Voice Call and Video Call for direct messages, resolving the peer from the open chat (`dm_` prefixed chat ids included).

### Bug Fixes

- **The Encrypted Vault Export Never Worked (Critical)** — `_vaultCrypto()` returns `window.crypto.subtle`, and `_vaultEncryptPayload` then called `c.getRandomValues(...)` on it — but `getRandomValues` is a method of `crypto`, not of `crypto.subtle`. Every encrypted export died on its first line with `TypeError: c.getRandomValues is not a function`, before any encryption happened. The `catch` block toasted and returned `null`, so the feature looked flaky rather than broken, and with auto-backup enabled it failed silently in the background. Fixed with a `_vaultRandomBytes()` helper, plus an explicit "encryption is unavailable in this build" message instead of a cryptic TypeError. Verified end to end: export with a passphrase produces a file that is genuinely encrypted (the plaintext marker is not present in it), and restoring it brings back both localStorage data and IndexedDB blobs.
- **Local Vault Still OOM-Killed the Renderer on a Real Account (Critical)** — The v0.5.2 budget only covered the `blobs` store. The `partials` store — base64 chunks of **in-progress** file transfers, up to 500 MB — was copied into the payload with no budget at all. Measured with a realistic account (12 chats of 700 messages, four 8 MB attachments and one interrupted 40 MB transfer), the payload reached **101 MB serialised and about 290 MB at peak**, dominated by 55.9 MB of partials. An Android WebView OOM is not catchable, which is the reported "app shuts down" — and it explains why it failed every time rather than intermittently. One budget now covers blobs and partials **together**, measured by **serialised** size (base64 is four characters per three bytes, so the old raw-byte check let 1.33x more through than it thought), and the two stores are walked in separate passes with **attachments first**, since a partial is only resumable-transfer state while a finished attachment is user data. Separate passes also make the result deterministic; sharing one transaction meant the budget went to whichever cursor happened to run first. The measured payload fell to 22.9 MB.
- **The Vault Budget Is Now Self-Tuning** — A fixed 32 MB is the wrong number for both a desktop and a low-memory phone. The budget is now derived from the WebView's own heap ceiling (`performance.memory.jsHeapSizeLimit` at 8%, clamped to 4-32 MB), and the encrypted path gets **half** of it, because encrypting additionally holds the JSON string, a `TextEncoder` copy of it, the ciphertext and a base64 of the ciphertext at once. Verified by simulating a 192 MB heap: the budget dropped to 15.4 MB on its own and the export still succeeded. The extra full copy from `new Blob([json]).size` is gone (the payload is ASCII-dominant base64, so `json.length` is a good byte proxy and costs no allocation), and the object graph is released before the bridge write.
- **Vault Restore Held Every Attachment in Memory at Once** — Restore built a single `Promise.all` over every blob write, so each decoded ArrayBuffer stayed live until all of them finished — the same shape of problem the export had. Blobs are now decoded and written in sequential batches of three, and the raw file string is released before the object graph is walked. The recorded `attachmentsExcluded` metadata is also surfaced in the restore toast, which the v0.5.2 comment promised but nothing ever read.
- **Mobile Bottom Sheet Could Not Be Closed** — Two independent causes. First, the Cancel pill was appended to `#bottom-sheet`, which was itself the scroll container, so on any sheet taller than the 70% cap it sat at the very bottom of the scroll — measured at y=2153 in a 754px viewport, about 1400px below the fold and effectively unreachable. Second, `hide()` only removes the `.active` class, but the drag-to-close handlers write an inline `transform` on every `touchmove` and **neither drag implementation handled `touchcancel`** — which Android fires routinely when the WebView claims a gesture. The inline transform then outranks both the open and closed CSS rules, so `hide()` visibly did nothing, permanently. The sheet is now a flex column whose content is the scroller with `min-height: 0`, the Cancel pill is a pinned footer outside it, `_resetSheetTransform()` runs on open and close, and both drag blocks handle `touchcancel`. Verified: the Cancel pill moved from y=2153 to y=699, `elementFromPoint` now returns the button itself, and a deliberately injected stale transform no longer defeats `hide()`.
- **Some Bottom Sheets Would Not Scroll** — The sheet's `max-height` used `70vh`, which resolves against the **layout** viewport that Android does not shrink for the soft keyboard, while the overlay is sized from `visualViewport.height` — so with the keyboard up the sheet could be taller than the box it was anchored in, pushing its top and the drag handle off-screen while covering the backdrop. `max-height` now tracks `--sheet-vh`, published by `_syncViewport()`, and the nested vault file list uses the same variable instead of a flat `50vh`.
- **Group Avatars Now Match Desktop on Mobile** — Desktop renders a member-avatar grid when a group has no uploaded image; mobile still drew a single initial letter in **five** places. The implementation moved to `shared/ui/group-avatar.js` (the desktop-only copy is deleted and the desktop script tag repointed) and gained a `setResolver()` hook so a platform can enrich members without the shared module knowing about the app's store — which mobile needs, because a group synced from a peer can carry members as bare userId strings with the name and avatar living on the friend record. All five mobile surfaces were wired: the home chat list, the friends list, the chat header, the legacy inline header in `openChat`, and the Group Info panel. A `.has-group-avatar` class clears the containers' accent fill, which would otherwise show through the grid as a coloured disc.
- **Desktop Calls Had No No-Answer Timeout** — `startCall` never gave up, so an unanswered call left the caller on a dead call screen indefinitely. It now uses the same 1m30 window as the ringtone, which is also what makes the call log's `no-answer` outcome reachable.
- **Ringtone Kept Ringing After the Callee Answered** — Caught before shipping by testing the transitions rather than just the happy path. On desktop the ring decision cannot key off `isIncoming` alone, because that flag is `false` for both "outgoing call" and "accepted an incoming call"; the ring now defaults to the incoming case and the outgoing sites pass `true` explicitly, so the callee's phone goes silent the moment they pick up.

### Technical

- **Call Log Is a Message Type, Not a Side Channel** — Both platforms render it by branching on the presence of a `call` object, exactly as they already branch on `poll`, and skip the empty `msg-text` wrapper so the bubble holds only the card. Adding another "thing that happened in the chat" should follow the same shape: a `render*` function returning HTML, injected next to the existing ones, plus a row class for sizing.
- **Two-Peer WebRTC Test Harness** — There is no way to test calling on one renderer, so the verification runs two Electron renderers each loading the mobile UI, with a fake Capacitor `OrbitP2P` plugin relaying real packets between them over IPC and Chromium's synthetic camera and microphone. The app's real packet path and a real `RTCPeerConnection` both run, so a passing test means the feature genuinely works. Two facts made it possible: `Orbit.P2P.addListener()` returns `null` without a plugin (so the app never registers its listener), and on mobile the native plugin uses **the peer's user id as the connectionId**, so `Orbit.P2P.send(peerUserId, packet)` is how you reach a peer.
- **Memory Measured, Not Estimated** — `webContents.getProcessMemoryInfo()` returned null in this environment; `app.getAppMetrics()` reports per-process working sets including `peakWorkingSetSize`, which is what the vault numbers above come from. Running the same probe with the work disabled gives a baseline, and the difference is what the feature actually costs.
- **Cache-Busting** — Every file touched by this release carries a fresh `?v=` stamp in `mobile/src/index.html`, including the new `shared/ui/group-avatar.js` and `js/components/call-manager.js` includes.
- **Test Suites** — Unit assertions remain **267/267** across four suites; the desktop Playwright E2E suite remains **34/34** (run sharded). The release also verified: mobile voice and video calls end to end, decline and busy handling, the call log across all eight outcome variants on both platforms, and a full encrypted vault round trip.
- **Version:** Bumped to v0.5.3-beta across all three `package.json` files; `version.js` and the Android bundle regenerated.

## v0.5.2-beta

> **Note:** Security and platform release — cross-platform E2EE is now unified, QR pairing reaches v2, the app tells you when a new version exists, and a batch of crash and robustness fixes land. The largest release since v0.5.0.

### Features

- **Cross-Platform E2EE Unified** — Encrypted DMs now work in both directions between desktop and Android. Desktop adopts mobile's scheme: SPKI key encoding, HKDF-SHA256 derivation (16-byte zero salt, `orbit-e2ee-v1` info), and the two-field envelope `{v:2, ciphertext, nonce}`. Negotiation needs no handshake — the peer's advertised key format *is* the capability signal (SPKI → v2 path, legacy raw hex → SHA-256 + packed envelope), so mixed networks degrade per-peer and old builds keep working. Existing desktop keypairs migrate in place with the private key preserved, and the zero salt is retained so mobile message history stays decryptable. Retires the long-standing "E2EE key derivation incompatible" limitation.
- **QR Pairing v2** — New `shared/network/qr-pairing.js` module with a `{v:2, id, n, t, ips[], port, pk, pkf}` payload that carries a **multi-IP array** (a QR is generated locally, so it can't rely on the UDP source-address trick discovery uses) plus the peer's public key for TOFU pinning. The QR is treated as untrusted input: payload size, id charset, IPv4 range (RFC1918 + link-local only — otherwise it is a LAN SSRF primitive), port range and key format are all validated, and self-connect is rejected. v1 codes still parse; v3+ reports "needs a newer version". Every failure branch now surfaces a toast instead of failing silently.
- **QR Scanning on Both Platforms** — Desktop gains an image scanner (`qr-scanner.js`): paste with Ctrl+V, drag-drop, or a file picker, since a desktop has no camera. Mobile's camera scanner is wired to the new payload and Android now enumerates its own LAN addresses (`getLocalIpsForPairing()`) so mobile QRs carry real addresses. Also fixed a bug where mobile's own QR encoded a **bare user id** instead of the JSON payload — mobile→mobile scanning could never work, and the failure was swallowed by an empty `catch`.
- **In-App Update Notifications** — Orbit now tells you when a newer version exists. New `shared/network/update-check.js` lists GitHub Releases and picks the newest by semver (GitHub's `/releases/latest` endpoint excludes prereleases, and the entire `v0.5.x` line is one, so it cannot be used). Highlights come from the release body, falling back to the `CHANGELOG.md` section at that tag — which is what actually works, since the CI release body contains only download/install boilerplate. Desktop shows a heads-up card and a What's New dialog with a one-click download of the correct installer for your platform; Android shows the same dialog with the APK. Throttled to once per 6 hours, with "skip this version" and an opt-out setting in Settings → About.
- **Tabbed Add-a-Friend Modal (Desktop)** — The Add a Friend dialog now switches between entering an IP address and pairing by QR code, with the image scanner mounted inline in the QR tab (paste, drag-drop, or choose an image).

### Security

- **Silent E2EE Downgrade Eliminated (4 sites)** — An audit found four places where a missing peer key or a failed encryption could quietly send a message as **plaintext** while the UI still showed E2EE as on — and, worst of the set, one mobile path where the message was added to the local list *before* encryption resolved, so a failed encryption left the user looking at a message that was never sent. Desktop now blocks the send and names the peer in a notification (with `_sending` reset first, or the composer would lock forever). Mobile 1:1 has no plaintext path left: both a missing key and a failed encryption stop with a toast, and large-file sends moved inside the success path so a blocked message cannot half-send attachments. Mobile groups skip keyless members instead of downgrading to plaintext for them, and report who was skipped once in-flight encryptions settle. The dead `e2eeEncryptMessage()` — a plaintext-fallback implementation of this exact bug, with zero callers — was deleted.
- **QR Key Pinning Works Across Platforms** — `localKeyFormat()` now reports `spki` on desktop as well as Android, so a key carried in a QR code is usable by either platform. Previously the payload tagged the format and `isUsableKey()` gated storage, which meant a cross-platform QR paired and connected but silently skipped key pinning.
- **`shared/crypto/e2ee-desktop.js` Latent Bug Fixed** — `decrypt(ciphertext, nonce, publicKeyPem)` forwarded `nonce` into preload's public-key slot, so every decryption would have used the nonce as a key. Fixed in place. The file is still not loaded by either `index.html` (desktop does E2EE through `orbitAPI` directly), and still should not be wired up until the remaining key-format work lands.
- **SECURITY.md** — Corrected the support address (it was missing its TLD, so reports bounced) and replaced the stale v0.3.x version table with a rolling latest/previous policy, plus a request for version, platform and reproduction steps.

### Bug Fixes

- **`shared/` Was Never Packaged Into Desktop Builds (Critical)** — electron-builder's app directory is `desktop/`, and `files: "**/*"` cannot reach outside it, so every `../../shared/*` reference resolved to a non-existent path in shipped installers. `audio-player.js`, `video-player.js` and `image-cropper.js` had been 404-ing in **every release**, and the main process could not have required the shared crypto spec. Fixed with `extraResources`, which resolves correctly for both the renderer and the main process.
- **Local Vault OOM Crash on Android (Critical)** — The export assembled the entire blob store in memory with roughly four copies live at peak (blobs → base64 → JSON string → Capacitor bridge serialisation). The blob store is unbounded and `maxFileSize` defaults to 500 MB, and there was no size guard anywhere. On Android that lands in the WebView heap and an OOM is **not catchable** — it kills the renderer, which is the reported "app shuts down". Auto-backup made it worse by firing on app-background, exactly when Android is most likely to reclaim the process. Now a 32 MB export budget stops base64 encoding once exceeded (the cursor still drains so the transaction closes), the vault file records `attachmentsExcluded` and the reason so a restore can explain the gap, the toast says so plainly, and auto-backup attaches a real `.catch()` instead of a useless synchronous try/catch around an async call.
- **Mobile Bottom Sheets Opened Behind the Soft Keyboard** — `.bottom-sheet-overlay` is `position: fixed; top: 0; bottom: 0`, which resolves against the **layout** viewport — and Android does not shrink that when the keyboard opens, it just overlays it. Any bottom-anchored sheet therefore slid up behind the keyboard and was invisible. This broke every sheet-opening command on device (`/help`, the `/poll` builder, folder rename), while working fine in a desktop browser where no soft keyboard exists. Sheets now size to `visualViewport.height` and dismiss the keyboard on open, and a resize listener re-syncs while a sheet containing its own input is open.
- **Chat Header Went Stale on Presence and Profile-Frame Updates** — The header only re-rendered for a fixed set of state keys, and `friends` was not among them — but peer presence *and* a peer's profile frame both arrive as a friends-only change. Status dots and frames stayed frozen until something unrelated forced a render. Fixed with a header-only repaint, since a full re-render ends by force-scrolling the message feed to the bottom and would yank the reader to the end of the chat on every presence blip.
- **Chat Header Was Missing Its Profile Frame** — The DM chat header was the one avatar surface in the app not applying the frame overlay, so frames showed everywhere except the place you look most.
- **Group Avatar Rendered the Literal Word "undefined"** — `var` hoisting in the group header meant `groupInitial` was read before assignment. The four places that rendered group avatars had drifted into four different behaviours (one showed a single initial, one showed offset overlapping circles, one ignored `avatarDataUrl` entirely, one printed "undefined"), and are now a single shared implementation (`group-avatar.js`) used by all of them, with a member-avatar grid replacing the initial-letter fallback.
- **Image Cropper Exported a Different Zoom Than It Previewed** — The preview sized the image with `Math.min(scaleX, scaleY)` (contain) while the export composed it with `Math.max` (cover), so a non-square photo in a square crop exported roughly a third more zoomed than what the user had lined up. Both paths now use `Math.min` — WYSIWYG.
- **Group Image Upload Added to the Create-Group Modal** — The modal had no way to set a group image. Now an image URL field with an upload button (square crop via the image cropper) and a live preview, carried through a tab switch and into the created group.
- **Desktop Reported the Wrong App Version** — `preload.js` read `process.env.npm_package_version`, which is only set when Electron is launched through an npm script; in a packaged build it fell back to a hardcoded `0.1.2-beta`. Settings → About had been showing that string, and an update check built on it would have reported "update available" forever. Now read from `app.getVersion()` in the main process.
- **GitHub Was Unreachable From the Renderer** — `index.html` pins a Content-Security-Policy whose `connect-src` omits `api.github.com`, so any renderer-side fetch failed with "Failed to fetch". The update check performs its request in the main process rather than widening the CSP.
- **`ipcMain` Handlers Only Honoured Their First `returnValue`** — Setting `event.returnValue` up front as a default and again on success leaves the renderer with the default, which made `open-external` report failure for valid URLs while no error was logged. Now assigned exactly once, at the end of the handler.
- **Dead Code Removed** — 877 lines across 8 files (`fix-*.js`, `fix-guards.js`, `trace.js`, `debug.js`, and two `.bak`s) that were never loaded by `index.html`. Verified unreferenced before deletion.

### Technical

- **Desktop E2EE Extracted** — New `desktop/e2ee.js` (`createE2EE(store)`) holds the implementation that used to live inside `main.js`, so it can be unit-tested without booting Electron. `main.js` now requires it and delegates the four IPC handlers. The interop tests exercise this real module rather than a copy, because a mirrored test passes happily while the shipped code drifts.
- **Keypair Migration** — Legacy raw-point keypairs are converted to SPKI hex in place, preserving the private key; migrated keys still talk to mobile. A new `e2ee-decrypt-v2` IPC and `e2eeDecryptV2` preload bridge handle the two-field envelope, and `chat-panel.js` clears `payload.text` on the v2 path so plaintext never rides along beside the ciphertext.
- **Three Bugs Caught by the New Interop Tests Before Shipping** — (1) `detectFormat` did not recognise SPKI *hex*, only base64/PEM, so desktop↔desktop would have failed outright with "unrecognised key format"; (2) desktop's peer-key parser accepted SPKI hex but not PEM, and mobile advertises a PEM, so **every mobile key would have been rejected**; (3) `e2ee-mobile.js` omitted `hash` from its HKDF `deriveKey`, which Chrome and the Android WebView default to SHA-256 but Node throws on.
- **Two-Store Settings Trap Documented** — Desktop settings live in **two** stores: boot reads SQLite (`database.getAllStartupData()`), while most of the Settings UI persists through `window.Storage` → electron-store, and they are not bridged. It works only because `database.js`'s constructor calls `migrateFromElectronStore(true)` on every launch, and `forceAvatarsOnly` bypasses that function's own "already migrated" guard — so the whole migration re-runs each boot and copies electron-store's settings over SQLite. A settings write to SQLite *alone* is therefore silently reverted on the next launch whenever electron-store holds an older snapshot. The new update-check toggle writes both stores, with a relaunch test guarding it.
- **Test Suite Growth** — Unit tests went from 158 to **267 assertions** across four suites (`qr-pairing`, `e2ee-key`, `e2ee-interop`, `update-check`), the last three new. The desktop Playwright E2E suite grew from 9 to **34 specs**, adding the QR/add-friend flow and the update notice. `e2ee-interop.test.js` proves desktop↔mobile encryption in both directions, unicode round-trips, legacy-peer compatibility, and that migrated keypairs still interoperate.
- **E2E Reliability** — `.gitignore` contained a bare `tests/` which matched at any depth and hid the entire E2E suite from git, so new specs were invisible; anchored to `/tests/`. The desktop suite now launches Electron with GPU and sandbox disabled, without which the renderer crashed on boot on some machines and 14 of 22 specs failed. `npm run test:sharded` runs the suite in two halves, because a single run now launches ~31 Electron apps and stalls around the thirtieth.
- **Mobile Cache-Busting Completed** — All previously unstamped local includes now carry `?v=` stamps, including the eight `shared/*` scripts that change most often.
- **README Corrections** — The storage row claimed mobile used `@capacitor-community/sqlite`; the package is not installed and `shared/database/sqlite-mobile.js` is a stub, so mobile actually uses IndexedDB (`OrbitBlobStore`) plus localStorage. A **Third-party data egress** row now discloses that message translation sends message text to MyMemory and GIF search queries Giphy — both user-initiated and optional, and neither covered by E2EE.
- **Version:** Bumped to v0.5.2-beta across all three `package.json` files; `version.js` and the Android bundle regenerated.

## v0.5.1-beta

> **Note:** Bug-fix release — /help on mobile with soft keyboards, /h shortcut, slash autocomplete hardening.

### Bug Fixes

- **Stalled Mobile Transfers No Longer Lose Their Progress** — The 120s reaper deleted the persisted partial of an interrupted receive, leaving the sender streaming into a void (and a restarted sender unrecoverable). The checkpoint now survives reaps: late chunks/END lazily restore it and the transfer continues; restored partials also get a fresh grace window after app start.
- **Desktop Receive Robustness (Transfers)** — Receive-side write streams handle disk errors gracefully instead of risking the main process, and reconnect-resume verifies/truncates crash-lagged partials correctly so valid progress resumes instead of forcing a full re-send.
- **`/help` Now Works With Phone Keyboards (Mobile)** — The chat input only reacted to a physical-style Enter keydown, which many Android soft keyboards never send (they emit IME composition events with keyCode 229 or only an `insertLineBreak` input event). The handler now skips IME-composition keystrokes (`isComposing`/229), also matches `keyCode === 13`, and an insertLineBreak safety net strips the newline and sends when the keydown path was bypassed — so typing `/help` and hitting the keyboard's Enter opens the command sheet exactly like tapping the send button.

### Added

- **`/h` Shortcut** — `/h` now runs `/help` on desktop and mobile (fall-through alias; registry/help list stays clean).
- **Slash Autocomplete Confirmed for Aliases** — Typing `/h` filters the tooltip to `/help` on both platforms.

### Technical

- **Version:** Bumped to v0.5.1-beta across all three `package.json` files; Android bundle resynced.

## v0.5.0-beta — **Stable Release**

### Features

- **Resumable P2P File Transfers (Desktop)** — New `FILE_TRANSFER_RESUME` protocol (receiver → sender, with partial-file hash verification) lets an interrupted chunked transfer continue from the last contiguous 64KB chunk instead of restarting. Migration v13 persists `transfer_state` rows (partial chunk counts + 24h TTL sweep); partial transfers auto-resume when the peer reconnects, and mid-stream resume rewinds the sender's chunk generator in place.
- **Voice-Note Type Stamps** — Senders now stamp `type`/`mimeType` in `FILE_TRANSFER_START`; receivers honor explicit image/video/audio stamps over extension inference, so voice clips (named `*.webm`) stay classified as audio end-to-end.
- **Voice Recorder Level Meter (Desktop)** — Recording now shows a live 32-bar level meter (AnalyserNode, 0–6kHz voice range) in a floating bar above the chat input, with timer, cancel, and stop-and-send controls.
- **Android Mic Permissions** — `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` added to the manifest so WebView `getUserMedia` works for voice memos and the QR camera.
- **Playwright E2E Suite + CI** — New `desktop/tests/e2e/` suite (echo chat, folders, theme, settings, persistence, navigation) with `playwright.config.js`, wired into the `tests.yml` GitHub Actions workflow on pull requests.
- **Network Topology Visualizer (Desktop)** — Live canvas map in Settings → Network: your node sits at center with peers orbiting by hash angle, RTT color-coded edges (green <150ms / yellow / red via new `_rtts` PING/PONG tracking), transfer pulse badges, and activity flashes. Redraws every 250ms, DPR-scaled; also fixed the dead `_p2pSentCount` counter feeding the stats.
- **Network Topology Visualizer (Mobile)** — Same canvas map in the Settings → Network section, redrawn on a 1s interval gated to overlay visibility, distinguishing connected vs known peers, with transfer pulses driven by `activeTransfers`/`activeSends`.
- **Message Threading (Desktop)** — Migration v14 adds a `messages.replyTo` column so replies persist across restart. Thread chains render indented with a connector line (`.msg-threaded`), parents show an "N replies" chip, and right-click → View thread opens a panel with the root message plus the full chain and click-to-jump navigation.
- **Message Threading (Mobile)** — Same thread UI adapted for touch: `.msg-threaded` indent + connector, reply chips on parents, and a View thread slide-in overlay (`panel-thread-overlay`) with tap-to-jump.
- **Local Vault (Mobile)** — New Settings → Connection → Local Vault exports ALL `orbit_*` localStorage keys plus IndexedDB `OrbitBlobStore` blobs/partials to `vault/OrbitVault-*.json` in `Directory.Data`. Optional PBKDF2 (100k iterations) + AES-GCM encryption, restore picker with decrypt prompt, and auto-backup hooked to app-background events.
- **Group Slash Commands (Both Platforms, Group-Only)** — 19 commands: `/help`, `/poll` (`/pool` alias), `/me`, `/shrug`, `/tableflip`, `/unflip`, `/lenny`, `/roll`, `/flip`, `/spoiler`, `/clear`, `/invite`, `/members` (`/list`), `/topic`, `/leave`, `/shout`, `/countdown`, `/nick`, `/kick` (`/remove`). All gated to group chats only ("Slash commands only work in group chats" toast in DMs). `/poll` opens a UX-friendly poll builder modal/sheet (question + 2–6 options, add/remove rows) or accepts instant quoted syntax `/poll "Q?" "O1" "O2"`. `/invite` shows a code sheet with Copy + Share buttons. `/members` renders a roster with roles and online dots. `/topic` updates the group description (owner/admin only). `/leave` confirms, then broadcasts GROUP_LEAVE. `/nick` sets a per-group nickname. `/kick` removes a member (owner/admin only).

### Bug Fixes

- **/help Not Working in Mobile Groups Fixed** — Bare `OrbitSheet` reference hardened to `window.OrbitSheet` with a fallback, HTML output escaped, and the stale WebView cache busted.
- **Desktop Slash Commands Missing Entirely** — Full parity implementation added, matching the mobile command set.
- **Poll Builder Not Centered in Mobile Bottom Sheet** — `margin: 0 auto` fix, also applied to the invite and members sheets.
- **Duplicate Cancel Button in Poll Sheet Removed** — The bottom sheet already provides a cancel pill.
- **Invite Share Button Misbehaving (Mobile Slash Commands + Group Info, Both Platforms)** — The Share button sent the invite as a chat message into whatever chat was open, or refused when viewing the group itself. It now opens the system share sheet (`navigator.share`) with a clipboard fallback ("Invite text copied — share it anywhere").
- **Music Visualizer Duration Line Mismatched Video Player (Desktop)** — Harmonized audio-player seek bar with the video player: `.oap-seek` padding 14→12px, flat track groove `rgba(128,128,128,0.35)` without ring, simplified fill, `bg-surface` thumb tip, and ctrl padding `2px 12px 6px`.
- **Vault Relocated in Mobile Settings** — Moved next to Network in the Connection category (was under System).

### Technical

- **Version:** Bumped to v0.5.0-beta across all three `package.json` files.
- **Mobile Sync:** `npm run mobile:sync` regenerated `version.js` and the Android web-asset bundle.

## v0.4.2-beta

> **Note:** Feature release — experimental Chat Folders on desktop, folder tab polish on mobile.

### Features

- **Chat Folders (Desktop, Experimental)** — New Folders rail in the sidebar, gated behind Settings → Advanced → Enable Experimental plus the new "Chat Folders" toggle. Create/rename/delete folders, add/remove friends and groups via the chat context menu, browse a folder's chats in a dedicated view, and bulk-assign chats with the "Add Chats" picker. Folders persist per-device (local only; no sync yet).
- **Folder Tabs Polish (Mobile)** — Home-screen folder tabs redesigned: uniform tab width, centered Friends/Groups/folder trio when you have a single folder, and a dedicated scrollable sub-rail when you have several. Folders no longer draw opaque backgrounds over the panel; the active-tab underline is centered and new folders auto-scroll into view.

### Bug Fixes

- **Deleting a Folder No Longer Crashes the App (Desktop)** — Settings notifications are now isolated per listener, the confirm dialog always closes (try/finally), and reply-quote sender names resolve safely in group chats — the three stacked failure points behind the crash.
- **Sidebar Rail Buttons Work Again After a Settings Change (Desktop)** — The Folders, DMs, Settings, and Profile buttons were losing their listeners when the sidebar re-rendered after a settings change; they are now re-attached.
- **Folder Picker Fixed (Desktop)** — Clicking outside now dismisses it, and clicking inside the picker no longer navigates into the folder.

### Technical

- **Version:** Bumped to v0.4.2-beta across all three `package.json` files; `version.js` and the Android bundle regenerated.

## v0.4.1-beta

> **Note:** Bug-fix release for Android mobile.

### Bug Fixes

- **Friend / Peer Avatars Not Loading on Mobile Fixed** — Discovered avatars could fail to display on Android because the UDP discovery beacon carried a full PNG data-URI (100-300KB) that overflowed the fixed 4096-byte Android receive buffer, truncating the JSON so the avatar was never stored. The Android UDP receive buffer is now 65536 bytes with an oversized-send guard, and the beacon now sends a small 128x128 JPEG thumbnail instead (refreshed only when the avatar changes, with a re-push so the native 10s re-broadcast actually carries it).
- **Other-User Avatar in DM Tab Fixed** — DM chat records created from beacons had no `avatar`, so the DMs tab rendered a single-letter initial even when the other user's avatar was known. DM chats now seed `avatar` on creation, a new `syncFriendAvatar()` helper mirrors the friend's avatar onto the chat record when beacons arrive, and `renderChatList` falls back to the friend record.
- **Orbit Echo Bot Avatar Restored** — The Echo bot's relative asset avatar (`icons/app/orbit_1024.png`) was stripped by the avatar-src sanitizer (which only allowed `data:`/`http(s):`). The sanitizer now also allows relative app-asset paths while still blocking scheme-based vectors (`javascript:` and similar).
- **Image Compression Transparency + Hang Fixed** — `compressImage` now fills a white background before rendering to JPEG so transparent PNG avatars no longer turn black, and wraps canvas work in a try/catch so any encode/decode failure falls back to the original image instead of hanging the caller indefinitely.
- **Beacon Thumbnail Oversize Safety** — If a thumbnail is still too large for a UDP datagram, it is retried at a smaller size; if still too large, the avatar is omitted from the beacon rather than breaking discovery (the full-res avatar flows over the TCP handshake).
- **Profile Save Broadcasts to Connected Peers** — Saving the profile via the header button (and when the avatar thumbnail finishes) now sends an updated BEACON to already-connected peers in real time, so peers you are already chatting with see name/avatar changes immediately.
- **Chat Cleanup No Longer Matches by Name** — Stale peer chat cleanup matched display name, which could delete the wrong peer's chat and message history when two peers shared a name. It now matches by connection id / peer endpoint.
- **Stored XSS Paths Escaped** — Peer-controlled values flowing into rendered HTML (attributes, avatars, message previews, members, mentions, toasts) now pass through attribute/JS/avatar-safe escaping so names and values cannot inject markup.

### Technical

- **Version:** Bumped to v0.4.1-beta (`package.json`, `src/js/version.js`).

## v0.4.0-beta — **Stable Release**

### Bug Fixes

- **Message Long-Press Menu Fixed** — Press-and-hold on a message bubble no longer opens nothing: the reactions + actions sheet (Copy/Reply/Translate/Forward/Delete) now initializes correctly on the live chat path. Previously the wiring only ran through a secondary code path that the app no longer uses.
- **Profile Frame Leak Fixed (4 renderers)** — Avatar frames were still rendering even when the Profile Frames setting was off. Gated `_addAvatarFrames`, `renderProfilePill`, and both chat-header renderers (app.js + chat-screen.js).
- **Experimental Toggle Off-State Bugs Fixed** — Avatars / Profile Frames / Perf Mode toggles used empty-string attribute selectors that failed when the setting was off. Switched to value-based `[data-*="true"]` selectors so toggling off actually applies.
- **Compact Spacing Toggle Fixed** — The setting wrote a class the CSS no longer matched; now uses a `[data-compact-spacing]` attribute selector.
- **FPS Monitor & Dev Overlay Resume on Reload** — These debug toggles no longer stay off after an app reload when enabled.

### UI Polish

- **Folder Tab Icons Removed** — Folder tabs in the home screen now show clean text labels only (matching Friends/Groups); icons removed.
- **Folders Gated Behind Experimental** — Folder tabs and the Folders settings entry are now hidden behind a new Experimental toggle (`experimentalFolders`, off by default). Enabling it in Settings → Experimental → Advanced restores folder tabs and the Organization settings category.
- **Profile Frame Icon Removed (Desktop)** — The Account settings "Profile Frame" collapsible header now shows the title only (icon removed).

### Features

- **Message Effects Graduated** — Message Effects (particle confetti on sent messages) moved from Experimental to Chat settings on both platforms, with a one-time automatic migration of the old experimental flag.
- **Profile Frames Graduated** — Profile Frames moved from Experimental to stable settings on both platforms (Appearance on mobile, Account on desktop), on by default, with one-time automatic migration. The desktop Account picker no longer requires Developer Mode.

### Technical

- **Version:** Bumped to v0.4.0-beta across all manifests.

### Commits in this release

> Span: v0.2.7-beta (previous stable) → v0.3.2-beta (last dev release) → v0.4.0-beta

- **v0.2.7 hotfixes** — `116bd68`, `08da621`, `2c1dfcd` (post-tag hotfixes, already listed under v0.2.7)
- **Docs** — `7f11f52`, `1f556de`, `d92b948`, `6f53ee8`, `cd6ece7`, `0df2d76` (README updates)
- **v0.2.8** — `5013176`, `723c690`, `d4d1748` (merge), `58f7bdf`, `0c22c9c`
- **v0.2.9** — `36f299a`
- **v0.3.0** — `58387f7`, `e2c185c`, `3717fdf`, `6a623ed`, `63676a0`, `a602550`, `dd7317a`, `c291268`
- **v0.3.1** — `983c814`, `7601509`, `c5bc432`, `8c8327a`, `3baa3da`
- **v0.3.2** — `5fd8e02`, `30f7dd0`, `12b9c6d`, `fa030b3`, `06f0bb6`, `d9c059f`, `3393e80`, `cfbfccd`, `b5ac248`, `f3590a2`
- **v0.4.0** — `5f14127`, `70f3cab`

## v0.3.2-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Bug Fixes

- **Android Crash-on-Launch Fixed (3 bugs)** — `styles.xml` was missing mandatory SplashScreen attributes (crash on cold start). `registerPlugin(OrbitP2PPlugin.class)` was called after `super.onCreate()` — moved before it. `colors.xml` was entirely missing — created it.
- **Profile Card Real-Time Update Fixes (4 bugs)** — Duplicate DOM IDs in profile sheet vs panel renamed to avoid collisions. Cropped image hero preview not updating after save — added inline DOM update. Avatar mistakenly used for banner background (var banner referencing avatar URL) — fixed. Profile pill never updated on save — wired up the update.
- **Status Text Color Fix (Profile Pill)** — Status text appeared gray on startup because `getStatusColor()` from app.js wasn't loaded yet. Fixed by adding a local `statusColors` map in `home-screen.js`'s `renderProfilePill()`. Status change handler now also sets pill text color.
- **Mobile Gallery Bug Fixes (7 bugs)** — Null guards on gallery button bindings (crashed if elements missing); null checks in showGallery/hideGallery; Blob URL memory leak in lightbox (video/audio blob URLs now revoked on navigation and close); filter index mismatch (clicking an image in "Images" filter opened wrong item from full list); date-group visual order mismatch (items grouped by date/section were stored in message order — visual indices and data indices diverged causing wrong media to open); missing @keyframes scaleIn animation; lightbox close button now respects safe-area-top for notched devices.

### UI Polish

- **Message Effects Graduated** — Message Effects moved from Experimental to Chat settings.
- **Profile Frames Graduated** — Profile Frames moved from Experimental to Appearance settings.
- **Frame Picker Redesigned (Mobile)** — Changed from full-screen flex backdrop to a compact fixed-position bottom sheet (`position:fixed;bottom:0;left:0;width:100%;max-height:75vh`) appended to backdrop with `slideUp` CSS animation, guarded by `_framePickerOpen` flag to prevent double-opens.
- **Frame Preview in Button Fixed** — Removed `position:absolute;top:-16%;left:-16%` from frame image and `overflow:hidden` from container. Frame now flexbox-centered without being clipped by the circular avatar edge.
- **Status Selection (Mobile)** — Added `<select>` dropdown with 4 statuses (Online, Away, Do Not Disturb, Offline). Saves to store and broadcasts BEACON immediately.
- **"Busy" Status Removed** — Removed from both mobile status selector and desktop profile-card.js.
- **Desktop Status Icons Updated** — Changed to filled colored circles instead of text indicators.

### Search Enhancement

- **Mobile Search Categorized Results** — Search results now organized into Chats (ongoing conversations), Friends (friends list), and Messages (message content matches) sections with count headers.
- **Text Highlighting** — Matched search terms highlighted with accent color via `_highlightText()` helper.
- **Recent Searches** — Last 5 searches stored in `MStore.settings.recentSearches`, shown on input focus. Empty state prompt when no searches exist.
- **Focus Handler** — Input focus now shows recent searches or a prompt to type, replacing the previous always-active results view.
- **CSS Added** — New styles in `mobile.css` for `.search-results-*` and `.recent-search-*` classes.

### Technical

- **Version:** Bumped to v0.3.2-beta across all manifests.

## v0.3.1-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Bug Fixes

- **Android Immersive Mode Fixed** — Taskbar now correctly hides on all Android versions. Root cause: Capacitor's SystemBars plugin was calling `show()` after immersive mode. Fixed by adding `SystemBars.hidden: true` to Capacitor config, installing SplashScreen API, adding `onResume()`/`onWindowFocusChanged()` lifecycle handlers, null-safe `getInsetsController()`, and proper `FLAG_FULLSCREEN` for legacy API levels.
- **Real-Time Profile Card Updates Fixed** — Profile cards now properly update when a friend changes their avatar, banner, bio, or profile frame. Fixed 4 bugs: desktop never broadcast a BEACON after profile changes (added `broadcastBeacon` IPC bridge), mobile `saveProfileChanges()` never sent a BEACON to peers (now sends `Orbit.P2P.send()`), both platforms used truthy checks (`if (bp.avatar)`) that blocked null propagation for removed avatars/banners.
- **Mobile Startup Performance Improved** — No longer loads all chat messages into memory at startup (only loads last active chat). Blob restoration exits early when no `_blobKey` entries exist. Image cropper lazy-loaded instead of blocking parser.
- **DM Avatar Rendering on Quick Switch Fixed** — `closeChat()` timeout no longer strips `open`/`active` classes after `openChat()` sets them. Friend lookup now strips `dm_` prefix from chatId.

### UI Polish

- **Image Cropper Redesigned** — Modern premium look with Lucide icons, checkerboard preview background, rule-of-thirds grid, corner handles, gradient Apply button, smooth entrance animations.
- **Removed Decorative Rings from Avatar Crop** — Clean minimal look: just a sharp white circle border, no spinning/dashing/glowing rings.
- **Smooth Zoom for Cropper** — Finer zoom steps (slider 0.01, buttons 5%, scroll 2%), GPU-accelerated sub-pixel image positioning.
- **Bottom Sheet Safe Area Cleaned** — Removed `var(--safe-area-bottom)` padding from all bottom sheets (no longer needed with working immersive mode).

### Technical

- **Version:** Bumped to v0.3.1-beta across all manifests.
- **Android Sync:** `npx cap sync android` completed — web assets synced to Capacitor Android project.

## v0.3.0-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Image Cropper (Desktop + Mobile)

- **Shared Image Cropper** — New `shared/ui/image-cropper.js` module with drag, zoom (slider + pinch + wheel), rotate 90° CW/CCW, mirror, and reset. Integrated into desktop avatar/banner inputs and mobile profile sheet.
- **Avatar Circular Crop Guide** — Three-level SVG mask (dimmed corners, transparent circle) with dashed circle border for precise avatar framing.
- **Zoom & Centering Fixes** — Drag proportional to zoom level; image sized-to-fit (`Math.min`); base centering offset separated from user drag offset.

### Mobile Improvements

- **Gallery A/V Playback Fixed** — `data:`→`blob:` URL conversion in `openLightbox()` enables native Android WebView playback of base64-encoded media.
- **Real-Time Profile Overlay Refresh** — Beacon handlers call `refreshProfileOverlay()` so profile cards update immediately on friend changes.
- **Immersive Mode** — `MainActivity.java` `enableImmersiveMode()` hides system bars on full-screen content (Android 7+).
- **Input Box Draft Saving** — Chat draft auto-saved to `localStorage` (debounced 300ms), restored on chat switch, cleared on send.

### Desktop Improvements

- **Real-Time Profile Card Updates** — `profile-card.js` watches `friends` array — open cards re-render when friend avatar/name/bio updates via beacon.
- **Receiving Audio/Video Progress** — File transfers show `"Receiving Audio..."` or `"Receiving Video..."` with appropriate Lucide icons based on extension detection.
- **Input Box Draft Saving** — Same `localStorage` draft save/restore/clear pattern, cross-session.

### Release Signing & Security

- **GitHub Actions Release Workflow** — 5 parallel build jobs (Linux, Windows, macOS, Android) + sign step that generates `SHA256SUMS.txt`, GPG-signs it, and uploads everything to a GitHub Release on tag push.
- **GPG Signing** — Release artifacts verified with Orbit Release Key. Key setup docs in `security/README.md`.
- **Security Policy** — `SECURITY.md` with supported versions and vulnerability reporting.
- **Verification Docs** — README.md "Release Verification" section with copy-paste commands.

## v0.2.9-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Mobile Settings Additions

- **App Zoom Slider** — New zoom slider (50–200%, default 100%) in Appearance → Text & Layout, matching desktop functionality. Stored as `appZoom` in settings.
- **Disable Light Mode Flashbang Toggle** — New "Disable Light Mode Flashbang" toggle in Appearance. When enabled, switching to a Light theme skips the brightness warning dialog entirely. Stored as `noFlashbang` in settings.
- **Light Mode Flashbang Warning** — When the user selects a Light theme (Light, Solarized Light, etc.) while the flashbang toggle is disabled, a themed warning dialog appears explaining the sudden brightness change, with a "Don't show again" option that auto-enables the `noFlashbang` setting.
- **GitHub Links in About** — "GitHub Repository" (opens repo URL) and "Report an Issue" (opens issues page) links added to the About section with Lucide icons.

### Desktop Global Gallery Layout Fix

- **Scroll Wrapper Separation** — The global gallery now wraps each display mode (grid, compact, masonry, list) in a dedicated `overflow-y: auto` scroll container, separated from the inner layout `<div>`. This prevents layout breakage when the gallery holds more than 10–20 items. Previously the layout container and scroll wrapper were the same element, causing flex/grid layout conflicts under overflow scroll.

### Fixes

- **Experimental Card Icon Fixed** — The Experimental card in mobile settings now renders correctly. Lucide renamed `flask` to `flask-conical` in v1.17.0, and the old icon name was silently failing (rendering nothing).
- **Mobile Store Defaults** — Added `noFlashbang: false` and `appZoom: 1.0` defaults in store.js settings.
- **Flashbang Dialog Render Path** — added `data-flashbang-disable` checkbox handler, confirmed Flashbang dialog triggers only on Light theme selection (not System/Auto).

### Technical

- **Version:** Bumped to v0.2.9-beta across all manifests (workspace root, desktop, mobile).
- **Version Sync:** `mobile/package.json` set to `0.2.9-beta`, `version.js` auto-regenerated via `npm run version:sync`.

## v0.2.8-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Settings Redesign

- **Card-Based Settings Items** — All details items across 7 sections now render as `.settings-item-card` with Lucide icons, gradient 36×36 icon containers, `data-search` attribute for filtering, and consistent card layout with icon, title, description, and action area.
- **Settings Search Bar** — New `#search-settings` input filters settings cards by `data-search` attribute (case-insensitive partial match). Search is scoped to the current section. "No matching settings" empty state shown when no results.
- **Settings Search Cleanup** — Input cleared on section entry and when navigating back to overview.
- **Card Styling Polish** — Cards rendered flush against panel background (removed extraneous border/bg/border-radius).

### Message & Animation Fixes

- **Message Re-Animation on Refresh Fixed** — Removed base `.message-row` CSS animation (was causing all messages to re-animate on every re-render). Implemented `existingMsgIds` DOM snapshot before re-render and granular `data-msg-anim` attribute only on genuinely new messages.
- **Auto-Scroll Not Reaching Bottom Fixed** — Removed `scroll-behavior: smooth` from message feed (interferes with programmatic scrollTop). Added deferred re-scroll (150ms) after initial `scrollTop = scrollHeight` to catch lazy-loaded images, Lucide SVGs, and media players.
- **Desktop Message Animation Fix** — Same `existingMsgIds` + `data-msg-anim` strategy ported to desktop `chat-panel.js`. Old brute-force `animation: none` suppression removed. CSS updated to use `.message-row[data-msg-anim]` attribute selector.

### UI Polish

- **Own Message Background Consistency** — Changed own message bubble from accent blue (`var(--accent-primary)`) to theme surface color (`var(--bg-surface)`) on both platforms. Both own and other messages now share the same surface color, differentiated only by alignment (right vs left). Desktop inline style updated accordingly.
- **Message Text Color Unified** — Own messages changed from hardcoded `color: #fff` to `color: var(--text-primary)` on both platforms, matching the text color of other users' messages for visual consistency.
- **Light Mode Text Cache-Busting** — Added `?v=20260721` query parameter to all theme CSS `<link>` tags in both `mobile/src/index.html` and `desktop/src/index.html` to force fresh CSS load after light-mode text color fix.
- **App Version Auto-Detection** — Created `mobile/src/js/version.js` auto-generated from `mobile/package.json` via `npm run version:sync`. About section now reads `window.APP_VERSION || '0.2.8-beta'` — eliminating stale hardcoded versions.

### Technical

- **Version:** Bumped to v0.2.8-beta across all manifests.
- **Platforms:** Mobile (Android) + Desktop — both platforms updated with UI polish fixes.
- **Android Sync:** `npx cap sync android` run to copy web assets to Capacitor Android project.

## v0.2.7-beta — **Stable Release**

### Features

- **4-Layer Video Duration Fix** — Backward moov scan when forward scan misses moov (size=0 box); return max(mvhdDur, bestTrackDur) for fragmented MP4s; durationchange handler updates knownDuration; dur() uses max(knownDuration, video.duration) safety net.
- **Mobile A/V Persistence Fix** — All chat pre-loading before _restoreAllBlobAttachments; exponential backoff in _resUrl (5 retries 300ms→4.8s); local send path attsRef cleanup; FILE_TRANSFER_END _blobKey restored to synchronous save.
- **Mobile Status Circle Fix** — PONG handler updates friend.lastSeen+status; MESSAGE handler refreshes sender status; onPeerFound sets lastSeen + re-renders.
- **Emoji Reaction Fix** — Desktop store.js packet.to→packet.from swap for DM reaction routing; mobile reactions-row gets data-msg-id attribute.
- **Mobile Overlay Controls Fix** — touchstart handler for instant overlay; _touchTap guard prevents destructive click toggle; touch-action: manipulation CSS.
- **Code Block UI Redesign** — Styled container with header bar, language badge, Copy button; inline code accent color border.
- **Copy Code Button** — Clipboard API + "Copied!" feedback with execCommand fallback; wired on both platforms.
- **Chat List Preview Cleaned** — Markdown stripped from sidebar previews (code→"code", URLs→"link", bold/italic/hash removed, truncated at 80 chars).
- **Desktop sanitize.js Synced** — Desktop now loads updated copy with all code block improvements (was using old standalone copy).
- **Technical:** Version bumped to v0.2.7-beta across all manifests.

### Commits in this release

- `41b5773` v0.2.7
- `2c1dfcd` hotfix for v0.2.7
- `08da621` hotfix for v0.2.7
- `116bd68` hotfix for v0.2.7
- `e80fd58` hotfix for v0.2.7
- `7f11f52`, `1f556de`, `d92b948`, `6f53ee8`, `cd6ece7`, `0df2d76` — README updates (docs)

## v0.2.6-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Investigation & Verification

- **Investigation: File Persistence Root Cause** — Discovered that _restoreAllBlobAttachments only scanned MStore.messages which at startup only had echo data — P2P chats were invisible. Debugger, code-archaeologist, backend-specialist agents deployed for parallel root cause analysis.
- **Player File Identity Enforced** — shared/ui/ and mobile/src/shared/ui/ player files confirmed byte-identical.

## v0.2.5-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Features

- **Blue Fullscreen Background 4-Layer Fix** — backdrop, wrapper, videoBox, video all get var(--bg-base) with accent glow.
- **Fullscreen Uses Manual Mode** — Both platforms use _enterManualFS/_exitManualFS exclusively.
- **Activity Center UI Shift Fixed** — scrollIntoView replaced with manual scrollTop+offset calculation.
- **Light Mode Flashbang Prevention** — Warning checkbox + Appearance toggle; noFlashbang store field.
- **Theme Transitions + Easter Egg** — 600ms CSS transition on data-theme change; random theme quotes as Toast.
- **Midnight Sleep Reminder** — 3s after boot, 12AM-5AM on dark/midnight themes.
- **Full Undo/Redo System** — 100-action stack (Ctrl+Z, Ctrl+Shift+Z/Y); respects Privacy Mode.
- **Avatar Frame Per-Account Fix** — Reads from currentUser.profileFrame with settings fallback.
- **Konami Code → Developer Mode** — ↑↑↓↓←→←→BA/AB toggles devMode with Toast.
- **Bugfixes** — Activity Center shift, mobile buffer loader, image send corruption, mobile video duration mismatch, desktop→mobile video thumbnails, gallery routing, overlayIcon ReferenceError, fullscreen taskbar overlap.

## v0.2.4-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Activity Center & Transfer UX

- **Activity Center Overhaul** — Lucide icons with color badges, duration/size displays, audio player integration.
- **Activity Center UI Shift Fix** — Manual scroll calculation replaces scrollIntoView.
- **Transfer UX** — Progress display in Activity Center, file type icons, media duration/size.

## v0.2.3-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Media Player Alignment

- **Video Player Complete Overhaul** — MP4 duration parsing, multi-layered fallback, eliminated forced seeks.
- **Audio Player Match** — Consistent player architecture with video.
- **Player File Identity** — Shared player files byte-identical across platforms.

## v0.2.2-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Mobile & Player Fixes

- **Mobile Metadata Preload** — muted=true + preload=metadata forces immediate duration on mobile browsers.
- **Blob MP4 Duration Parsing** — fetch(blob:) + Uint8Array byte access for large blob URLs.
- **Video Player Blob Duration Fallback** — Fetches blob and parses MP4 header directly.
- **Mobile Changelog** — Full What's New modal on Android.

## v0.2.1-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Stability & Infrastructure

- **CRITICAL: WriteStream Race Fixed (Mobile→Desktop)** — stream.end() async; onComplete fired before flush → truncated files. Fixed with stream.on('finish') wrapping completion.
- **CRITICAL: Duplicate Messages Fixed** — _fileId markers in MESSAGE attachment; receiver merges into existing message.
- **File Transfer Stability** — Hash mismatch handling, group chat file routing, mobile type override prevention.
- **Changelog System** — Version history added to mobile About tab.

## v0.2.0-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### CRITICAL: Mobile Background Notifications & Large File Persistence

- **CRITICAL: Mobile Background Notifications Fixed:** `showIncomingNotification()` used `document.hidden` to gate native notifications — but `document.hidden` is **unreliable in Capacitor WebView** (never set to `true` when app is backgrounded). Native notifications were never created outside the app. Fixed at two layers: (1) JS side now tracks background state via Capacitor's **`App.addListener('appStateChange', ...)`** instead of `document.hidden`; (2) **Java `OrbitP2PPlugin` now creates native Android notifications directly** via `NotificationManager` when the app is in background, bypassing the JS WebView entirely (which may be paused). The plugin parses incoming MESSAGE packets, extracts sender name and text, and posts to the `orbit_messages` channel (HIGH importance). `setForeground()` plugin method bridges JS foreground state to native side. DnD, group mention, and active-chat checks still handled by JS when running.
- **CRITICAL: Large File Persistence on Mobile (IndexedDB Blob Store):** Files >10MB stored raw ArrayBuffer in IndexedDB via `_blobKey` — but `blob:` URLs created from these buffers die on app restart (blob URLs are per-session). Added `window.BlobStoreDB` — an IndexedDB-backed blob store with `put`/`get`/`delete` operations. `_restoreAllBlobAttachments()` runs on app start to reconstruct `blob:` URLs from persisted `_blobKey` data. `_resUrl()` fellback for dead `blob:` URLs in `renderMessages()` triggers async restore from IndexedDB. During restore, attachment placeholders show "Restoring..." indicator with hard-drive icon.

### Mobile base64 Streaming Optimizations

- **`orbitBase64ToArrayBuffer` Rewritten as Streaming Decoder:** Original created an intermediate `clean` string (filtering valid chars) then walked it in 4-char chunks — two passes over the data with a string allocation. New version: single streaming pass using `Int8Array(256)` lookups, inline validity counting, and a 4-element group buffer (`var b = [0,0,0,0]`). Decodes bytes on the fly as each group of 4 valid chars is filled. No intermediate string allocation, no padding manipulation. Handles trailing group correctly with zero-padding. Same optimization applied to all 7 binary decode sites including `_base64ToBytes` (mobile file receiver) and `_safeB64ToArrayBuffer` (shared audio/video players).

### Notification & Lifecycle Fixes

- **Reliable App Background Detection:** Replaced `document.hidden` with `window._appIsBackgrounded` — a boolean maintained by Capacitor's `appStateChange` listener. Falls back to `document.hidden` for non-Capacitor environments. When Capacitor state is available, skips JS-side `LocalNotifications.schedule()` (unreliable from background) and lets the native Java plugin handle notifications.
- **Native Android Notifications from Plugin:** `OrbitP2PPlugin.postMessageNotification()` parses incoming `FgEvent` JSON, extracts sender name + message text, and posts to the `orbit_messages` channel via Android `NotificationManager`. Works regardless of WebView JavaScript engine state. Uses `PendingIntent` to open `MainActivity` on tap. Handles both API 26+ (with channel) and pre-26 (legacy builder).
- **JS→Plugin Foreground Bridge:** `setForeground()` plugin method called from `appStateChange` listener keeps the native plugin informed of foreground/background transitions. Native notifications only created when `_isForeground === false`, preventing duplicates during normal in-app message handling.

### Desktop File Transfer Fixes

- **Desktop AV Type Honor Fix (desktop `file-received` handler):** Incoming file transfers with .webm, .mov, and other ambiguous extensions were being re-classified by the desktop receiver based solely on extension regex matching — overriding the sender's correct type classification (e.g., mobile sends a .webm audio-only file with `type: 'audio'`, but desktop's `isVideo` regex matched `.webm` and the handler overwrote it to `type: 'video'`). This caused audio-only files to be routed to the video player, triggering PIPELINE_ERROR_DECODE with +2s seeking retries. Fixed: the handler now checks the **sender's original type** from the pending MESSAGE attachment first — if the sender classified it as `'audio'`, `'video'`, or `'image'` (not `'file'`), the desktop receiver honors that classification and only derives the MIME from the extension. The extension-only fallback path remains when no sender type hint is available.

### Media Player Improvements

- **`muted=true` Gated to Mobile Only:** The `muted=true` preload hack (forces `loadedmetadata` on mobile browsers without user interaction) is now only applied on actual mobile devices (Android/Capacitor/iOS). Desktop players no longer start muted — audio and video play with sound immediately on desktop as expected.
- **Blob MP4 Duration Parsing:** `parseMp4Duration()` rewritten to accept a direct `ArrayBuffer` parameter (via `fetch(blob:URL)`) in addition to the base64 data URL path. Uses `Uint8Array` byte access instead of `String.fromCharCode.apply(null, largeArray)` which fails on large buffers (>130MB). Fixes duration detection for blob: URLs too large for the charCode approach.
- **Video Player Blob Duration Fallback:** When a blob: URL has no known duration and the browser reports duration < 0.5s, the video player now fetches the blob and parses the MP4 header directly to extract the duration from the `moov→mvhd`/`mdhd` atoms. Falls back to the existing `currentTime = 1e7` seek hack for non-blob URLs.

### Quality of Life

- **Desktop File Transfer Type Indicators:** Attachment classification in `file-received` handler now shows correct type badges even for sender-classified ambiguous extensions. Reducing video player misroutes reduces confusing decode errors.
- **Mobile Restore Indicators:** Messages with attachments being restored from IndexedDB show "Restoring..." placeholder with hard-drive icon — visual feedback that large files are being recovered.

### Technical

- **Version:** Bumped to v0.2.0-beta across all manifests, About tabs, changelogs, and What's New modals.
- **Architecture:** Native notification path added to `OrbitP2PPlugin.drainEvents()` — background notifications are now created directly from Java, independent of JS WebView state. Two-layer notification strategy: JS handles foreground (toast/sound) and non-Capacitor fallback; Java handles background via `NotificationManager`.
- **base64 Decoder Unified:** All 7 binary decode functions across mobile app.js, shared audio-player.js, and shared video-player.js now use the same streaming single-pass algorithm with `Int8Array(256)` lookup and 4-char group buffer — consistent performance and behavior across all decode sites.
- **File Persistence Strategy:** Files ≤10MB stored as data: URLs in localStorage (existing behavior). Files >10MB stored as raw ArrayBuffer in IndexedDB via `BlobStoreDB`. Both survive app restart via different mechanisms. Blob URL reconstruction on startup for IndexedDB-backed files via `_restoreAllBlobAttachments()`.

## v0.1.9-beta

> **Note:** This is not a stable release — latest development version with experimental features.

- **CRITICAL: Desktop→Mobile File Transfer Chunk Joining:** Desktop `btoa()`'s each 64KB binary chunk independently (each with its own base64 padding). Mobile was doing `chunks.join('')` which concatenated separately-padded base64 strings — producing invalid base64 at every chunk boundary, corrupting the entire file. Fixed: each chunk is now decoded independently via `orbitBase64ToArrayBuffer()`, ArrayBuffers concatenated, then re-encoded as a clean data URL.
- **CRITICAL: WriteStream Race Condition (Mobile→Desktop):** `stream.end()` is asynchronous — `onComplete` (which reads the temp file via `fs.readFileSync`) was firing before data was flushed to disk. This caused truncated files on mobile→desktop transfers: videos lost audio tracks and duration metadata (missing moov atom). Fixed: `stream.on('finish', ...)` now wraps hash verification and completion callback.
- **CRITICAL: P2P cleanup() Race in Android Plugin:** `OrbitP2PPlugin.cleanup()` called `stopService()`, which asynchronously unbound and stopped the Android foreground service. Then `initP2P()` immediately called `startServer()`/`startDiscovery()` — `ensureServiceRunning()` found `boundService` still non-null (async `onServiceDisconnected` hadn't fired yet) and returned early, never restarting the service. Fixed: Java `cleanup()` is now a no-op — the JS side (`p2p-mobile.js`) already clears connection state, pending messages, and native listeners via `removeAllListeners()`.

### File Transfer Fixes

- **Mobile Type Override Bug (HIGH):** `FILE_TRANSFER_END` handler was blindly overwriting the correct `video`/`audio` type from the original MESSAGE payload with a regex-based extension fallback. Fixed: only overwrites type if it's `null`, `undefined`, or explicitly `'file'`.
- **Mobile Video Compression Dropped Audio (HIGH):** `compressVideoMobile()` used `canvas.captureStream(15)` which captures only visual pixel data — audio tracks were silently dropped. Fixed: disabled `compressVideoMobile()` for videos >5MB; raw video files with full audio are now transmitted via chunked FILE_TRANSFER protocol.
- **Group Chat File Routing Fixed:** `FILE_TRANSFER_START` and `FILE_TRANSFER_END` packets lacked `chatId`, causing the CRIT-4 merge to search the wrong chat. Fixed: added `chatId: activeChatId` to both packet types on desktop and mobile senders.
- **Hash Mismatch Silenced:** Platform hash differences between WebKit `crypto.subtle.digest()` and Node `crypto.createHash()` are harmless — audio plays correctly despite mismatch. Changed from `console.error` + error toast to `console.warn` only. File is always saved.

### Media & UI Fixes

- **Mobile Metadata Preload:** Added `muted = true` + `preload = 'metadata'` to both video and audio players. Mobile browsers (Safari iOS, Chrome Android) aggressively defer `loadedmetadata` for unmuted media — `muted = true` forces them to fetch headers immediately. Audio is restored on user play via unmute hook in `doPlay()`.
- **Video Player preload Optimized:** Changed from `'auto'` (download entire file) to `'metadata'` (download only headers) — saves bandwidth while still providing immediate duration display.
- **Transfer Error X Button Fixed:** Inline error dismiss button was not working — click events were swallowed by parent handlers. Fixed: added `e.preventDefault()` + `e.stopPropagation()` to the dismiss handler.
- **Peer Status Dot After Auto-Connect:** Immediate IPC `peer-found` with `status:'online'` sent after auto-connect success, so the sidebar updates without waiting for the remote beacon response.

### Quality of Life

- **Unstable AV Transfer Warning Modal:** When sending audio or video files, both desktop and mobile show a warning modal before sending. Features an alert-triangle icon, "Don't show this warning again" checkbox (persists to `localStorage`), click-outside-to-dismiss, and Cancel/Send Anyway buttons.
- **Auto-Discovery Diagnostic Logging:** `_tryAutoConnect` now emits `[AutoConnect] SKIP:` / `[AutoConnect] THROTTLED:` / `[AutoConnect] Retry TCP to:` messages in DevTools — helps users diagnose firewall/network issues preventing peer discovery.
- **Audio/Video Warning Icon Updated:** Replaced thin circle-with-exclamation with cleaner alert-triangle icon (standard Lucide/Feather style).

### Technical

- **Version:** Bumped to v0.1.9-beta across all manifests, changelogs, and About tabs.

## v0.1.8.1-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### CRITICAL: P2P Cross-Platform File Transfer Fixes

- **Mobile→Desktop File Transfers Silently Deleted (CRITICAL):** Mobile sent `hash: ''` in every FILE_TRANSFER_START/END packet — desktop's `transfer.js` computed the real SHA-256 and always found a mismatch, deleting the received file immediately after full transfer. Fixed two ways: (1) mobile now computes SHA-256 via `crypto.subtle.digest()` before chunking and sends the real hash; (2) desktop `transfer.js` skips hash check when sender omits the hash (safety net).
- **Mobile FILE_TRANSFER Packets Had Empty `from`/`senderId` (CRITICAL):** `_sendLargeFileToPeer` called `createPacket(type, payload)` with only 2 args — `from` was `''`. Desktop couldn't identify the sender. Fixed: passes `MStore.user.id` as `fromId` and `peerId` as `toId`.
- **Mobile `createPacket` Signature Misaligned with Desktop (CRITICAL):** Mobile: `createPacket(type, payload, senderId)` — Desktop: `createPacket(type, fromId, toId, payload)`. Different arg order + missing `packetId` + missing `to` field. Aligned mobile to desktop's `(type, fromId, toId, payload)` signature with matching return shape. Updated all 28 call sites.
- **Duplicate Messages from Large File Transfers (CRITICAL):** Text MESSAGE and FILE_TRANSFER packets were sent independently — receiver created TWO message bubbles (one text, one file icon). Fixed: sender includes `_fileId` markers in MESSAGE packet attachments; all receive handlers (mobile FILE_TRANSFER_END, desktop `file-received`) search for existing message by `_fileId` and update the attachment in-place before falling back to creating a new entry.

### High-Impact Fixes

- **Missing File Extensions in Mobile File-Type Detection (HIGH):** Mobile's FILE_TRANSFER_END handler was missing many common extensions — videos (`m4v`, `wmv`, `flv`, `f4v`, `ts`, `mts`, `m2ts`), images (`svg`, `tif`/`tiff`, `bmp`, `heic`, `heif`, `avif`), audio (`opus`, `mka`). Added all with correct MIME mappings.

### Critical Bug Fixes (Previous)

- **Media Persistence Fixed (HIGH):** Received files no longer lost after app restart. FILE_TRANSFER_END handler stores `_dataUrl` alongside blob URL — `renderMessages()` reconstructs blob URLs from persisted base64 on restart. Incoming MESSAGE attachments preserve `_dataUrl`.
- **renderMessages No Longer Mutates Store (HIGH):** Data URL → blob URL loop was mutating `MStore.messages[chatId]` in-place, causing subsequent saves to write dead blob URLs. Replaced with non-mutating `_resUrl()` helper.
- **.webm File Misclassification Fixed (HIGH):** `.webm` was in both `audioMatch` and `videoMatch` — `audioMatch` checked first. Removed from `audioMatch`; video checked before audio.
- **Desktop File Received Missing isVideo (MEDIUM):** Added `isVideo` detection with proper MIME mapping.

### Video Player

- **Mobile Video Aspect Ratio Fixed:** Added `object-fit: contain`, `max-height: 50vh`, `background: #000` to `.ovp-video`.

### Technical

- **Version:** v0.1.8.1-beta hotfix release.

## v0.1.8-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Store Class Ported to Mobile

- **Dedicated Store Class Created:** Inline MStore (~350 lines) extracted into `mobile/src/js/store.js` (760 lines) — a full Store class with property-based access (`MStore.friends`, `MStore.settings.*`) for backward compatibility (532+ mobile references), plus desktop-style `getState()`/`setState()`/`subscribe()` for future cross-platform convergence.
- **Desktop Parity Features:** `subscribe()`/`notify()`, `blockUser()`/`unblockUser()`, `pinMessage()`/`unpinMessage()`, `markAsRead()`, `toggleMute()`, `addGroup()`/`removeGroup()`/`addMemberToGroup()`, `closeDM()`/`togglePinDM()`/`reopenDM()`, E2EE peer key storage, transfer tracking, `addOrUpdatePeer()`.

### Bug Fixes

- **addMessage() Unread Tracking Fixed (HIGH):** Unread tracking block removed from `addMessage()` — mobile manages unreads via `chat.unread` on chat objects, not via Store's internal `unreadCounts`. Every message was previously counted as unread because `this.activeChatId` is never set by mobile (mobile uses local `var activeChatId`).
- **mutedChats Property Misalignment Fixed (HIGH):** `this.mutedChats` now aliases `this.settings.mutedChats` (same object reference) — synced in constructor, `load()`, and `save()`. All mute/unmute operations update the same underlying object that mobile app reads via `MStore.settings.mutedChats`. Added `mutedChats: {}` to settings defaults.
- **setState() currentUser Ignored Fixed (MEDIUM):** `setState()` now explicitly maps `newState.currentUser` to `this.user` — previously this key was silently dropped.

### Technical

- **Architecture:** MStore API fully backward-compatible — `window.MStore = new Store()` declared at end of `store.js`, loaded via `<script src="js/store.js">` before `app.js` in mobile `index.html`.
- **CSP Updates:** Desktop `index.html` updated to allow `https://cdnjs.cloudflare.com` in both `script-src` and `style-src` for Prism.js syntax highlighting.
- **Prism.js Loading Fixed:** Moved Prism JS to load before `app.js` on both desktop and mobile. Added `language-*` class to `<pre>` elements in all 3 copies of `sanitize.js` for immediate CSS theme matching.
- **Version:** Bumped to v0.1.8-beta across all manifests, About tabs, and changelogs.

## v0.1.7-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### Video Playback Fixes

- **PIPELINE_ERROR_DECODE Root Cause Fixed:** Audio packet decode errors in fMP4 files resolved via Content-Type fix in `main.js:contentTypeFromAtt()`. Video files now play continuously without stalling at ~16s.
- **Re-render Guard During Playback:** Store subscription blocks message re-renders while any video is playing (except chat switches). Prevents player destruction during message updates. Handles `notify()` without `changedState` (previously bypassed guard).
- **Decode Error Retry Mechanism:** On `PIPELINE_ERROR_DECODE`, source is reloaded and playback skips forward +2s past the corrupt packet (up to 3 attempts).
- **Removed Forced Seeking:** Eliminated forced `currentTime = 1e10` hack for `orbit-db://` / `orbit-file://` URLs that was causing playback pauses.

### Media Player UX Improvements

- **Larger Video Player:** Video display increased to 720×600 in message bubbles. Full-screen player includes `box-shadow` and theme-matched background (`var(--bg-surface)`) for letterbox areas.
- **Larger Audio Player:** Audio waveform canvas height increased to 200px with full-width containers (720px), matching video layout.
- **Separated Media Layout:** Video and audio removed from the attachment image grid — rendered as standalone blocks with full width. Image grid stays compact at 280px max-width.
- **Fullscreen Theme Integration:** Fullscreen video uses CSS variable `var(--bg-surface)` for letterbox background — blends with active UI theme instead of hard black.

### Technical

- **Version:** Bumped to v0.1.7-beta across all manifests, About tabs, and changelogs.

## v0.1.6-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### P2P Connectivity & Bug Fixes

- **Desktop Auto-Connect Port Fix:** AutoConnect now uses `peer.tcpPort || 46000` instead of hardcoded 46000. Per-peer TCP ports stored in `SocketManager._peerPorts` map from connect and TCP beacon processing. Reconnect uses stored port.
- **Desktop Manual Connect Port Fix:** Connect accepts `port` parameter (defaults 46000) via preload bridge.
- **Desktop P2P Edit Broadcast Loop Fixed:** `store.editMessage` no longer re-broadcasts to group members (caused echo loop). Single broadcast from `chat-panel.js:sendToAll`.
- **Desktop Context Menu "Edit Message" Wired:** No-op log replaced with proper editingMsg flow.
- **Mobile Disconnect Handler Fixed (CRITICAL):** Friend lookup by `connectionId` (native `ip:port`) now works — `connectionId` stored on friend objects from connect and TCP beacon events. Falls back to IP from `connectionId.split(':')`.
- **Mobile TCP Beacon Handler Fixed:** Stores `tcpPort`, `ip`, and `connectionId` on friends in both new-friend and existing-friend paths.
- **Mobile UDP Beacon Handler Fixed:** Stores `tcpPort` from beacon payload on both new-friend and existing-friend paths.
- **Mobile Auto-Reconnect Port Fixed:** Uses peer's `tcpPort` (not own port) for reconnection.
- **Mobile Orbit Echo Stays Online:** Echo friend's status now correctly reset to `'online'` on friend load.

### Message Editing & Reactions

- **Mobile Edit P2P Broadcast:** Edits now broadcast over P2P to both DMs and group members (with `chatId` for group routing).
- **Mobile `edited` Flag:** Incoming MESSAGE_EDIT packets set `msg.edited = true`.
- **Mobile Reaction UI:** Reaction button with `smile-plus` icon, floating reaction picker (👍❤️😂😮😢🙏), click-to-toggle on reaction pills, instant local state + P2P broadcast via REACTION protocol.
- **Desktop Changelog Restored:** v0.1.4-beta content restored (was blank between header and v0.1.3-beta block). v0.1.5-beta added as Latest.

### Android Foreground Service (Background Execution)

- **OrbitForegroundService Created:** Full P2P networking extracted into Android Foreground Service — TCP server, UDP multicast discovery, connection map, thread pool, WakeLock, persistent notification. `START_STICKY` ensures survival after process kill.
- **OrbitP2PPlugin Refactored:** Thin proxy that starts/stops foreground service, forwards plugin calls via Binder, drains event queue every 100ms via Handler.
- **BootReceiver:** Restarts foreground service on `BOOT_COMPLETED`.
- **MainActivity:** Starts foreground service immediately on launch.
- **JS Lifecycle Handlers:** `visibilitychange`, Capacitor `appStateChange`, and `pageshow` listeners re-render UI and restart discovery on foreground.
- **Event Queue Drainer:** 100ms poll of `ConcurrentLinkedQueue` with `notifyListeners` for 4 event types (message, connection, disconnect, peerFound) plus sendFailed/connectFailed.
- **ServiceBinder:** Proper IBinder implementation exposing service instance to plugin.
- **Battery Optimization Exemption:** `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission and JS bridge method for best-effort exemption request.

### Silent Bug Fixes (Foreground Service Audit)

- **sendFailed/connectFailed Events No Longer Dropped:** drainEvents now handles both event types and notifies JS listeners.
- **serverSocket Made Volatile:** Prevents stale null read in stopServer from closing wrong socket.
- **PeerConnection Stale Map Entry Eliminated:** originalPeerId field ensures both original and updated peerId keys are cleaned up on disconnect.
- **Executor Shutdown on Destroy:** `executor.shutdownNow()` called in onDestroy to prevent thread leaks on START_STICKY recreation.
- **Static eventQueue Cleared on Destroy:** Prevents stale events from old instance polluting new plugin.
- **SO_REUSEADDR on MulticastSocket:** Prevents "Address already in use" on discovery restart after network change.
- **joinGroup with Explicit Interface:** Uses `joinGroup(group, ni)` for Android 10+ compatibility.

### Technical

- **Architecture:** P2P networking lives in persistent `OrbitForegroundService` independent of Activity/WebView lifecycle. Plugin proxies calls via Binder with intent-based fallback for calls before bind completes.
- **Event Ordering:** drainHandler starts in `onServiceConnected` (after bind completes) which runs after JS listener registration (same main-thread queue). No events lost before listener registration.
- **Version:** Bumped to v0.1.6-beta across all manifests, About tabs, and changelogs.

## v0.1.5-beta

> **Note:** This is not a stable release — latest development version with experimental features.

### New Features

- **Account Switcher (Experimental):** Right-click avatar → panel to add/switch/logout accounts. Logout quits app (accounts persist in DB). Last active user auto-loaded on launch. Gated behind Experimental Features toggle in Advanced settings.
- **PIN Lock Screen (2FA Experimental):** 4-8 digit numeric PIN with SHA-256 hashing (Node `crypto` on main process). Numpad UI, 5-attempt cooldown (30s), "Forgot PIN" reset (data intact). Only prompted on app launch (never on resume/sleep). Gated behind Experimental Features.
- **Settings Security Tab:** PIN setup, change, disable flows. Full modal re-render when Experimental Features toggled to show/hide tab.
- **Orbit Echo Welcome Sequence:** 4 welcome messages with 5-8s typing indicator delays. Fires only when echo chat is empty. Echo excepted from all offline checks.
- **Per-Account Message Isolation:** Messages stored per-user via `userChatIds` settings map. DB migration v11 adds `accountOwnerId` to friends/groups/group_members. `reloadDataForCurrentUser()` re-reads filtered messages on account switch. Friends and groups remain shared; messages filtered by tracked chat IDs per user.
- **Per-Account Avatar Frames:** v10 migration adds `profileFrame` column to users table. Frame loaded from user record (not shared settings). `getFrameForUser()` reads from `currentUser.profileFrame`. Settings handler syncs frame selection to identity.
- **Avatar Frames in Account Switcher:** Both current account (36px) and other account rows (32px) render profile frame overlay at `top:-16%;left:-17%;width:133%;height:133%`, matching sidebar-left styling.
- **Profile Frame Migration:** Existing settings-based frames migrated to per-account on first boot after v10. Runs after `Identity.init()` so `currentUser` is real (not placeholder). `SidebarLeft.renderAvatar()` called after migration for immediate display.
- **Desktop Beacon Payload Enriched:** Both UDP (`discovery.js`) and TCP (`socket.js`) beacons now transmit `avatar`, `banner`, `bio`, `profileFrame`, `publicKey`. Incoming BEACON handler stores full profile on peers.
- **Friend Status Starts Offline:** Friends load with `lastSeen=0` and `status='offline'` (except `local-echo` which stays online). Offline check threshold reduced to 45s with 15s check interval. Discovery emits `peer-gone` callback → IPC → marks friend offline.
- **Group Avatar Backfill:** Async fetch of `orbit-avatar://` for groups with `avatarPath` but no `avatarDataUrl` on store init + group info open. Non-blocking, errors silently caught.

### Bug Fixes

- **Messages from other accounts no longer leak:** `reloadDataForCurrentUser()` auto-track now only includes friends/groups with `accountOwnerId === uid`. `renderList()` filters displayed DMs by `_userChatIds`. `renderGroups()` only shows groups where current user is a member.
- **Closing DMs doesn't affect other accounts:** `closeDM()` no longer calls `dbDeleteFriend` (was deleting globally). `closedDMs` and `pinnedDMs` stored per-account in settings (`userClosedDMs`, `userPinnedDMs`). Loaded/saved per user on account switch.
- **Leaving groups correctly hides the group:** `removeGroupMember()` untracks chat from `userChatIds` when current user leaves. `renderGroups()` checks membership before showing group. Group removed from current account's list.
- **"User"#0000 placeholder leaking:** `identity.js:getAll()` filters out entries without valid `userId/usertag/username`. Store placeholder changed from `id: null` to `userId: null`. Profile frame migration guarded with `userId` check and moved after `Identity.init()`.
- **Profile frame migration not triggering:** Migration condition changed from `currentUser.profileFrame == null && pf` to `pf && pf !== cur` — handles the case where `Identity.init()`'s `save()` converted `null` to `0` via `dbSaveUser`.
- **SidebarLeft.renderAvatar crash before init:** Added `if (!this.container) return;` guard to prevent TypeError when called before `SidebarLeft.init()`.
- **Store.js syntax error:** Removed trailing commas between class methods that caused "Unexpected token ','".
- **`window.ChatPanel.showChat is not a function`:** Removed premature `ChatPanel.showChat()` call from `reloadDataForCurrentUser()`.
- **`require('crypto')` in renderer:** Changed to `window.crypto` for invite code generation.
- **Migration v11 robustness:** Column-existence checks before `ALTER TABLE`. Guard in `migrations.run()` handles non-transactional `user_version` — if version ≥ 11 but columns missing, resets to 10 and re-runs.

### Technical

- **Identity System:** `Identity.init()` loads from multi-user DB. `getAll()` returns all saved users. `switchTo(userId)` swaps identity and updates last active tracking. `saveUser` stores `profileFrame` with `!= null` guard.
- **Database Schema:** v10: `ALTER TABLE users ADD COLUMN profileFrame INTEGER DEFAULT 0`. v11: `accountOwnerId TEXT` on friends, groups, group_members tables.
- **Per-Account State Storage:** Three settings keys added: `userChatIds` (map of userId → chatId[]), `userClosedDMs` (map of userId → {friendId: true}), `userPinnedDMs` (map of userId → {friendId: true}).
- **Network Restart:** Account switch calls `networkStop` (nullifies all instances) → `Identity.switchTo()` → `networkStart` (re-creates with new identity). All TCP connections drop and re-establish.
- **Migration Rollback Guard:** `db.pragma('user_version')` is non-transactional. Added column-existence check at start of `migrations.run()` to detect partial migration state and recover.

## v0.1.4-beta

### Stability & Core Infrastructure

- **P2P Auto-Connection Stabilization:** PING/PONG keep-alive heartbeat (15s interval, 30s idle → close), 8s connection timeout (disabled after connect — heartbeat now solely manages health), reconnect with exponential backoff (max 5 attempts, capped at 30s), stale peer pruning (180s threshold, 60s check interval), network change detection (10s IP polling → full discovery restart + LAN scan), and auto-connect duplicate protection (checks `connections.has` + `_pendingConnects.has`). Desktop: `socket.js`, `discovery.js`, `main.js`, `preload.js`. Mobile: JS-level PING/PONG via `Orbit.P2P.send()` at `netKeepAlive` interval; inbound PING auto-responds with PONG; tracked consecutive missed pings.
- **Desktop P2P Bugfix Audit (17 fixes):** Desktop socket 8s Node.js idle timeout disabled after connect (heartbeat manages health); write-queue key operator precedence bug (`key + ''` → `'' + key`); reconnect `.catch()` added + reconnect counter resets on data; preload.js forwards reconnect args (`reconnectEnabled`, `reconnectIntervalMs`); PIN/UNPIN use `payload.groupId` not `packet.from`; GROUP_MEMBER_ADDED updates existing member fields; SYSTEM delete uses `payload.chatId`; redundant bulk group persist removed from setState; GROUP_CREATE enriches `publicKey` from friends list; GROUP_CREATE payload includes owner `publicKey`; GROUP_JOIN_REQUEST includes `usertag`/`avatar`/`status`. Files: `socket.js`, `preload.js`, `store.js`, `sidebar-middle.js`.
- **Desktop Syntax Fix:** Missing closing parenthesis in `app.js:777` ternary chain (`'image/jpeg'));` → `'image/jpeg')));`) — the single missing paren crashed the entire renderer, causing a blank window. Restored desktop app startup.
- **Write-Queue Stability:** Per-connection write queue key operator precedence fixed — `key + ''` corrected to `'' + key` to prevent queue key collisions under concurrent writes.
- **Translation Engine Rewrite:** In-memory cache (`window._translationCache` keyed by `text|lang|source`), request deduplication (`window._pendingTranslations` shares one Promise per active request), AbortController for cancelling in-flight requests, inline "Retry" link on failure. File: `chat-panel.js`.
- **Voice Messages Stabilization:** `contentTypeFromAtt()` returns `'audio/webm'` for `type === 'audio'`; audio elements get `onerror="if(window.mediaSrcOnError) window.mediaSrcOnError(this)"` for auto-retry; chunked transfer audio detection in `app.js` sets proper `type: 'audio'` + MIME via `extMap` (webm/mp3/wav/ogg/flac/aac/m4a/wma). Files: `main.js`, `chat-panel.js`, `app.js`.

### Media & Message Experience

- **Image Viewer Quick-Save:** File System Access API `showSaveFilePicker` with `Blob` fallback download — saves images directly from the gallery without right-click.
- **Keyboard Navigation:** ← → arrows for gallery navigation, Escape to close. Swipe between images (mouse drag + touch).
- **Download Fix:** All `orbit-db://` and cross-origin image downloads now go through `fetch()` + `blob()` pipeline to bypass CSP restrictions.
- **Loading Placeholder:** CSS `background: var(--bg-surface)` + `opacity` fade-in on image thumbnails — elimates blank flash on slow loads.

### Performance Mode

- **New Experimental Toggle:** `experimentalPerformanceMode` defaults `false`. Two-step confirmation in Advanced tab. Adds `.performance-mode` CSS class on `<html>` — kills animations, freezes GIFs, skips link preview OG fetch, slows offline checks to 60s, stops connection stats polling and dev overlay rAF.
- **Runtime Guards:** `window._performanceMode` checked in chat-panel (skip reflow-heavy calls) and app.js (skip non-critical intervals). CSS `[data-refreshing] .message-row { animation:none !important }` prevents re-animation on DOM re-render.

### Mobile Full Parity

- **Protocol.js Synced:** 15+ missing types added to `mobile/src/shared/network/protocol.js` — MESSAGE_EDIT, MESSAGE_DELETE, READ, SYSTEM, PIN_MESSAGE, UNPIN_MESSAGE, GROUP_INVITE, CALL_*, PING, PONG, FIND, REQUEST, ACCEPT, FILE_TRANSFER_START/CHUNK/END. Matches canonical `shared/network/protocol.js` (46 types).
- **Chat-Existence Check Fixed:** GROUP_CREATE and GROUP_JOIN_RESPONSE handlers exempted from `if (!chat) return;` guard — these types create the chat, so the check can't exist yet.
- **`name` vs `username` Mismatch Fixed:** All 4 group handlers now check `origin.username || origin.name`. Store objects cloned instead of mutated to prevent reference corruption.
- **Toast Concatenation Fixed:** Added parentheses for correct operator precedence in toast message assembly.
- **Desktop Settings Ported (11 new defaults):** `notifyVolume: 80`, `notifySoundType: 'chime'`, `translateTargetLang: ''`, `autoDetectSource: true`, `netReconnectInterval: 10`, `netKeepAlive: 30`, `webrtcFallback: true`, `logLevel: 'None'`, `netBandwidthLimit: 0`, `experimentalFpsMonitor: false`, `experimentalDevOverlay: false`.
- **Notifications UI Expanded:** `notify-sound` toggle (was missing HTML), volume slider (0-100), sound type select (Chime/Pop/Gentle/Classic) with distinct Web Audio oscillator patterns.
- **Translation Settings Added:** Target language select (30 languages), auto-detect toggle, message translate moved from Appearance to Chat section.
- **Network Settings UI:** Reconnect interval (number), keep-alive select (10/30/60/120s), WebRTC fallback toggle, log level select (None/Error/Info/Debug), bandwidth limit (number).
- **Settings Wiring (Deep Integration):** `debugLog()` filters by `logLevel` (None→silent, Error/Info/Debug); `buildBeacon()`/`initP2P()`/TCP beacon all read `tcpPort` from settings; `initP2P()` passes `udpPort` to native `Orbit.P2P.startDiscovery()`; auto-reconnect reads `netReconnectInterval` + passes `netTimeout` to native Java `connect()`; PING/PONG heartbeat sends PING at `netKeepAlive` interval; `FILE_CHUNK` throttles via `netBandwidthLimit` (setTimeout pacing); `networkMode === 'Custom IP'` skips UDP discovery.
- **`playNotificationSound()` Updated:** Uses `notifyVolume` (gain 0-100) and `notifySoundType` (4 oscillator patterns: chime, pop, gentle, classic).
- **`translateMessage()` Updated:** Reads `translateTargetLang` (falls back to `navigator.language`) and `autoDetectSource` (`langpair=auto|target` or `langpair=en|target`).
- **profileFrame Clean-Up:** TCP beacon new-friend path fixed (`bp.profileFrame !== undefined ? bp.profileFrame : null` so `0` stores as `0` not `null`). `getProfileFrame(source)` helper added — defends against null/undefined/NaN/off-switch. All 7 inline `(source.profileFrame || 0)` patterns replaced.
- **Mobile DB Migration Fixed:** `migrateOldData()` moved to run BEFORE `MStore.load()` (was running after, causing old unprefixed localStorage keys to never be picked up). Added console.log visibility — now shows "Running old data migration..." / "Data migration already completed — skipping" / "Migrated N group(s) — added missing fields".
- **What's New Added to Mobile About:** Full changelog modal covering v0.0.2-beta through v0.1.4-beta, matching desktop's changelog.js.

### Desktop Enhancements

- **Reconnect Settings Bridge:** `preload.js` forwards `reconnectEnabled` and `reconnectIntervalMs` through `networkStart` IPC. User settings now actually affect socket reconnect behavior.
- **Native Java Plugin Changes (Mobile):** `OrbitP2PPlugin.java` — `connect()` uses JS-provided `timeout` (was hardcoded 5000ms); `startDiscovery()` uses JS-provided `discoveryPort` (was hardcoded `DISCOVERY_PORT`).

### Group Sync (store.js)

- GROUP_OWNER_TRANSFER: Updates role to 'owner' for transferred member.
- GROUP_LEAVE: Self-cleanup via `removeGroup()` + clears `activeChatId`.
- GROUP_INVITE: Adds group + initializes messages array.
- GROUP_CREATE: Initializes messages array on group creation.
- GROUP_MEMBER_ADDED: Updates existing member fields rather than inserting duplicate.
- GROUP_CREATE: Enriches all members with `publicKey` from friends list.
- GROUP_JOIN_REQUEST: Includes `usertag`/`avatar`/`status` in join payload.

### Bug Fixes

- **Forward/Edit/Delete routing fixed — group messages no longer arrive in DMs:** `doForward()` was missing `payload.chatId` for group targets; `MESSAGE_EDIT` and `MESSAGE_DELETE` payloads also lacked `chatId`. Receivers routed these to `packet.from` (a user DM) instead of the group. All three now include `chatId` for groups, plus store.js handler falls back to `payload.groupId` for broader compatibility.
- **Duplicate message sending guard:** Added `this._sending` lock in `sendMessage()` to prevent concurrent sends. Added msgId deduplication in `addMessage()` — if a message with the same id already exists, the duplicate is silently dropped.
- **GROUP_MEMBER_ADDED immutable state:** Replaced direct object mutation (which bypassed `setState` and caused stale reads) with proper `setState()` using `map()`.
- **addMemberToGroup avatar enrichment:** New members now have their avatar cross-referenced from the friends list when the incoming packet lacks one (common in cross-platform flows).
- **Group avatar sync (desktop↔mobile):** Desktop avatar upload now stores `avatarDataUrl` alongside `avatarPath`; desktop GROUP_CREATE and GROUP_JOIN_RESPONSE payloads include `groupAvatar`; desktop store.js handlers read `groupAvatar` from incoming packets; mobile GROUP_JOIN_RESPONSE handler now reads `groupAvatar` and stores it; desktop renderers fall back to `avatarDataUrl` when `avatarPath` is not set.
- **Desktop blank window — syntax error:** Missing `)` on line 777 of `app.js` in the MIME type ternary chain (`'image/jpeg'));` → `'image/jpeg')));`). Mismatched parenthesis caused the entire renderer JavaScript to fail silently.
- **Mobile auto-reconnect now reads user settings** (was hardcoded 5s).
- **Mobile PING/PONG heartbeat now uses `netKeepAlive` from settings** (was not implemented).
- **Mobile TCP connection timeout now passed from settings to native Java** (was hardcoded 5000ms).
- **Mobile UDP discovery port now passed from settings to native Java** (was hardcoded `DISCOVERY_PORT`).
- **Mobile `FILE_CHUNK` bandwidth throttling implemented** via setTimeout pacing when `netBandwidthLimit > 0`.
- **Mobile debugLog now respects logLevel** — None suppresses all output, Error only shows errors, etc.
- **Mobile network tab now shows/hides UDP port field based on `networkMode`**.
- **profileFrame value `0` now stored correctly** (TCP beacon was converting `0` → `null` via `||`).
- **Desktop group sync fixes** — GROUP_OWNER_TRANSFER role, GROUP_LEAVE cleanup, GROUP_INVITE init, GROUP_CREATE init, PIN/UNPIN payload routing, SYSTEM delete routing.
- **Desktop write-queue key collision** — fixed `key + ''` to `'' + key` operator precedence.
- **Desktop reconnect promise chain** — added `.catch()` to `connectToPeer()` in _scheduleReconnect.
- **Desktop reconnect counter reset on data** — prevents permanent exponential backoff on healthy connections.
- **Desktop auto-connect duplicate protection** — checks both `connections.has` and `_pendingConnects.has` before initiating new connections.
- **Exponential backoff fixed** — formula `(attempts + 1) * reconnectInterval` capped at 30s, not flat 30s.
- **Network change detection** — IP polling every 10s triggers full discovery restart + LAN scan when IP changes.

### Technical

- **Protocol:** Mobile `protocol.js` synced with canonical — 46 types total, all CALL_*, FILE_TRANSFER_*, PIN, SYSTEM, READ types available on both platforms.
- **P2P Heartbeat:** Desktop `_startHeartbeat`: 15s interval, 30s idle timeout → sends PING, expects PONG within 15s. Mobile: JS-level PING/PONG via `Orbit.P2P.send()` at `netKeepAlive` interval.
- **Reconnect:** Desktop `_scheduleReconnect`: exponential backoff `(attempts+1) * _reconnectInterval` capped at 30s, max 5 attempts. Mobile: delay = `netReconnectInterval * 1000`, calls `Orbit.P2P.connect(ip, tcpPort, friendId, timeoutMs)`.
- **profileFrame Helper:** `getProfileFrame(source)` — returns `Math.max(0, parseInt(val, 10) || 0)`. Returns `0` when experimental toggle is off or source is null/invalid. Used in all 7 render locations.
- **Bandwidth Throttling:** `FILE_CHUNK` calculates minimum inter-chunk interval from `chunkSize / (bwLimit * 1024) * 1000` ms; uses `setTimeout` to pace. Only active when `netBandwidthLimit > 0`.
- **Network Settings 3-Layer Chain:** JS settings → p2p-mobile.js bridge parameters → native Java plugin method args. Settings actually affect socket/discovery behavior.
- **Avatar Data URL Transport:** Group avatar data URLs stored as `avatarDataUrl` alongside file-based `avatarPath`. Desktop GROUP_CREATE/GROUP_JOIN_RESPONSE payloads carry `groupAvatar` field; receivers store as `avatarDataUrl` (desktop) or `avatar` (mobile). Desktop renderers fall back to `avatarDataUrl` when `avatarPath` is unset.

## v0.1.3-beta
- **Native Android System Notifications:** Messages now show as real system notifications when app is backgrounded (requires POST_NOTIFICATIONS permission).
- **Desktop Notification Avatars:** Sender/group avatar now shown as notification icon (previously static Orbit icon).
- **Connection Stats Panel:** Live P2P status — online peers, uptime, sent/received message counters (refreshes every 2s).
- **Video File Support:** Upload, render, and view video files in chat — `<video>` elements with play overlay in message bubbles.
- **Video Preview Modal:** Full-screen video player on desktop and mobile (matching image preview UX).
- **Video Compression:** Large videos (>5MB) auto-compressed to 720p/500kbps via MediaRecorder + captureStream before sending.
- **Performance Mode Toggle:** Experimental setting with two-step confirmation — disables animations, link previews, GIF playback, and background CPU tasks.
- **Group Info UI:** Hardcoded colors replaced with theme CSS variables for consistent dark/light mode appearance.

### Bug Fixes
- **Image Viewer Not Opening on Click:** Root cause — `'friends'` in chat-panel store subscription triggered full DOM re-render on every friend status beacon (10s). If a re-render occurred between mousedown and mouseup on an image thumbnail, the click event targeted the new `message-row` instead of the replaced `<img>`, and `closest('[data-open-image]')` missed. Fixed by removing `'friends'` from subscription and adding hit-test fallback in click handler.
- **Mobile Notifications Overhaul:** Added native Android system notifications via `@capacitor/local-notifications` — shows notification with sender name and message preview when app is backgrounded. Includes POST_NOTIFICATIONS permission, `orbit_messages` and `orbit_general` notification channels, and permission request on startup.
- **Desktop Notification Avatars:** Native Electron notifications now display the sender's avatar as the notification icon (previously used static Orbit app icon). Avatar data URLs are converted to `nativeImage` via `nativeImage.createFromDataURL()`.
- **Sender Avatar in Desktop File Notifications:** File received notifications now include the sender's avatar icon.
- **Working Status Panel:** The experimental "Connection Stats" overlay (Developer Overlay toggle) now shows live data — connection status (online/offline), peer count, uptime (since P2P start), and messages sent/received counters. Refreshes every 2 seconds.
- **Group Info Overlay Polish:** Replaced hardcoded colors (`#22c55e`, `#6b7280`, `#555`) with CSS design tokens (`var(--accent-success)`, `var(--text-muted)`, `var(--bg-active)`). Toggle track backgrounds now use theme-consistent colors.
- **Video File Support:** Added `video/*` file type detection in both file input and drag-and-drop handlers on desktop and mobile. Videos are classified as `type: 'video'` and rendered as `<video>` elements with play overlay icon in message bubbles.
- **Video Preview Modal:** Desktop: `ImageViewer.openVideo()` — opens video in a full-screen player overlay with play/pause controls. Mobile: new `#video-preview-overlay` with `<video controls>` element, matching the image preview UX.
- **Upload Videos Context Menu:** Added "Upload Videos" option to the `+` button context menu on desktop (sets `accept="video/*"`) and the drop-up menu on mobile.
- **Video Compression (Desktop):** `compressVideoFile()` method re-encodes video files larger than 5MB at 720p max resolution via `MediaRecorder` with VP9 codec at 500kbps bitrate. Uses `canvas.captureStream()` at 15fps for frame capture. Compressed video replaces staged file for sending.
- **Video Compression (Mobile):** `compressVideoMobile()` function mirrors the desktop approach for mobile WebView — compresses large videos client-side before sending via the P2P network.
- **Leaked Offline Check Interval:** Removed duplicate `setInterval` at startup — `applySettings()` is now the single source for offline check timing.
- **Mobile HTML Nesting Fixed:** Missing `'</div>' +` concatenation in Performance Mode toggle row caused broken DOM structure on Android.
- **image-viewer.js Null-Safety:** `openFromMessage()` now guards against null store/messages with fallback URL; `close()` and `openVideo()` wrapped in try/catch for missing DOM elements; `init()` uses `readyState` guard.

### Performance & Polish
- **P2P Discovery Optimization:** Beacon broadcast interval reduced from 5s to 10s (desktop and mobile) — cuts network discovery chatter by 50%. Peer stale threshold increased from 120s to 180s to accommodate the slower beacon rate. Offline status check interval reduced from 30s to 15s for faster detection of stale peers.
- **File Transfer Retry Backoff:** Changed from linear (`500ms × retry`) to exponential (`200ms × 2^retry`, capped at 5s) for more efficient retry behavior.
- **Performance Mode:** New toggle in Experimental settings with two-step confirmation — kills all animations/transitions, freezes GIF playback, skips link preview OG fetch, slows offline check to 60s, stops connection stats polling and dev overlay rAF.
- **Forced Reflow Cascade Eliminated:** ResizeObserver disconnected before every `innerHTML =` in `renderChat()`, reconnected after all DOM changes complete; throttled to 1s to prevent cascade from async image loads.
- **`_positionMessageActions` Suppressed in Performance Mode:** Both `requestAnimationFrame` and `ResizeObserver` callbacks check `window._performanceMode` and return early, eliminating the 170-475ms forced reflow cascade entirely.
- **data-refreshing Animation Guard:** CSS `[data-refreshing] .message-row { animation:none !important }` prevents message entrance animation from re-firing on DOM re-render.
- **Compact Spacing & Swipe-to-Reply:** Moved from Experimental to general chat settings (always available).

## v0.1.2-beta

### Bug Fixes
- **Manual Connect Bug Fix (Critical):** Manual "Add a Friend" IP connect now works — `socket.js` socket remapping no longer blocked by a stale `'manual'` peerId key. `sendMessage()` finds the existing TCP connection instead of creating a new one on every message.
- **Protocol Type Unification:** All hardcoded protocol type strings (`'MESSAGE'`, `'BEACON'`, `'FILE_TRANSFER_START'`, etc.) replaced with `window.Protocol.Types.*` / `Orbit.Protocol.Types.*` constants across both platforms (store.js, mobile/app.js). Prevents silent failures when new types are added.

### Technical
- **Build Pipeline Overhaul (v0.1.2-beta plan):** Android now builds `assembleRelease` instead of `assembleDebug`. SHA256SUMS.txt generated per platform and consolidated at release. Artifact verification step fails the build if any required artifact (`.exe`, `.dmg`, `.AppImage`, `.deb`, `.apk`) is missing. Build metadata (version, commit hash, date) auto-injected into release notes. Asset size table generated dynamically.
- **Protocol Definitions Unified:** `shared/network/protocol.js` and `desktop/src/js/network/protocol.js` now both contain all 47 protocol types (CALL_*, FILE_TRANSFER_*/CHUNK/END/OFFER/ACCEPT, DISCOVERY, E2EE_KEY_EXCHANGE, etc.) — cross-platform type compatibility guaranteed.

## v0.1.1-beta — **Stable Release**

### New Features
- **Voice & Video Calls (P2P):** Full WebRTC call system — CallManager with peer-to-peer audio/video, incoming call notification, mute/speaker controls, call timer, ICE candidate exchange via P2P network layer
- **Group Calls (Mesh):** Mesh-topology group calls — each participant gets their own RTCPeerConnection; start/join/leave group calls; participant grid with video tiles or avatar circles for audio-only
- **Camera Toggle:** On/off switch during calls with deterministic HSL avatar placeholder when camera is off
- **Message Forwarding:** Forward messages (with attachments) to any chat via chat picker modal — desktop action bar + context menu, mobile long-press
- **Block User:** Block/unblock from context menu (desktop) and profile sidebar; P2P packet filter drops blocked senders; mobile friend context menu toggle
- **Search Within a Chat:** Scoped search with chatId filter, context-aware placeholders, sender filter, date inputs with color-scheme:dark
- **Export Chat History:** JSON or TXT export with timestamped downloads via Data Manager card
- **Save/Load Themes:** Export current theme as `orbit-theme.json`; import via file picker — collapsible section in Appearance tab
- **Message Translate Unlocked:** Removed experimental gate; always-on translate button moved to Appearance tab (default on); mobile integration via MyMemory API

### Bug Fixes
- **Mobile Reply `fromName` Fix (Critical):** Root cause — `fromName` not set on incoming P2P messages; peer ID merge didn't update `from` fields in existing messages. `fromName` now sent in ALL outgoing MESSAGE packets (E2EE and plaintext, DM and group) on both platforms
- **Lucide Icon Null Reference:** All `this.querySelector('i')` calls in button handlers changed to `this.querySelector('svg')` — `lucide.createIcons()` replaces `<i>` with `<svg>`, causing `setAttribute` on null
- **Camera Toggle Placeholder Refactored:** Removed dynamic DOM creation — placeholder pre-rendered in HTML; toggle simply switches `display:none` between video and placeholder
- **Search Modal Text Polish:** Removed `text-transform:uppercase` from header; cleaner filter placeholder; `color-scheme:dark` on date inputs; context-aware empty-state text

### Performance & Polish
- **Online Status Improvements:** `lastSeen` timestamp stored on BEACON receive; 30-second interval checks for stale connections (120s timeout) and marks offline
- **Inline Code Blocks:** CSS styling for `code` and `pre` elements (both platforms)
- **Call Modal UI Fixes:** Proper centering, min-height video area, audio wave bars with `align-items:flex-end`, correctly sized buttons with hover effects, local video as full grid tile in group calls (no PIP)

### Technical
- **WebRTC:** 6 new Protocol types (`CALL_OFFER`, `CALL_ANSWER`, `CALL_ICE_CANDIDATE`, `CALL_END`, `CALL_DECLINE`); `CallManager` with `peerConnections {}` for group mesh; group-aware routing in `app.js` via `packet.payload.groupId` and `packet.from`
- **Camera Placeholder:** Deterministic HSL color from username hash (`_callAvatarColor()`); pre-rendered `#local-placeholder` in both DM PIP and group grid tile
- **Store:** `blockedUsers` array with `blockUser()`/`unblockUser()`/`isUserBlocked()` methods; `messageTranslate` defaults
- **Version:** Bumped to `v0.1.1-beta` across all manifests, About tabs, and changelog

### Commits in this release

- `5545bd2` v0.1.1-beta-stable
- `cec3c23` Update CHANGELOG.md (release prep)

## v0.1.0-beta

### Performance — Up to 5× Faster Startup & Rendering
- **Selective Store Subscriptions (P0):** 8 subscribers (chat-panel, sidebar-middle, sidebar-left, gallery-sidebar, global-gallery, app.js) now check which state keys actually changed before re-rendering. Eliminates cascading renders — e.g., a transfer progress update no longer triggers a full chat re-render.
- **setStateBatch() (P1):** Coalesces rapid state updates (transfer progress, transfer errors) into a single microtask-based `setState` call via `Promise.resolve().then(...)`. `handleTransferProgress` and `handleTransferError` use the batch.
- **insertAdjacentHTML (P2):** Replaced `this.container.innerHTML +=` with `this.container.insertAdjacentHTML('beforeend', ...)` scoped to `chat-input-area`. Avoids serializing and re-parsing the entire chat input container on every render.
- **Event Delegation (P3):** Message bubble context menu, reaction pill toggle, header avatar click, cancel-transfer/dismiss-error buttons, and per-message avatar clicks all moved from per-element `querySelectorAll` + `addEventListener` (re-attached on every render) to persistent delegation in `initDelegatedActions`. Eliminates N DOM queries + N listener attachments per render cycle.
- **freezeGifImages Canvas Cache (P4):** `window._frozenCache` Map keyed by `img.currentSrc` — avoids repeated `canvas.drawImage` + `toDataURL` for the same image URL across renders.
- **Expanded freezeGifImages Selectors:** Added `img[src*="orbit-db://"]` (GIFs served via orbit-db protocol) and `.avatar img` (avatar GIFs) to the freeze selector. Previously only caught direct `.gif` and `data:image/gif` URLs.
- **Global freezeGifImages on Toggle:** `applySettings`/`applyAnimationSettings` now calls `freezeGifImages(document)` when Reduce Motion is enabled — freezes images outside the chat panel (sidebar avatars, header).
- **Mobile Feed Re-render on Toggle:** `renderMessages(activeChatId)` called when Reduce Motion is toggled on mobile, so images are restored when turning OFF and freshly frozen when turning ON.

### Startup Time — ~40% Faster (5s → 3s)
- **Deferred Init Phases (P0 #3):** `DOMContentLoaded` handler split into 3 phases — Phase 1 (immediate) runs only critical UI setup (theme, layout, keyboard shortcuts). Phase 2 (`setTimeout(0)`) defers `Identity.init()`, `networkStart()`, and all view inits to after first paint. Phase 3 (`requestIdleCallback`) defers EmojiPicker, Toast, and CustomThemeModal to browser idle time. The browser can paint the initial UI before any synchronous IPC or DOM heavy work begins.
- **Batch Store IPC (P0 #1):** Store constructor now makes a single `dbGetAllStartupData()` synchronous IPC call instead of 7+ sequential ones (settings, network settings, friends, messages, groups, uiState, mutedChats). Read-state loading was the worst offender — replaced N per-chat `dbGetReadState()` IPC calls with a single `SELECT * FROM read_state` query. All queries wrapped in a SQLite transaction for consistency.
- **Lazy Message Loading (P0 #2):** At startup, only the last 50 messages per chat are loaded from the database (via `ROW_NUMBER() OVER (PARTITION BY chatId)` window function). Full message history for a chat is loaded on-demand via `store.loadFullChatMessages(chatId)` when the user switches to that chat. For users with thousands of messages across many chats, this is the single biggest improvement — reduces IPC payload from potentially 10,000+ messages to ~500.

### Bug Fixes
- **orbit-db://attachment/ 404:** `database.js:addMessage()` now extracts binary data from inline data URLs (base64 decode) in both privacy mode and non-privacy mode paths. Without this, `bufferData` remained `Buffer.alloc(0)` for inline attachments, causing `getMessages()`/`getAllMessagesRaw()` reconstructed URLs to return 404.
- **Selective Subscriber undefined changedState:** 6 subscribers (chat-panel, sidebar-middle, sidebar-left, gallery-sidebar, global-gallery, app.js) now guard against `undefined` `changedState` — `store.notify()` can be called without arguments, which previously caused `k in changedState` to throw.
- **Message Avatar Click Re-attached:** The per-message avatar click handler was using delegation on `this.container` but was registered inside `attachEvents()` — re-attached on every `renderChat()` call. Moved to `initDelegatedActions` so it's registered once.
- **loadFullChatMessages Bug:** Was computing the diff (`allMsgs.filter(m => !existingIds.has(m.id))`) but storing only the diff (`this.state.messages[chatId] = newMsgs`), dropping existing messages. Fixed to store `allMsgs` directly.

### New Feature
- **Data Manager "Load All Stored Data":** Button in Settings → Data Manager that loads all messages, images, and files from the database into memory on demand. Uses a double-confirmation flow — first warning explains the memory impact, second confirmation asks "Are you absolutely sure?" before calling `store.loadAllMessages()` (wraps `dbAllMessagesRaw()`). Status indicator + Toast on completion.

### Technical
- **Database:** Added `getAllStartupData()` (transaction-wrapped batch), `getAllReadStates()` (single query vs N), `getRecentMessagesByChat(limit)` (window function). Added `getAllReadStates` prepared statement.
- **Store:** Added `loadAllMessages()` (force-load all messages from DB), `loadFullChatMessages(chatId)` (on-demand load for a specific chat with lazy loading). Removed N+1 read-state loading. Constructor destructures from single `dbGetAllStartupData()` call.
- **IPC:** Added `db-get-all-startup-data` channel + `dbGetAllStartupData` preload bridge. All startup DB data now flows through a single IPC round-trip.
- **Preload:** Exposed `dbGetAllStartupData` bridge method.
- **Version:** Bumped to `v0.1.0-beta` across all manifests, About tabs, and changelog.

## v0.0.9.3-beta

### Features & Enhancements
- **Group Info Panel Overhaul:** Redesigned with Add Member (friend picker with avatar/frame display), Leave Group (non-owners), Transfer Ownership (owner only), member search bar, created date, online/total count, wider 500px panel. Protocol additions `GROUP_MEMBER_ADDED` and `GROUP_OWNER_TRANSFER` with full cross-platform handlers.
- **Group DM Context Menu:** Desktop right-click on DM rows now mirrors group context menu — Pin/Unpin, Mute, View Profile, Copy ID, danger-styled Close DM. Mobile long-press bottom sheet includes Mute/Unmute, View Profile, Close DM (removes from friends list).
- **Pinned DMs:** `pinnedDMs` state with `togglePinDM()` store method. Sidebar sorts pinned DMs first with pin icon.
- **Close DM Removes Friend:** `closeDM()` calls `dbDeleteFriend(userId)` — permanently removes friend from DB, friends list, messages, pinned/muted/closed state. Auto-reopens on new message. Desktop sidebar filters out `closedDMs`.
- **P2P Diagnostics Panel:** Button in connection stats overlay opens modal showing P2P status, discovery, connected peers, muted/closed/pinned counts, and scrollable log buffer. Desktop console monkey-patch captures last 500 `console.log/warn/error/debug` entries.
- **Global Gallery Type Filters:** New All/Images/Files toggle filters attachments by media type. Non-image files render with type-aware Lucide icons (file-text, archive, music, video, code) instead of broken `<img>` tags. Masonry view groups files separately. Item count in header.
- **Global Gallery View Mode Persistence:** `galleryViewMode` setting stored in DB — survives page reloads.
- **Gallery Sidebar Files Tab Fixed:** `window.Format.bytes` → `window.Format.fileSize` (function didn't exist). `window.open()` replaced with download button using `orbitAPI.downloadFile()`. Extended file extension icon mapping.
- **Create Group Modal Avatars:** Friend list in create group modal now shows actual avatar images with profile frame overlays instead of initial-letter fallback.
- **Mobile DM Enhancements:** Long-press context menu includes View Profile. Close DM removes from `MStore.friends` permanently. Debug log button moved above nav bottom bar.
- **Dev Mode Hides Status:** CSS hides `.friend-status-dot`, `.chat-row-status-dot`, `#chat-header-info`, `.group-member-status` in dev mode.

### Bug Fixes
- **Context Menu `data-action` Broken:** `context-menu.js` looked up `data-action` attribute to find `item.onClick` — no item in the codebase ever set an `action` property. Rewritten to use DOM methods with closure-captured `item.onClick` directly.
- **Context Menu Not Attached:** The only `contextmenu` listener was inside `renderGroups()` — never executed if user never visited Groups tab. Moved to `attachEvents()` which runs at `init()`.
- **P2P Protocol Audit:** Fixed `isPeerConnected()` key mismatch (partial key match), protocol type strings (`MESSAGE_EDIT`/`EDIT_MESSAGE`, `READ`/`READ_RECEIPT`), TCP merge IP comparison (strip port).
- **Gallery Sidebar Files Tab Crash:** `window.Format.bytes(...)` threw TypeError — function is named `fileSize`. Replaced with correct call.
- **Gallery Sidebar `window.open()` for Custom Protocol:** `orbit-db://` URLs can't be opened in a new browser tab. Replaced with download button + `orbitAPI.downloadFile()` with `<a>` fallback.

### Technical
- **Protocol:** Added `GROUP_MEMBER_ADDED` and `GROUP_OWNER_TRANSFER` types to `shared/network/protocol.js`, `desktop/src/js/network/protocol.js`, and mobile copy.
- **Store:** Added `galleryViewMode: 'grid'` setting default. `handleIncomingPacket` handles `GROUP_MEMBER_ADDED` and `GROUP_OWNER_TRANSFER` on desktop and mobile.
- **Database:** Gallery view mode persisted via `dbSetSetting('settings', ...)`.
- **Debug Log Buffer:** Desktop `app.js` monkey-patches `console.log/warn/error/debug` at init, capturing last 500 entries into `window._debugLogBuffer`.
- **Version:** Bumped to `v0.0.9.3-beta`.

## v0.0.9.2-beta

### Changes
- **Mobile initP2P Logging:** Added verbose `debugLog()` calls throughout P2P initialization — server start, beacon build, discovery, incoming connections, message parsing, peer found/disconnected events. All logs feed an in-app scrollable overlay and console.
- **Dev Mode DevTools:** Enabling Developer Mode now dynamically loads [eruda](https://github.com/liriliri/eruda) — an on-device devtools panel with console, elements, network, sources, and more. Also shows a floating "P2P Log" button that opens the debug log overlay. Disabling Dev Mode destroys eruda and removes the button.
- **P2P Bridge Logging:** `p2p-mobile.js` now logs every method call — `getPlugin()`, `startServer()`, `connect()`, `send()`, `startDiscovery()`, `cleanup()` — with parameters and results for easy troubleshooting.
- **Version:** Bumped to `v0.0.9.1-beta` across mobile About tab, desktop Settings About tab, and changelog.
- **Version:** Bumped to `v0.0.9.2-beta` for P2P messaging fixes (Bug #1 and Bug #2).

## v0.0.9-beta

### Features & Enhancements
- **Android P2P Stability (10 fixes):** OrbitP2PPlugin.java — fixed `call.resolve()` moved before while loop (BUG-1), `MulticastLock` acquire/release (BUG-2), split `serverRunning`/`discoveryRunning` flags (BUG-3), `synchronized` sendLock (BUG-4), TCP buffer 64KB→4MB (BUG-5), self-beacon filter via `getLocalIPAddresses()` (BUG-6), 5s beacon interval with `lastBeaconTime` gating (BUG-7), `volatile MulticastSocket` + local copy (BUG-8). JS p2p-mobile.js — outbound connection tracking in `connect()` + `isPeerConnected()` (BUG-JS-1/2), 3s reconnect cooldown via `lastConnectAttempt` map (BUG-JS-3), `cleanup()` calls `removeAllListeners()` before re-init (BUG-JS-4).
- **Desktop P2P Stability (9 fixes):** SocketManager — per-connection write queue (`_enqueueWrite`/`_processQueue`) prevents TCP byte interleaving (BUG-DT-1), 4MB max payload guard (BUG-DT-2), socket error handler (BUG-DT-3), `connectToPeer()` returns Promise (BUG-DT-4). Discovery — self-beacon filter via `os.networkInterfaces()` local IP set (BUG-DT-5), `broadcastBeacon()` try/catch + `_started` guard + socket error handler (BUG-DT-6). TransferManager — `setImmediate` between chunks, `drain` event listener (BUG-DT-7), `readStream.on('error')` cancels transfer (BUG-DT-8). Main process — `network-stop` IPC + `setupNetworkInstances()` extracted for clean restart (BUG-DT-9).
- **Avatar in P2P Beacons:** Mobile `buildBeacon()` includes `avatar: u.avatar || null`; `onPeerFound` passes to new and existing friends. Desktop discovery.js includes `avatar` field for cross-platform parity.
- **Mobile Group Info Panel:** Full group management panel — avatar display with owner "Change" button (file picker → dataURL), editable group name (owner only), editable description, invite code with Copy/Share buttons, Pin/Mute toggles, pinned messages section, member list with role badges (Owner/Admin) + join dates, promote/demote buttons (owner), remove button (owner/admin). Leave/Delete broadcast GROUP_LEAVE. All via event delegation on `members-content`.
- **Cross-Platform Group Sync:** Group creation broadcasts `GROUP_CREATE` to each member with compatible payload. Messages broadcast via `_broadcastToGroupMembers()`. `onMessage` handler processes GROUP_CREATE (creates group + chat) and GROUP_LEAVE (removes member or self-deletes). Payloads compatible with desktop store.js handler.
- **Pinned Messages (Phase 3a):** `pinnedMessages: []` field added to group defaults, migration, and GROUP_CREATE handler. Pin/unpin button in message action bar (groups only). Toggle updates local store and broadcasts `PIN_MESSAGE`/`UNPIN_MESSAGE` with `msgId`, `groupId`, `text`, `pinnedAt`. P2P receiver handles both types. Desktop store.js now sends `groupId` in pin/unpin payloads. Pinned messages section renders in group info with scroll-to-message on click.
- **Message Search (Phase 3c):** Search icon button in mobile chat header. Toggles a search bar that filters messages in real-time by text content.
- **Member Join Dates (Phase 3b):** Group member list shows "Joined Jan 15, 2026" date under each member name.
- **Share Button:** `#btn-group-share-invite` button in invite code row. Auto-generates invite code if missing, sends invite text as chat message in current chat, broadcasts to group members. Desktop sidebar-middle share button fixed.
- **Enhanced Message FX:** Bubble bounce animation with glow shadow + inline confetti particle system (circles, burst directions, staggered delays, auto-clean after 1.2s). Desktop and mobile both updated. Uses safe CSS: `rgba()` instead of `color-mix()`, no `overflow:hidden` on feed, no `clip-path` particles.
- **Mobile Settings Added:** Font Size (Small/Medium/Large → `data-font-size` on `<html>` resizes bubbles, input, member names, chat rows). Message Animation (Slide/Fade → `data-msg-anim` on each row). Auto-Reconnect toggle. Connection Timeout (5/10/30/60s). All wired with defaults, UI rendering, and event bindings.
- **Add Friend on Android Fixed:** `isAvailable()` gating removed from `confirmAddFriend()` — no more "P2P Preview" blocking message. `getPlugin()` retry mechanism added for resilient plugin acquisition. `android:usesCleartextTraffic="true"` added to AndroidManifest.xml (required for TCP sockets on Android 9+).

### Bug Fixes
- **Mobile DB Identity Corruption:** `_migrateGroups()` was called before `this.user` was loaded from localStorage — calling `this.save()` there wrote `undefined` for the user key, regenerating user ID on every restart. Fixed by moving migration after `this.user = this.get('user', null)` in `load()`.
- **Desktop `require('crypto')` Error:** `require('crypto')` is undefined in Electron renderer process. Replaced with `window.crypto.getRandomValues()` in sidebar-middle.js.
- **Desktop PIN_MESSAGE Without groupId:** Desktop store.js `pinMessage()`/`unpinMessage()` was missing `groupId` in the pin/unpin payload. Added `groupId` field for cross-platform routing.
- **Message FX CSS Compatibility:** `color-mix()` CSS function unsupported on older Android WebViews — replaced with `rgba()`. `overflow:hidden` on message feed caused layout lockup — removed. `clip-path` star shapes replaced with simpler sparkle approach.

### Mobile
- **Mobile DB Migration:** `_migrateGroups()` upgrades existing groups adding `ownerId`, `description`, `inviteCode`, `pinned`, `notificationMuted`, `pinnedMessages`, and converts `members` from `string[]` to `{userId,role,joinedAt}[]` objects.
- **All `crypto.getRandomValues()` → `window.crypto.getRandomValues()`** for Android WebView compatibility.
- **New Settings UI:** Added `renderSectionHtml`/`bindSectionEvents` for Font Size (Appearance), Message Animation (Chat), Auto-Reconnect + Timeout (Network).

### Technical
- **OrbitP2PPlugin.java:** `acquireMulticastLock()`/`releaseMulticastLock()` — without this Android drops all multicast UDP at WiFi hardware level. TCP framing uses 4-byte length prefix + JSON, compatible with desktop's Node.js Buffer approach.
- **Desktop SocketManager:** Per-connection write queues (`_enqueueWrite`/`_processQueue`) — prevents byte interleaving on length-prefixed TCP stream when multiple writes happen in quick succession.
- **Protocol:** `shared/network/protocol.js` updated with `PIN_MESSAGE` and `UNPIN_MESSAGE` message types.
- **Android Manifest:** Added `android:usesCleartextTraffic="true"` — required for `new Socket().connect()` on Android 9+.
- **Version:** Bumped to `0.0.9-beta` across mobile About tab, desktop Settings About tab, and all manifests.

## v0.0.8-beta

### Features & Enhancements
- **Link Previews v2:** Rich preview cards now fetch Open Graph metadata (title, description, image) from shared URLs via Electron IPC. Cards auto-expand to message bubble width, with colored left accent bar, hover/active link color states (white → dark blue → green), and CSS-class-based styling. New "Link Previews" toggle in Chat settings. Mobile link previews added with styled cards and clickable URL text.
- **Message Link Styling:** URLs in message text now render as actual `<a>` tags with hover (dark blue `#1a3a6b`) and active (green `#2d7a2d`) color states. Own messages show links in white by default. Mobile received the same `linkifyText()` treatment.
- **Cross-Platform P2P Connectivity:** Desktop and Android now discover each other via LAN multicast beacons and establish TCP connections. Mobile `initP2P()` rewritten with beacon build/discovery, auto-adds friends, auto-creates chats, and handles TYPING/REACTION packets.
- **Desktop Protocol Compatibility:** `shared/network/protocol.js` (and mobile copy) unified with `BEACON` type and `from` field. Desktop `discovery.js` and `socket.js` accept `packet.from || packet.senderId` for self-filtering and peer registration.
- **QR Code Generation Fix (Both Platforms):** Root cause was `window.QRCode` not being properly exposed — desktop unpkg `qrcode.js` set global `qrcode` but not `window.QRCode`; mobile library called `qrcode()` (instance) instead of `qrcode` (constructor). Both fixed with proper direct `QRCode(0, 'M')` call.
- **Mobile QR Code Relocated:** Removed from profile overlay, added as "My QR" tab in Add Friend modal. QR renders on first tab switch.
- **QR Scanner Performance:** Added `{ willReadFrequently: true }` to `getContext('2d')` in `scanFrame()` — eliminates repeated `getImageData` console violation.
- **Desktop Settings Tabs:** Notifications (volume slider 0–100%, sound type select, test button), Network (restyled collapsibles + timeout/keep-alive/auto-reconnect/bandwidth), About (version/electron/node info, GitHub link, report-issue link).
- **Chat Background Patterns:** Added Diagonal Stripes, Crosshatch, Circles. Diagonal Stripes fixed by removing conflicting `background-size`.
- **Empty State Icons:** Added `wifi-off` to "No friends online", `user-x` to "No friends available", `radio` to "No peers online" (Network tab).
- **Mobile Toast Overhaul:** Type-based left accent bar, lucide icons per type (info/success/error/warning), slide-in animation, progress bar that shrinks over duration.
- **Mobile Modal Tabs:** Add Friend modal now has "Add Friend" and "My QR" tabs. Create Group hides tabs and uses the Add Friend tab content.
- **Mobile Settings Wired:** All settings now have real behavior — `timeFormat24` (12h/24h toggle), `showChatAvatars` (hide chat list avatars), `showImagePreviews` (toggle inline image rendering), `notifyDnd`/`notifyPreview`/`notifySound`/`notifyGroupMentions` (notification controls), `showMessageIds` (message IDs in bubbles), `devMode`/`debugDisplay`/`showConnectionStats` (debug overlay), `logNetworkPackets` (console P2P logging), `maxFileSize` (file size enforcement), `experimentalCompactSpacing` (CSS data attribute), `deleteAttachmentsAfter` (auto-cleanup timer), `networkMode` (show/hide port fields), experimental toggles (CSS data-* attributes).
- **Mobile Notification Sound:** Plays a short 660Hz beep via Web Audio API on incoming P2P messages when `notifySound` is enabled.
- **Clear Network Cache Button:** Now calls `window.orbitAPI.networkStart(user)` to reset discovery/socket connections.

### Bug Fixes
- **Desktop `positionCard()` brace mismatch** — Fixed syntax error in card layout logic.
- **Desktop `contentTypeFromAtt()` MIME mapping** — Added proper MIME types for 6 protocol handler paths, fixing Chromium rejection of custom-protocol image loads.
- **Desktop `cacheHeaders()`** — Added `Cache-Control: no-cache, no-store, must-revalidate` on all `orbit-db://` responses to prevent stale cached error responses.
- **Desktop `handleMediaError`** — Added auto-retry for media load failures.
- **Desktop `sendMessage()`** — Now always uses `orbit-db://` URLs with `path: file.path || file.name` fallback; removed blob URL fallback to avoid `ERR_FILE_NOT_FOUND`.
- **Add Friend Modal + Create Group Modal** — `showCreateGroup()` hides tab bar and shows Add Friend content; `resetModalToAddFriend()` restores tab state. Removed duplicate `modalInput.onkeydown` assignments.
- **Diagonal Stripes Pattern** — Removed conflicting `background-size` that created visible tile boundaries.
- **Mobile Create Group Modal** — Fixed bug where modal showed with wrong tabs/corrupted state.

### Technical
- **OG Metadata Fetch:** Added `ipcMain.handle('fetch-og')` in `main.js` — fetches page HTML via Electron `net.fetch`, parses `<title>`, `og:title`, `og:description`, `og:image` with 5s abort timeout. Results cached in `window._linkPreviewCache`.
- **Message Link Sanitization:** Desktop `sanitize.js` URL regex now uses class `msg-link` instead of inline styles. Mobile added `linkifyText()` helper for the same purpose.
- **Mobile `initP2P()`:** Full rewrite with `buildBeacon()`, LAN discovery, desktop-compatible beacon parsing, auto-add friend + create chat, auto TCP connect, handles both `from`/`senderId` fields, TYPING/REACTION support, friend status update on disconnect.
- **Mobile Beacon Format:** Passed as JS object to Java plugin — `call.getObject("beacon", ...)` required for correct deserialization.
- **TCP Framing:** 4-byte length prefix + JSON encoding is compatible between desktop (Node.js `Buffer`) and mobile (Java `DataInputStream`/`DataOutputStream`).
- **Store Defaults:** Added `showLinkPreviews: true` to both desktop and mobile default settings.
- **Version:** Bumped to `0.0.8-beta` across all manifests and About tabs.

## v0.0.7-beta

### Features & Enhancements
- **First-Time User Tutorial:** An 8-page Welcome Tour introduces new users to Orbit's core concepts — chats, file sharing, LAN/Wi-Fi modes, groups, search, privacy, and settings. Skippable at any time, replayable from Settings → About → Welcome Tour. Tutorial state (`tutorialCompleted`, `tutorialSkipped`, `showTutorialOnStartup`) persists across restarts.
- **Link Previews:** URLs in chat messages are automatically detected and rendered as rich preview cards below the message bubble, showing the domain name and a styled placeholder. Cards adapt to the user's bubble theme.
- **Activity Center Overhaul:** Transformed from a basic grouped-chat modal into a unified notification timeline with four tabs — All (chronological stream of all messages), Mentions (`@username` and `@everyone`), Files (shared attachments), and System (peer connect/disconnect events). Includes "Clear All" dismissal that sets a timestamp marker without deleting actual data. Clicking an event card navigates directly to the message in chat.
- **Shared Media Gallery:** The right-side Image Gallery panel has been completely rewritten into a tabbed "Shared Media" hub with three views — Images (grid with hover overlays showing sender name and zoom action), Files (list with type-aware icons for audio/video/document), and Links (extracted URLs with domain parsing). All content is grouped chronologically with sticky date headers (Today, Yesterday, Month Year).
- **Privacy Mode Overhaul:** `saveAttachment()` now correctly passes `localPath` to the database for backup restore compatibility. Gallery sidebar thumbnail URL generation fixed for `orbit-file://` URLs. Thumbnail generation added for privacy mode via `sharp`. Privacy mode indicator badge added to the chat header.
- **Android Port Architecture:** Project restructured into `desktop/`, `mobile/`, and `shared/` directories. Cross-platform abstraction layer built — `shared/core/env.js` (runtime detection), `shared/database/` (factory + SQLite implementations), `shared/network/protocol.js` (packet definitions), `shared/crypto/e2ee-desktop.js` (E2EE wrapper), `shared/utils/` (format, sanitize). Mobile UI shell created with Capacitor Android build pipeline (`npx cap sync android` succeeds).
- **System Activity Log:** New `addSystemLog()` method on the store tracks peer connections, disconnections, and discoveries with timestamped entries. Displayed in the Activity Center's System tab.
- **Version Info in About Tab:** Electron and Node.js versions are now correctly exposed via the preload bridge (`orbitAPI.electronVersion`, `orbitAPI.nodeVersion`) and displayed in Settings → About.

### Bug Fixes
- **Attachment 404 on New Images:** Fixed empty buffer being stored in DB — attachment data now properly passes through the `addMessage` pipeline with `localPath` fallback.
- **Privacy Mode File Loading:** Strengthened `localPath` → `orbit-file://` fallback chain for reliable image loading when DB blob is empty.
- **Autofill.enable DevTools Error:** Suppressed Electron 32 DevTools protocol quirk.
- **orbit-avatar:// Blocked by CSP:** Added `orbit-avatar:` to `img-src` and `media-src` CSP directives.
- **Search Modal Autofocus Blocked:** Deferred `.focus()` call with `setTimeout` to avoid focus contention.
- **Join Group Tab UI Issues:** Fixed Lucide icon not rendering on tab switch, cramped button layout, short content area, and tab text clipping.
- **self.showAddFriendModal Not a Function:** Added missing `var self = this;` closure in sidebar-middle.js.
- **msg.id.substring Not a Function:** Coerced `msg.id` to string before calling `.substring()`.
- **Settings Account Tab Crash:** Fixed `s is undefined` error when reading `experimentalProfileFrames` (missing `self` reference).
- **Chat Wallpaper Pattern Bug:** Removing a custom wallpaper image now correctly falls back to the selected background pattern without requiring a full app restart. Settings updates now route through `window.App.applySettings()` as a single source of truth.

### Technical
- **Preload Bridge:** Added `electronVersion` and `nodeVersion` to `orbitAPI` exposure. Updated fallback version string to `0.0.7-beta`.
- **Store:** Added `addSystemLog(type, message)` method with 100-entry rolling buffer. `addOrUpdatePeer()` now emits system logs on peer status changes (connect/disconnect/discover). Added `activityClearedAt` and `systemLogClearedAt` state fields for Activity Center dismissal.
- **Settings Modal:** Refactored `updateSettings` to trigger `window.App.applySettings()` globally, ensuring consistent CSS variable application. Removed redundant inline DOM manipulation from button listeners.
- **Changelog Component:** Added v0.0.7-beta entry as latest; demoted v0.0.6-beta.

## v0.0.6-beta

### Features & Enhancements
- **Custom Themes:** New "True Dark" theme (neutral grays + blue accent) replaces the old dark theme. Old dark renamed to "Dark Purple". Added pre-made themes: Midnight, Sunset, and Nord. Seasonal theme auto-rotates by meteorological season (4 CSS files).
- **Custom Colors Modal:** Live preview color editor for all UI color categories — backgrounds, surfaces, text, accents, borders, status, and shadows. Integrated with theme system.
- **Dev Mode Master Gate:** Developer Tools and Experimental Features are now separate collapsible sections in the Advanced tab. Dev Mode must be enabled first — it acts as the master gate controlling visibility of both sections.
- **Profile Frames:** 12 decorative frame overlays (PNGs) on avatars in the chat feed. New "Profile Frame" collapsible section in Account tab between "Profile" and "Avatar & Banner". Frame picker uses actual frame previews. Frame sync is broadcast via discovery.js and persisted to user identity. (Experimental)
- **Animated Avatars:** Subtle pulse animation applied to all avatars in the chat feed. (Experimental)
- **Enhanced Message FX:** Sparkle/stars animation on sent messages with CSS keyframes. (Experimental)
- **Message Translate:** Translate button appears on message hover — opens an inline translation panel using the MyMemory API. Source/target language auto-detection. (Experimental)
- **Compact Spacing:** Tighter message layout via a CSS class that reduces padding, margins, font sizes, and bubble gaps. (Experimental)
- **App Zoom:** Slider with a mini UI preview mockup that scales in real time. Zoom no longer applies dynamically (was breaking UI) — instead saves the value and shows a toast asking the user to restart. Applies on next launch via `webFrame.setZoomLevel()`.
- **Chat Input Shadow:** Theme-adaptive `box-shadow` on the chat input area (`0 -4px 12px rgba(0,0,0,0.06), var(--shadow-md)`).
- **Chat Settings:** Three new toggles in Appearance → Chat: Enter to Send (send on Enter instead of Shift+Enter), Show Avatars (toggle avatars in chat feed), Image Previews (toggle inline image rendering).
- **Orbit Echo Bot:** The "Orbit Echo" test account is now always inserted into the database on initialization — guaranteed to appear even when other friends exist. It remains unloginable and serves as a local echo channel for testing.
- **Toast Notification Types:** `Window.Toast.show()` third parameter now accepts a type string (`"info"`, `"success"`, `"warning"`, `"error"`) which renders the corresponding Lucide icon (info, check-circle, alert-triangle, alert-circle).

### Bug Fixes
- **Settings Account Tab Crash:** Fixed `s is undefined` error when interacting with collapsible sections or frame picker in the Account tab (missing `self` reference in settings-modal.js:145).
- **Profile Frame Positioning:** Fixed spacing bug in frame picker where frames were positioned incorrectly. Fixed `position:relative` on the avatar container overriding the frame's `position:absolute` layout.
- **Frame 1 Missing:** Frame file `ProfileFrame_1.png` doesn't exist — frame picker skips index 1 and loops from 2 to 13.

### Technical
- **Profile Frames:** Added `Window.Frames` helper object in `app.js` with `getList()`, `getFrameUrl(index)`, `getApplied()`, `apply()` methods. Frame data broadcast in discovery beacon as `frames` field. Frame index synced to `currentUser.frame` in store and saved to identity.
- **Settings Restructure:** Advanced tab split into "Developer Tools" and "Experimental Features" collapsible sections. Dev Mode toggle controls visibility of both sections via `display: block / none`. Experimental toggles display yellow "EXPERIMENTAL" pill badges.
- **Changelog:** In-app changelog (`src/js/components/changelog.js`) updated with all v0.0.6-beta entries.
- **README:** Updated with v0.0.6-beta version, new feature listings, and roadmap additions.

## v0.0.5-beta — **Stable Release**

### Features & Enhancements
- **Transfer Resilience:** File transfers now include retry logic (3 retries with exponential backoff), transfer timeout (60s stale cleanup), cancel buttons on progress bars, and error toasts for failed sends/receives.
- **Disk Space Check:** Receiving peers now check available disk space before accepting a transfer — rejects with `FILE_TRANSFER_REJECT` if insufficient space.
- **Transfer Cancellation:** New `FILE_TRANSFER_CANCEL` protocol message and IPC handler — users can cancel in-progress transfers via X button on progress bars.
- **Transfer Error UI:** Errors now surface as Toast notifications and inline error banners (with dismiss) instead of silent console logs.
- **File Size Enforcement:** User's `maxFileSize` setting (default 500MB) is now enforced at send time — oversized files are skipped with a Toast warning.
- **Transfer Timeout:** Active receive transfers that are inactive for 60+ seconds are automatically cleaned up (temp files deleted, memory freed).
- **Storage Validation & Repair:** New "Repair Database" feature in Settings > Data Manager that rebuilds indexes, removes orphaned records (messages, attachments, group members), and fixes journal mode.
- **Data Manager Tab:** Merged "Privacy & Storage" into the renamed "Data Manager" tab — Privacy Mode toggle, auto-delete attachments, clear attachments, backup/restore, health check, and repair all in one place.
- **Group Roles:** Introduced `role` column in `group_members` (owner/member). Owners get an "Owner" badge in the Group Info panel. Only the owner can delete the group and remove members.
- **Group Context Menu Rework:** Replaced inline `oncontextmenu` with proper event delegation. Features: Pin/Unpin, Group Info, Copy Invite Code, Leave Group (with network notification), and Delete Group (owner only, with network notification).
- **Remove Member (Owner):** Owners can remove non-owner members via an ✕ button next to each member in Group Info. Removed members receive a `GROUP_LEAVE` notification.
- **Leave Group Notification:** When a member leaves a group, a `GROUP_LEAVE` packet is broadcast to remaining members so they see a "Member Left" Toast.
- **Delete Group Notification:** When the owner deletes a group, all members receive a `GROUP_LEAVE` notification.
- **Join Request Toast:** When someone requests to join a group via invite code, the owner now sees a Toast notification with the requester's name.
- **Role Badges:** Member list in Group Info now shows "Owner" badge next to the group owner's name.
- **Join Request Accept/Deny Modal:** Group owners now see a ConfirmModal with Accept/Deny when someone requests to join — no longer auto-accepts silently.
- **Clickable Invite Codes in Chat:** Known invite codes appearing in chat messages are rendered as inline clickable chips with a "Join" button — opens the Join modal pre-filled with the code.
- **Share Invite in Chat:** New "Share" button in Group Info copies the invite code into the current chat as a formatted message.
- **Pre-filled Join Tab:** Clicking an invite code in chat automatically opens the Create/Join modal on the Join tab with the code pre-filled.
- **Group Row Polish:** Last message preview in the sidebar now shows sender name ("You: ..." or "Username: ..."). Online member count is displayed (e.g., "3 online, 10 members").

### Database
- **v7 Migration:** Added `role TEXT DEFAULT 'member'` column to `group_members`. Backfills owner roles from `groups.ownerId`.
- **repairDatabase():** New method on OrbitDatabase that runs VACUUM + REINDEX, fixes orphaned group_members/messages/attachments, and ensures WAL journal mode.

### Bug Fixes
- **Duplicate `addMemberToGroup`:** Fixed duplicate method definition in `store.js` (second definition overwrote first, causing double IPC calls).

### Technical
- **IPC Layer:** Added `cancel-transfer`, `check-disk-space`, `db-repair` IPC handlers and corresponding preload API methods. Added `transfer-error` event for renderer-side error display.
- **Protocol:** Added `FILE_TRANSFER_CANCEL`, `FILE_TRANSFER_REJECT`, and `GROUP_LEAVE` message types.
- **TransferManager:** Added `destroy()`, `cancelReceive()`, `cancelSend()`, `_cleanupStale()`, `_hasDiskSpace()` methods. Chunk sends now retry up to 3 times with backoff. `onError` callback propagates failures to renderer.
- **Store:** Added `transferErrors` state and `handleTransferError()` helper with auto-dismiss after 10s. `handleIncomingPacket` now processes `GROUP_LEAVE`. Fixed duplicate `addMemberToGroup`.
- **Settings Sidebar:** Removed standalone "Privacy & Storage" tab; renamed "Data" to "Data Manager".
- **sidebar-middle.js:** Group context menu uses programmatic event handler with proper object references instead of fragile inline HTML strings.

### Commits in this release

- `254be18` v0.0.5-beta — Stable Release
- `88d6324` fixed bug... (post-release fix)
- `5b7da42`, `160b963`, `c3a9a56` — fixes / README (post-release)

## v0.0.4-beta

### Features & Enhancements
- **Advanced Settings Tab:** New "Advanced" tab with 6 toggles — Developer Mode, Debug Display (hover-to-inspect overlays on all UI), Show Message IDs, Log Network Packets, Show Connection Stats, and Experimental Features.
- **Debug Display Overlays:** All UI elements (messages, reactions, replies, search results, friend/group list rows) now carry `data-debug` attributes — when Debug Display is enabled, hover any element to reveal a polished tooltip with its internal state, IDs, and metadata.
- **Connection Stats Overlay:** Live debug panel showing connection status, peer count, uptime, and bytes sent/received.
- **Group Avatar Real-Time Updates:** Uploading a group avatar now updates the sidebar, chat header, and group info panel instantly without restart — uses `avatarUpdatedAt` timestamp for cache busting.
- **Modernized Create/Join Group Modal:** Restyled with pill-style segmented tabs, icon headers, proper breathing room padding (40px sides), and separated footer with consistent button sizing.
- **Modernized Add Friend Modal:** Extracted into a dedicated `showAddFriendModal()` with icon header, descriptive subtitle, proper padding, and consistent footer layout.
- **Search Modal Focus Polish:** Removed jarring purple box-shadow on focus — replaced with a subtle animated underline accent.

### Bug Fixes
- **Add Friend Button Not Working:** `prompt()` is blocked in Electron 32 sandbox — replaced with a custom inline modal overlay. Added `orbitAPI.connect` IPC through preload.js and a `network-connect` handler in main.js.
- **Create Group Button Out of Place:** Minimized `+` icon is now inline with the "Groups" header label, matching the DMs "Add Friend" button style exactly.
- **Group Avatar Not Updating in Real-Time:** Images were cached by the browser — added `?t=<avatarUpdatedAt>` cache buster to all `orbit-avatar://` URLs, and `save-avatar` IPC now updates the timestamp in DB.
- **`self.showAddFriendModal` Not a Function:** `renderList()` was missing `var self = this;` — added it.
- **Debug List Row Badge Clipped by Left Sidebar:** Moved debug badge from `left:-1px` to `right:-1px` with higher z-index to avoid panel overflow clipping.

### Database
- **v6 Migration:** Added `avatarUpdatedAt INTEGER` column to `groups` table for real-time avatar cache busting.

### Technical
- **IPC Layer:** Added `network-connect` IPC handler calling `socketInstance.connectToPeer()`. Added `avatarUpdatedAt` field to `saveGroup` prepared statement.
- **CSS Debug Display System:** Comprehensive `.debug-display` class system — hover-reveal tooltips using `::after`/`::before` pseudo-elements with app design tokens (`--bg-surface`, `--border-subtle`, `--accent-primary`), smooth opacity transitions, and element-specific positioning.
- **Settings Toggles:** 6 new settings (`devMode`, `debugDisplay`, `showMessageIds`, `logNetworkPackets`, `showConnectionStats`, `enableExperimental`) with CSS class toggles on `<html>` via `applySettings()`.
- **Cross-Platform Builds:** Added `build:mac`, `build:linux`, `build:all` npm scripts. Updated `electron-builder.yml` with macOS DMG (x64 + arm64), Linux AppImage + `.deb` targets, platform-specific metadata, and file exclusion rules.
- **GitHub Actions CI/CD:** New `.github/workflows/build.yml` — builds Windows, macOS, and Linux in parallel on tag push (`v*`), then creates a GitHub Release with all platform artifacts automatically.

## v0.0.3-beta

### Features & Enhancements
- **Group Chat:** Full multi-peer group messaging with database persistence — create groups with a friend picker modal, broadcast messages to all members, and view group-aware chat headers with member counts and overlapping avatars.
- **Group Info Panel:** Right-click any group in the sidebar to view/edit group name, description, invite code, pin status, notification mute, member list, and avatar.
- **Group Avatar Upload:** Upload custom group avatars via file picker — stored as file path references and rendered via `orbit-avatar://` protocol.
- **Pinned Groups:** Pin important groups to the top of the sidebar with a pin badge indicator.
- **Profile Sidebar:** Click any message avatar or friend avatar to open a dedicated right-side profile panel showing banner, avatar, username, tag, online status, bio, and user ID.
- **System Theme Option:** New "System" theme setting that follows the OS dark/light mode preference with live `matchMedia` listener.
- **Settings — Notifications Tab:** Toggles for notification sound, message preview, @mentions-only mode, and Do Not Disturb.
- **Settings — About Tab:** App name, version, user stats, and app icon.
- **Notification Sounds:** Short pleasant chime generated via Web Audio API (no audio files needed) — plays on incoming messages when sound is enabled and DND is off.
- **Toggleable Middle Sidebar:** Collapse the friend/group sidebar with a toggle button; floating re-open button appears on the right panel edge when hidden. CSS transition animation on grid layout.
- **Message Timestamp Position:** Timestamps now appear below the message bubble instead of above — left-aligned for sender, right-aligned for receiver.
- **Sender Bubble Layout:** Removed "You" label from group sender messages; avatar wrapper uses `padding-bottom` to offset bubble below avatar.
- **Message Reactions:** Added emoji reactions to messages — hover to reveal the reaction button, pick from 8 common emojis, and see reaction counts below each message.
- **Drag-and-Drop Uploads:** Drag files and images directly into the chat panel — the input area dims to indicate drop zone, and staged files appear in the preview bar.
- **Enhanced Markdown:** Extended markdown support with `###`/`####` headings, `~~strikethrough~~`, `>` blockquotes, `-` unordered lists, `1.` ordered lists, and fenced code blocks.
- **Privacy Mode Temp Storage:** Attachments in privacy mode are now saved to `{userData}/temp/` and served via `orbit-file://` protocol, with automatic cleanup on app exit.
- **Persistent Mode Reliability:** Attachments in persistent mode now include proper error handling around file reads, ensuring data isn't silently lost if temp files are removed.

<p align="center">
  <img src="desktop/src/icons/screenshots/preview-group-dark.png" alt="Group chat (dark)" width="360">
  <img src="desktop/src/icons/screenshots/preview-group-light.png" alt="Group chat (light)" width="360"><br>
  <em>Group chat</em>
</p>

<p align="center">
  <img src="desktop/src/icons/screenshots/preview-group-info-dark.png" alt="Group info (dark)" width="360">
  <img src="desktop/src/icons/screenshots/preview-group-info-light.png" alt="Group info (light)" width="360"><br>
  <em>Group info panel</em>
</p>

### Bug Fixes
- **Empty Buffer Truthy Bug:** Protocol handlers (`orbit-db://`) no longer treat `Buffer.alloc(0)` as valid data — added `.length > 0` checks to both attachment and thumbnail handlers, returning proper `404` for empty blobs.
- **Privacy Mode File Loading:** Fixed `orbit-db://` protocol to fall back to `att.localPath` filesystem path when the database blob is empty, enabling reliable image loading in privacy mode.
- **Windows Path Resolution:** Fixed `orbit-file://` protocol handler to convert backslashes to forward slashes on Windows, resolving `file:///C:\...` → `file:///C:/...` format.
- **Cleanup Timer Default:** Changed attachment cleanup default from 525,600 minutes (365 days) to `0` (Never), preventing unexpected data loss when `deleteAttachmentsAfter` isn't explicitly set.
- **Received File Size:** File size is no longer hardcoded to `0` — the actual file size now passes through the transfer pipeline via `onComplete(fileSize)` callback and `file-received` event.
- **Sender Attachment ID:** Local sender messages now include a stable `id` field on attachment objects, ensuring database inserts use consistent primary keys.
- **Image Forwarding:** Forwarding images via the gallery viewer now preserves attachment `id` and `path`, preventing data loss on the forwarded copy.
- **URL Selection:** `getMessages()` and `getAllMessagesRaw()` now return `orbit-file://` URLs for attachments with `localPath` set, matching the correct storage mode.
- **Bio Persistence on Migration:** The v2 identity migration now preserves the existing `bio` field (`identity.bio || ''`) instead of hardcoding an empty string.
- **CSP for Avatar Protocol:** Added `orbit-avatar:` to `img-src` and `media-src` Content Security Policy to allow custom group avatar rendering.
- **Profile Sidebar Close:** Fixed `self` variable scoping where `self.close()` in the render function resolved to `window.self.close()` (closing the whole Electron window) instead of the ProfileSidebar method.

### Database
- **v3 Migration:** Added `groups` and `group_members` tables for group chat persistence.
- **v4 Migration:** Added `localPath TEXT` column to `attachments` table for privacy mode temp file references.
- **v5 Migration:** Added `avatarPath TEXT`, `description TEXT`, `pinned INTEGER DEFAULT 0`, `notificationMuted INTEGER DEFAULT 0`, and `inviteCode TEXT` columns to `groups` table.

### Technical
- **IPC Layer:** Added 6 new group CRUD IPC handlers (`db-get-groups`, `db-save-group`, `db-add-group-member`, `db-remove-group-member`, `db-get-group`, `db-get-group-members`) and corresponding preload API methods.
- **Socket Manager:** Added `broadcastToGroup()` method for sending packets to multiple group members simultaneously.
- **Store:** Added `addGroup()`, `removeGroup()`, `addMemberToGroup()`, `getGroupMembers()`, `sendReaction()`, `updateGroupField()`, `removeGroupMember()` methods; `GROUP_CREATE` and `REACTION` packet routing.
- **Notification Sound:** Added `window.NotificationSound` Web Audio API utility — generates a two-tone chime oscillator without external audio files.

## v0.0.2-beta

### Features & Enhancements
- **Persistent Storage:** Replaced ephemeral JSON storage with a robust `better-sqlite3` database for scalable, permanent message and media archiving.
- **Privacy Mode:** Added an Attachment Storage toggle in Settings. When enabled, attachments are kept in temporary storage and deleted upon closing the app, while messages and profile data remain intact.
- **Storage Management:** Added a "Clear All Saved Attachments" button in Settings to permanently delete attachment BLOBs.
- **Large File Support (250MB):** Replaced legacy JSON serialization with chunked TCP streaming, drastically reducing RAM spikes and allowing files up to 250MB to transfer flawlessly.
- **Data Integrity:** Implemented SHA-256 hash generation and validation during file transfers to prevent file corruption.
- **WebP Compression & Caching:** Added `sharp` to automatically generate highly compressed WebP thumbnails of image attachments on ingestion for vastly improved Gallery Sidebar performance.
- **Offline Reliability:** Direct P2P files now ingest straight into the SQLite database and are served securely to the UI via custom `orbit-db://` protocol handlers.

### Bug Fixes
- Resolved critical bug where received images would result in a "Not Found" error upon refreshing the page.
- Fixed duplicate author metadata in `package.json` that warned during compilation.
- Resized application icons to `256x256` to pass strict Electron-Builder validations.

## v0.0.1-beta *(Original Release)*

### Initial Release
- Core P2P chat functionality using raw sockets.
- File and image sharing capabilities.
- Local network Auto-Discovery.
- Customizable user profiles, avatars, and UI themes.
- Initial ephemeral JSON storage backend.
